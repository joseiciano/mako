import {
  RecordingStopRepository,
  type OverdueRecordingRow,
  type SweepRetryWindow,
} from './recording-stop-repository'
import {
  RealtimeRecordingError,
  type RealtimeRecordingProvider,
} from './realtime-recording-provider'

const START_CLAIM_FRESH_MS = 60_000

/** A session lasts 60 minutes; recordings still open after this are closed. */
export const RECORDING_MAX_AGE_SECONDS = 3600

export type CloseOverdueResult =
  | { outcome: 'resolved' }
  | { outcome: 'closed' }
  | { outcome: 'failed' }
  | { outcome: 'early'; dueAtMs: number }

/**
 * After this many failed attempts a sweep row is retried only every
 * SWEEP_SLOW_RETRY_MS and every failure logs an error as an alert signal.
 */
export const SWEEP_FAST_ATTEMPTS = 12
export const SWEEP_SLOW_RETRY_MS = 30 * 60_000
/** Rows older than this are abandoned by the sweeps. */
export const SWEEP_GIVE_UP_MS = 24 * 60 * 60_000

export type RecordingStopLogger = {
  error(event: string, context: Record<string, unknown>): void | Promise<void>
}

export type StopHandoffOutcome = 'processed' | 'no_handoff' | 'retry'

/**
 * Consumes the durable stop handoff written by the completion transaction.
 * Idempotent and retry-safe: per-recording checkpoints (stop_requested_at,
 * stop_confirmed_at) are persisted, already-stopped recordings count as
 * stopped, and the handoff is marked processed only after every recording is
 * confirmed. Throws never; transient provider failures return 'retry'.
 */
export class RecordingStopService {
  constructor(
    private readonly repository: RecordingStopRepository,
    private readonly provider: RealtimeRecordingProvider,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly logger: RecordingStopLogger = { error() {} },
  ) {}

  private retryWindow(now: string): SweepRetryWindow {
    const time = new Date(now).getTime()
    return {
      fast_attempts: SWEEP_FAST_ATTEMPTS,
      slow_retry_before: new Date(time - SWEEP_SLOW_RETRY_MS).toISOString(),
      created_after: new Date(time - SWEEP_GIVE_UP_MS).toISOString(),
    }
  }

  async processStopHandoff(interviewId: string): Promise<StopHandoffOutcome> {
    const now = this.now()
    const handoff = await this.repository.getUnprocessedHandoff(
      interviewId,
      new Date(new Date(now).getTime() - START_CLAIM_FRESH_MS).toISOString(),
    )
    if (!handoff) return 'no_handoff'

    // A start is mid-flight: its recordings are not persisted yet, so a stop
    // now would be missed. The start stops itself if the interview completed.
    if (handoff.start_in_flight) {
      await this.recordHandoffFailure(interviewId, 'start_in_progress', now)
      return 'retry'
    }

    let failureCode: string | null = null
    const knownProviderIds = new Set<string>()

    const recordings = await this.repository.listRecordings(interviewId)

    // Nothing was ever started: no provider call, so feedback never depends
    // on provider availability for interviews without recordings.
    if (
      recordings.length === 0 &&
      (handoff.recording_status === 'not_started' || handoff.recording_status === 'failed')
    ) {
      await this.repository.markHandoffProcessed(interviewId, this.now())
      return 'processed'
    }

    for (const recording of recordings) {
      knownProviderIds.add(recording.provider_recording_id)
      if (recording.stop_confirmed_at) continue

      await this.repository.markStopRequested(recording.id, this.now())
      const code = await this.stopProviderRecording(recording.provider_recording_id)
      if (code) {
        failureCode = code
        continue
      }
      await this.repository.markStopConfirmed(recording.id, this.now())
    }

    if (handoff.realtime_session_id) {
      try {
        const active = await this.provider.listActiveRecordings({
          meetingId: handoff.realtime_session_id,
        })
        for (const orphan of active) {
          if (knownProviderIds.has(orphan.id)) continue
          const code = await this.stopProviderRecording(orphan.id)
          if (code) failureCode = code
        }
      } catch (error) {
        if (!(error instanceof RealtimeRecordingError) || error.code !== 'invalid_meeting') {
          failureCode = toCode(error)
        }
      }
    }

    if (failureCode) {
      await this.recordHandoffFailure(interviewId, failureCode, this.now())
      return 'retry'
    }

    await this.repository.markHandoffProcessed(interviewId, this.now())
    return 'processed'
  }

  /** Returns the interview ids whose handoff was processed by this sweep. */
  async sweepStopHandoffs(input: { olderThan: string; limit: number }): Promise<string[]> {
    const ids = await this.repository.listUnprocessedHandoffInterviewIds({
      older_than: input.olderThan,
      limit: input.limit,
      retry: this.retryWindow(this.now()),
    })
    const processed: string[] = []
    for (const id of ids) {
      if ((await this.processStopHandoff(id)) === 'processed') processed.push(id)
    }
    return processed
  }

