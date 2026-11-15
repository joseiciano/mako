import { RecordingStopRepository } from './recording-stop-repository'
import {
  RealtimeRecordingError,
  type RealtimeRecordingProvider,
} from './realtime-recording-provider'

const START_CLAIM_FRESH_MS = 60_000

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
  ) {}

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
      await this.repository.recordHandoffFailure(interviewId, 'start_in_progress', now)
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
      await this.repository.recordHandoffFailure(interviewId, failureCode, this.now())
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
   * stopped here regardless of the interview state.
   */
  async sweepOverdueRecordings(input: { maxAgeSeconds: number; limit: number }): Promise<number> {
    const rows = await this.repository.listOverdueRecordings({
      created_before: new Date(new Date(this.now()).getTime() - input.maxAgeSeconds * 1000).toISOString(),
      limit: input.limit,
    })
    let stopped = 0
    for (const row of rows) {
      await this.repository.markStopRequested(row.id, this.now())
      if (await this.stopProviderRecording(row.provider_recording_id)) continue
      await this.repository.markStopConfirmed(row.id, this.now())
      stopped += 1
    }
    return stopped
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
