import { createSqlQuery, type SqlQueryExecutor } from '../index'

export type FeedbackAnalysisStateRow = {
  type: string
  mode: string
  tier: string
  scheduler_alias: string
  transcript: string | null
  feedback_status: string
  feedback_attempt_id: string | null
  feedback: unknown | null
}

export type FeedbackScreenshotArtifactRow = {
  id: string
  object_key: string
  content_type: string | null
  content_size_bytes: number | null
}

export type PersistReadyFeedbackInput = {
  interviewId: string
  attemptId: string
  feedback: Record<string, unknown>
  promptVersion: string
  generatedAt: string
}

/**
 * Reads/writes the `interviews`/`interview_artifacts` rows the Story 5.17
 * analysis pipeline needs: canonical evidence metadata, transcript, and
 * processing state for idempotency checks; finalized screenshot artifact
 * rows in deterministic capture order; and the one conditional
 * ready-feedback write.
 */
export class FeedbackAnalysisRepository {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  async getAnalysisState(interviewId: string): Promise<FeedbackAnalysisStateRow | null> {
    const result = await this.queryExecutor.query<FeedbackAnalysisStateRow>(
      createSqlQuery(
        `
          SELECT
            type,
            mode,
            tier,
            scheduler_alias,
            transcript,
            feedback_status,
            feedback_attempt_id,
            feedback
          FROM interviews
          WHERE id = $1
          LIMIT 1;
        `,
        [interviewId],
      ),
    )

    return result.rows[0] ?? null
  }

  async listFinalizedScreenshots(interviewId: string): Promise<FeedbackScreenshotArtifactRow[]> {
    const result = await this.queryExecutor.query<FeedbackScreenshotArtifactRow>(
      createSqlQuery(
        `
          SELECT
            id,
            object_key,
            content_metadata->>'contentType' AS content_type,
            COALESCE((content_metadata->>'contentSizeBytes')::bigint, 0)::int AS content_size_bytes
          FROM interview_artifacts
          WHERE interview_id = $1
            AND artifact_kind = 'screenshot'
            AND deleted_at IS NULL
            AND object_key IS NOT NULL
          ORDER BY created_at ASC, id ASC;
        `,
        [interviewId],
      ),
    )

    return result.rows
  }

  /**
   * Persists the complete validated feedback v1 report and transitions
   * `processing -> ready` in one conditional update, fenced by the active
   * feedback attempt ID. A stale/replaced attempt, or an interview that is
   * no longer `processing` (including one that is already `ready`), is a
   * safe no-op: callers detect the "already ready" case separately via
   * `getAnalysisState` so freshly computed work is never silently dropped,
   * and an already-ready v1 report is never overwritten by a duplicate
   * automatic retry.
   */
  async persistReadyFeedback(input: PersistReadyFeedbackInput): Promise<boolean> {
    const result = await this.queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE interviews
          SET feedback = $3::jsonb,
              feedback_status = 'ready',
              feedback_prompt_version = $4,
              feedback_generated_at = $5,
              feedback_error_code = NULL,
              feedback_unavailable_reason = NULL,
              updated_at = NOW()
          WHERE id = $1
            AND feedback_status = 'processing'
            AND feedback_attempt_id = $2
          RETURNING id;
        `,
        [
          input.interviewId,
          input.attemptId,
          JSON.stringify(input.feedback),
          input.promptVersion,
          input.generatedAt,
        ],
      ),
    )

    return (result.rowCount ?? result.rows.length) > 0
  }
}