  /**
   * Safety net for the ticket's 3,600 s bound. The track recording API has no
   * max duration field, so any recording still unconfirmed after the bound is
   * stopped here regardless of the interview state. Callers must not pass a
   * bound below the session length or live sessions are cut off; the sweep
   * cadence adds an overrun of up to one cron interval.
   */
  async sweepOverdueRecordings(input: { maxAgeSeconds: number; limit: number }): Promise<number> {
    const rows = await this.repository.listOverdueRecordings({
      created_before: new Date(new Date(this.now()).getTime() - input.maxAgeSeconds * 1000).toISOString(),
      limit: input.limit,
      retry: this.retryWindow(this.now()),
    })
    let stopped = 0
    for (const row of rows) {
      if (await this.stopOverdueRow(row)) stopped += 1
    }
    return stopped
  }

  /**
   * By-id variant of the overdue sweep, run from a delayed work.due message.
   * Reads current state: nothing open is resolved, open work younger than the
   * bound is early (the caller re-sends), otherwise overdue rows are stopped
   * with the same checks and failure bookkeeping as the sweep.
   */
  async closeOverdueRecordingsForInterview(input: {
    interviewId: string
    maxAgeSeconds: number
  }): Promise<CloseOverdueResult> {
    const rows = await this.repository.listOpenRecordingsForInterview(input.interviewId)
    if (rows.length === 0) return { outcome: 'resolved' }

    const nowMs = new Date(this.now()).getTime()
    const overdue = rows.filter(
      (row) => new Date(row.created_at).getTime() + input.maxAgeSeconds * 1000 <= nowMs,
    )
    if (overdue.length === 0) {
      const oldest = Math.min(...rows.map((row) => new Date(row.created_at).getTime()))
      return { outcome: 'early', dueAtMs: oldest + input.maxAgeSeconds * 1000 }
    }

    let allStopped = true
    for (const row of overdue) {
      if (!(await this.stopOverdueRow(row))) allStopped = false
    }
    return { outcome: allStopped ? 'closed' : 'failed' }
  }

  private async stopOverdueRow(row: OverdueRecordingRow): Promise<boolean> {
    await this.repository.markStopRequested(row.id, this.now())
    const code = await this.stopProviderRecording(row.provider_recording_id)
    if (code) {
      const attempts = await this.repository.recordStopFailure(row.id, code, this.now())
      if (attempts >= SWEEP_FAST_ATTEMPTS) {
        await this.logSafely('recording_overdue_stop_attempts_exhausted', {
          interview_id: row.interview_id,
          recording_id: row.id,
          error_code: code,
          attempts,
        })
      }
      return false
    }
    await this.repository.markStopConfirmed(row.id, this.now())
    return true
  }

  /**
   * Handoffs still missing a feedback workflow start (oldest-attempted first):
   * processed ones, plus unprocessed ones older than unprocessedBefore so a
   * provider outage cannot block feedback. Starting feedback is idempotent.
   */
  async listHandoffsAwaitingFeedback(input: {
    processedBefore: string
    unprocessedBefore: string
    limit: number
  }): Promise<string[]> {
    return this.repository.listHandoffsAwaitingFeedback({
      processed_before: input.processedBefore,
      unprocessed_before: input.unprocessedBefore,
      limit: input.limit,
      retry: this.retryWindow(this.now()),
    })
  }

  /** Call after the feedback workflow createBatch succeeded. */
  async markFeedbackTriggered(interviewId: string): Promise<void> {
    await this.repository.markFeedbackTriggered(interviewId, this.now())
  }

  /** Call when a sweep feedback start failed; logs every failure past the fast attempts. */
  async recordFeedbackFailure(interviewId: string): Promise<void> {
    const attempts = await this.repository.recordFeedbackFailure(interviewId, this.now())
    if (attempts >= SWEEP_FAST_ATTEMPTS) {
      await this.logSafely('feedback_trigger_attempts_exhausted', {
        interview_id: interviewId,
        attempts,
      })
    }
  }

  private async recordHandoffFailure(
    interviewId: string,
    code: string,
    now: string,
  ): Promise<void> {
    const attempts = await this.repository.recordHandoffFailure(interviewId, code, now)
    if (attempts >= SWEEP_FAST_ATTEMPTS) {
      await this.logSafely('recording_stop_handoff_attempts_exhausted', {
        interview_id: interviewId,
        error_code: code,
        attempts,
      })
    }
  }

  private async logSafely(event: string, context: Record<string, unknown>): Promise<void> {
    try {
      await this.logger.error(event, context)
    } catch {
      // Logging must never break a sweep.
    }
  }

  /** Returns null when the recording is stopped (or already gone), else a safe error code. */
  private async stopProviderRecording(recordingId: string): Promise<string | null> {
    try {
      await this.provider.stopRecording({ recordingId })
      return null
    } catch (error) {
      if (
        error instanceof RealtimeRecordingError &&
        (error.code === 'invalid_meeting' || error.code === 'duplicate_active_recording')
      ) {
        return null
      }
      return toCode(error)
    }
  }
}

function toCode(error: unknown): string {
  return error instanceof RealtimeRecordingError ? error.code : 'internal_error'
}
