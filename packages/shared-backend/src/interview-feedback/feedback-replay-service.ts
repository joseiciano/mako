import { FeedbackReplayRepository } from './feedback-replay-repository'

export type FeedbackReplayOutcome =
  | { outcome: 'replayed'; auditId: string; newWorkflowInstanceId: string }
  | { outcome: 'not_found' }
  | { outcome: 'already_ready' }
  | { outcome: 'not_failed' }

export type FeedbackReplayInput = {
  interviewId: string
  /** Operator identity for the audit trail; never a participant identity. */
  operatorIdentity: string
  reason: string
  targetSchemaVersion: number
}

/**
 * Orchestrates Story 5.18's operator-only replay procedure: verifies the
 * interview is genuinely `failed` (never a participant-facing regenerate
 * path), then atomically resets it to `pending` with a fresh attempt and
 * writes the durable `feedback_replay_audit` row in one transaction (so a
 * DB failure between the two writes can never lose the audit record), and
 * returns a uniquely suffixed workflow instance ID for the operator to
 * start via the documented runbook.
 *
 * Replay of an already-`ready` interview is always rejected today. The MVP
 * feedback schema only defines `schema_version: 1`; `targetSchemaVersion` is
 * still accepted and audited so that a future migration introducing
 * `schema_version: 2` can extend this guard to allow a version-upgrade
 * replay without changing this method's call sites.
 */
export class FeedbackReplayService {
  constructor(
    private readonly repository: FeedbackReplayRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly generateId: () => string = () => crypto.randomUUID(),
  ) {}

  async replay(input: FeedbackReplayInput): Promise<FeedbackReplayOutcome> {
    const state = await this.repository.getReplayState(input.interviewId)

    if (!state) {
      return { outcome: 'not_found' }
    }

    if (state.feedback_status === 'ready') {
      return { outcome: 'already_ready' }
    }

    if (state.feedback_status !== 'failed') {
      return { outcome: 'not_failed' }
    }

    const auditId = this.generateId()
    const createdAt = this.now().toISOString()

    // Resets `failed` -> `pending` and writes the mandatory audit row in a
    // single transaction, so a DB failure between them never loses the
    // audit record this story requires for every replay.
    const reset = await this.repository.resetFailedToPendingWithAudit({
      id: auditId,
      interviewId: input.interviewId,
      priorAttemptId: state.feedback_attempt_id,
      priorErrorCode: state.feedback_error_code,
      targetSchemaVersion: input.targetSchemaVersion,
      operatorIdentity: input.operatorIdentity,
      reason: input.reason,
      createdAt,
    })

    if (!reset) {
      // Lost the race: another replay (or an unrelated transition) already
      // moved this row out of `failed` between the read above and the write.
      return { outcome: 'not_failed' }
    }

    return {
      outcome: 'replayed',
      auditId,
      newWorkflowInstanceId: buildReplayWorkflowInstanceId(input.interviewId, this.now()),
    }
  }
}

/**
 * A new, uniquely suffixed workflow instance ID for the replayed attempt.
 * Deliberately distinct from the deterministic `feedback-v1-{interviewId}`
 * ID the automatic `interview.completed` trigger uses, so a replay never
 * collides with (or silently resumes) a prior terminal instance.
 */
function buildReplayWorkflowInstanceId(interviewId: string, now: Date): string {
  return `feedback-v1-${interviewId}-replay-${now.getTime()}`
}
