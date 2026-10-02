import { createSqlQuery, type QueryResult, type SqlQueryExecutor } from '../index'
import type { RetentionArtifactRow } from './types'

/**
 * Postgres access for the Story 5.15 raw-artifact retention sweep and
 * account-deletion privacy cleanup. Never lists R2 directly: the normalized
 * `interview_artifacts` rows are the cleanup source of truth.
 */
export class ArtifactRetentionRepository {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  /**
   * Bounded query for artifact rows whose explicit `expires_at` has passed
   * and which have not already been cleared. Matches the
   * `idx_interview_artifacts_expiry` partial index.
   */
  async listExpiredArtifacts(limit: number, now: string): Promise<RetentionArtifactRow[]> {
    const result = await this.queryExecutor.query<RetentionArtifactRow>(
      createSqlQuery(
        `
          SELECT id, interview_id, artifact_kind, object_key
          FROM interview_artifacts
          WHERE deleted_at IS NULL
            AND expires_at IS NOT NULL
            AND expires_at <= $1
          ORDER BY expires_at ASC
          LIMIT $2;
        `,
        [now, limit],
      ),
    )

    return result.rows
  }

  /**
   * Clears the object key and sets the deletion tombstone for one artifact
   * row. Retry-safe: guarded by `deleted_at IS NULL` so a repeated call for
   * an already-cleared row is a no-op rather than a double-clear.
   */
  async clearArtifactObjectKey(id: string, deletedAt: string): Promise<boolean> {
    const result = await this.queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE interview_artifacts
          SET object_key = NULL,
              deleted_at = $2,
              updated_at = $2
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id;
        `,
        [id, deletedAt],
      ),
    )

    return hasRows(result)
  }

  /** All interview ids where the given user is a recorded participant (scheduler or interviewer). */
  async listParticipantInterviewIds(userId: string): Promise<string[]> {
    const result = await this.queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          SELECT id
          FROM interviews
          WHERE scheduler_id = $1
             OR interviewer_id = $1;
        `,
        [userId],
      ),
    )

    return result.rows.map((row) => row.id)
  }

  /**
   * All non-tombstoned artifacts for the given interviews, regardless of
   * expiry. Account-deletion privacy cleanup removes raw media immediately
   * rather than waiting for the retention window.
   */
  async listArtifactsForInterviews(interviewIds: readonly string[]): Promise<RetentionArtifactRow[]> {
    if (interviewIds.length === 0) {
      return []
    }

    const result = await this.queryExecutor.query<RetentionArtifactRow>(
      createSqlQuery(
        `
          SELECT id, interview_id, artifact_kind, object_key
          FROM interview_artifacts
          WHERE interview_id = ANY($1::uuid[])
            AND deleted_at IS NULL;
        `,
        [interviewIds],
      ),
    )

    return result.rows
  }

  /**
   * Clears transcript and feedback content for a permanently deleted
   * account's shared interview. Feedback metadata is reset to the
   * `not_started` shape so the `interviews_feedback_not_started_check`
   * constraint stays satisfied.
   */
  async clearInterviewPrivacyFields(interviewId: string, clearedAt: string): Promise<void> {
    await this.queryExecutor.query(
      createSqlQuery(
        `
          UPDATE interviews
          SET transcript = NULL,
              feedback = NULL,
              feedback_status = 'not_started',
              feedback_unavailable_reason = NULL,
              feedback_error_code = NULL,
              feedback_prompt_version = NULL,
              feedback_generated_at = NULL,
              feedback_attempt_id = NULL,
              feedback_processing_started_at = NULL,
              feedback_processing_heartbeat_at = NULL,
              updated_at = $2
          WHERE id = $1;
        `,
        [interviewId, clearedAt],
      ),
    )
  }
}

function hasRows<Row>(result: QueryResult<Row>): boolean {
  if (typeof result.rowCount === 'number') {
    return result.rowCount > 0
  }

  return result.rows.length > 0
}
