import {
  RecordingControlRepository,
  type RecordingRow,
  type RecordingStartContext,
} from './recording-control-repository'
import {
  RealtimeRecordingError,
  type ProviderRecording,
  type RealtimeRecordingProvider,
} from './realtime-recording-provider'

export type RecordingControlLogger = {
  error(event: string, context: Record<string, unknown>): void | Promise<void>
}

export type EnsureRecordingStartedOutcome =
  | 'started'
  | 'already_started'
  | 'in_progress'
  | 'not_eligible'
  | 'pending_retry'
  | 'failed'
  | 'error'

/** Narrow port that callers (lifecycle start, consent writes) depend on. */
export type RecordingStarter = {
  ensureRecordingStarted(interviewId: string): Promise<EnsureRecordingStartedOutcome>
}

type RecordingSpec = {
  type: RecordingRow['recording_type']
  participantId: string | null
  participantRole: string | null
  participantUserIds: string[]
}

const STALE_CLAIM_MS = 60_000

const noopLogger: RecordingControlLogger = { error() {} }

export class RecordingControlService implements RecordingStarter {
  constructor(
    private readonly repository: RecordingControlRepository,
    private readonly provider: RealtimeRecordingProvider,
    private readonly logger: RecordingControlLogger = noopLogger,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  /**
   * Single entry point for starting recording. Safe to call from any path and
   * any number of times; the DB claim guarantees at most one start. Never
   * throws: failures are logged and reported as an outcome so lifecycle
   * requests are not failed by provider problems.
   */
  async ensureRecordingStarted(interviewId: string): Promise<EnsureRecordingStartedOutcome> {
    try {
      const now = this.now()
      const claim = await this.repository.claimStart({
        interview_id: interviewId,
        claim_id: this.createId(),
        now,
        stale_before: new Date(new Date(now).getTime() - STALE_CLAIM_MS).toISOString(),
      })

      if (claim.outcome !== 'claimed') {
        return claim.outcome
      }

      return await this.runStart(claim.context)
    } catch (error) {
      await this.logSafely('recording.ensure_started_failed', interviewId, error)
      return 'error'
    }
  }

  private async runStart(ctx: RecordingStartContext): Promise<EnsureRecordingStartedOutcome> {
    const specs = buildSpecs(ctx)
    let existing = await this.repository.listRecordings(ctx.interview_id)

    if (ctx.takeover) {
      existing = await this.reconcile(ctx, specs, existing)
    }

    for (const spec of specs) {
      if (isSatisfied(spec, existing)) continue

      try {
        const recording = await this.startSpec(ctx, spec)
        await this.persist(ctx, spec, recording)
        existing = [...existing, toRow(spec, recording)]
      } catch (error) {
        if (!(error instanceof RealtimeRecordingError)) throw error

        await this.logSafely('recording.provider_start_failed', ctx.interview_id, error)

        if (error.ambiguous || error.code === 'duplicate_active_recording') {
          existing = await this.reconcileSafely(ctx, specs, existing)
          if (isSatisfied(spec, existing)) continue
          return 'pending_retry'
        }

        // Never leave a half-started set running: stop what already started
        // before marking failed, or keep the claim pending for a retry.
        if (!(await this.stopRows(ctx.interview_id, existing))) return 'pending_retry'

        await this.repository.finishClaim({
          interview_id: ctx.interview_id,
          claim_id: ctx.claim_id,
          status: 'failed',
          now: this.now(),
        })
        return 'failed'
      }
    }

    // The interview may have completed while the start was in flight; the
    // stop handoff cannot see recordings that were not persisted yet.
    if (!(await this.repository.isInterviewOngoing(ctx.interview_id))) {
      if (!(await this.stopRows(ctx.interview_id, existing))) return 'pending_retry'
    }

    await this.repository.finishClaim({
      interview_id: ctx.interview_id,
      claim_id: ctx.claim_id,
      status: 'recording',
      now: this.now(),
    })
    return 'started'
  }

  /** Stops provider recordings and checkpoints them. Returns false if any stop failed. */
  private async stopRows(interviewId: string, rows: RecordingRow[]): Promise<boolean> {
    let allStopped = true
    for (const row of rows) {
      try {
        await this.provider.stopRecording({ recordingId: row.provider_recording_id })
      } catch (error) {
        const alreadyGone =
          error instanceof RealtimeRecordingError &&
          (error.code === 'invalid_meeting' || error.code === 'duplicate_active_recording')
        if (!alreadyGone) {
          allStopped = false
          await this.logSafely('recording.provider_stop_failed', interviewId, error)
          continue
        }
      }
      await this.repository.markRecordingStopped(row.provider_recording_id, this.now())
    }
    return allStopped
  }

  /** Retries starts whose claim went stale (crash, or pending_retry with no further trigger). */
  async sweepStalePendingClaims(input: { limit: number }): Promise<number> {
    const now = this.now()
    const ids = await this.repository.listStalePendingInterviewIds({
      stale_before: new Date(new Date(now).getTime() - STALE_CLAIM_MS).toISOString(),
      limit: input.limit,
    })
    let started = 0
    for (const id of ids) {
      if ((await this.ensureRecordingStarted(id)) === 'started') started += 1
    }
    return started
  }

  private startSpec(ctx: RecordingStartContext, spec: RecordingSpec): Promise<ProviderRecording> {
    if (spec.type === 'composite') {
      return this.provider.startCompositeRecording({ meetingId: ctx.realtime_session_id })
    }
    return this.provider.startParticipantTrackRecording({
      meetingId: ctx.realtime_session_id,
      participantUserIds: spec.participantUserIds,
    })
  }

  private async persist(
    ctx: RecordingStartContext,
    spec: RecordingSpec,
    recording: ProviderRecording,
  ): Promise<void> {
    await this.repository.insertRecording({
      ...toRow(spec, recording),
      id: this.createId(),
      interview_id: ctx.interview_id,
      now: this.now(),
    })
  }

  private async reconcileSafely(
    ctx: RecordingStartContext,
    specs: RecordingSpec[],
    existing: RecordingRow[],
  ): Promise<RecordingRow[]> {
    try {
      return await this.reconcile(ctx, specs, existing)
    } catch (error) {
      await this.logSafely('recording.reconcile_failed', ctx.interview_id, error)
      return existing
    }
  }

  /** Persists provider recordings that were started but never recorded locally. */
  private async reconcile(
    ctx: RecordingStartContext,
    specs: RecordingSpec[],
    existing: RecordingRow[],
  ): Promise<RecordingRow[]> {
    const active = await this.provider.listActiveRecordings({
      meetingId: ctx.realtime_session_id,
    })
    let current = existing

    for (const recording of active) {
      if (current.some((row) => row.provider_recording_id === recording.id)) continue
      const spec = specs.find((candidate) => matchesProviderRecording(candidate, recording))
      if (!spec || isSatisfied(spec, current)) continue

      await this.persist(ctx, spec, recording)
      current = [...current, toRow(spec, recording)]
    }

    return current
  }

  private async logSafely(event: string, interviewId: string, error: unknown): Promise<void> {
    try {
      await this.logger.error(event, {
        interview_id: interviewId,
        error_code: error instanceof RealtimeRecordingError ? error.code : 'internal_error',
        error_name: error instanceof Error ? error.name : 'unknown',
      })
    } catch {
      // Logging must never break the lifecycle request.
    }
  }
}

/**
 * One composite playback recording plus one participant-separated audio track
 * recording. RealtimeKit emits one file per participant inside the track
 * recording; the finalization workflow maps files to roles (scheduler ->
 * candidate, peer interviewer -> interviewer). For AI-led sessions the track
 * row is bound to the scheduler as the candidate; peer rows cover both users.
 */
function buildSpecs(ctx: RecordingStartContext): RecordingSpec[] {
  const aiLed = ctx.interviewer_id === null
  return [
    { type: 'composite', participantId: null, participantRole: null, participantUserIds: [] },
    {
      type: 'participant_track',
      participantId: aiLed ? ctx.scheduler_id : null,
      participantRole: aiLed ? 'candidate' : null,
      participantUserIds: aiLed ? [ctx.scheduler_id] : [ctx.scheduler_id, ctx.interviewer_id as string],
    },
  ]
}

function isSatisfied(spec: RecordingSpec, rows: RecordingRow[]): boolean {
  return rows.some(
    (row) => row.recording_type === spec.type && row.participant_id === spec.participantId,
  )
}

function matchesProviderRecording(spec: RecordingSpec, recording: ProviderRecording): boolean {
  return spec.type === recording.kind
}

function toRow(spec: RecordingSpec, recording: ProviderRecording): RecordingRow {
  return {
    provider_recording_id: recording.id,
    recording_type: spec.type,
    participant_id: spec.participantId,
    participant_role: spec.participantRole,
  }
}
