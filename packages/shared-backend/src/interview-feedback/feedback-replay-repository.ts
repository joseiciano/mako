import { createSqlQuery, type SqlQueryExecutor } from '../index'

export type FeedbackReplayStateRow = {
  feedback_status: string
  feedback_attempt_id: string | null
  feedback_error_code: string | null
}

export type InsertReplayAuditInput = {
  id: string
  interviewId: string
  priorAttemptId: string | null
  priorErrorCode: string | null
  targetSchemaVersion: number
  operatorIdentity: string
  reason: string
  createdAt: string
}

/**
 * Reads/writes the operational-replay rows for Story 5.18: current
 * feedback state for the operator's eligibility check, the conditional
 * `failed -> pending` reset, and the durable `feedback_replay_audit` row.
 * There is deliberately no participant-facing equivalent of any of these
 * queries; only an operator-run procedure calls this repository.
 */
export class FeedbackReplayRepository {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  async getReplayState(interviewId: string): Promise<FeedbackReplayStateRow | null> {
    const result = await this.queryExecutor.query<FeedbackReplayStateRow>(
      createSqlQuery(
        `
          SELECT feedback_status, feedback_attempt_id, feedback_error_code
          FROM interviews
          WHERE id = $1
          LIMIT 1;
        `,
        [interviewId],
      ),
    )

    return result.rows[0] ?? null
  }

  /**
   * Resets a terminally `failed` interview back to `pending`, clearing every
   * processing/error/prompt field so the row satisfies
   * `interviews_feedback_pending_check` and the next claim starts a genuinely
   * fresh attempt. A safe no-op (`false`) when the row is no longer `failed`
   * (e.g. a concurrent replay already reset it).
   */
  async resetFailedToPending(interviewId: string): Promise<boolean> {
    const result = await this.queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE interviews
          SET feedback_status = 'pending',
              feedback_error_code = NULL,
              feedback_unavailable_reason = NULL,
              feedback_attempt_id = NULL,
              feedback_processing_started_at = NULL,
              feedback_processing_heartbeat_at = NULL,
              feedback_prompt_version = NULL,
              updated_at = NOW()
          WHERE id = $1
            AND feedback_status = 'failed'
          RETURNING id;
        `,
        [interviewId],
      ),
    )

    return (result.rowCount ?? result.rows.length) > 0
  }

  async insertReplayAudit(input: InsertReplayAuditInput): Promise<void> {
    await this.queryExecutor.query(
      createSqlQuery(
        `
          INSERT INTO feedback_replay_audit (
            id, interview_id, prior_attempt_id, prior_error_code,
            target_schema_version, operator_identity, reason, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `,
        [
          input.id,
          input.interviewId,
          input.priorAttemptId,
          input.priorErrorCode,
          input.targetSchemaVersion,
          input.operatorIdentity,
          input.reason,
          input.createdAt,
        ],
      ),
    )
  }
}
