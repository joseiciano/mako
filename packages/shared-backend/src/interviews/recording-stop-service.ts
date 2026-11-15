import { RecordingStopRepository } from './recording-stop-repository'
import {
  RealtimeRecordingError,
  type RealtimeRecordingProvider,
} from './realtime-recording-provider'

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
    const handoff = await this.repository.getUnprocessedHandoff(interviewId)
    if (!handoff) return 'no_handoff'

    let failureCode: string | null = null
    const knownProviderIds = new Set<string>()

    const recordings = await this.repository.listRecordings(interviewId)
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

  async sweepStopHandoffs(input: { olderThan: string; limit: number }): Promise<number> {
    const ids = await this.repository.listUnprocessedHandoffInterviewIds({
      older_than: input.olderThan,
      limit: input.limit,
    })
    let processed = 0
    for (const id of ids) {
      if ((await this.processStopHandoff(id)) === 'processed') processed += 1
    }
    return processed
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
