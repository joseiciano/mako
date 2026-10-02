import { createSqlQuery, type SqlQueryExecutor } from '../index'
import type { RecordingJobRow } from './feedback-artifact-readiness'

export type ScreenshotFinalizationState = {
  screenshots_finalized_at: string | null
}

/**
 * Reads/writes the `interviews`/`interview_recordings` rows the Story 5.18
 * `InterviewFeedbackWorkflow` orchestration needs: the conditional
 * `pending -> processing` claim, recording-job rows for artifact-readiness
 * classification, screenshot finalization polling, heartbeat refresh for
 * stale-processing recovery, and the two terminal, attempt-fenced
 * conditional writes (`processing -> failed`, `processing -> not_started`).
 * Every write here is a safe no-op when the row is no longer `processing`
 * under the caller's attempt ID, so a replayed or stale-recovered attempt
 * can never clobber a newer attempt's state.
 */
export class FeedbackWorkflowRepository {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  async claimProcessing(interviewId: string, attemptId: string, now: string): Promise<boolean> {
    const result = await this.queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE interviews
          SET feedback_status = 'processing',
              feedback_attempt_id = $2,
              feedback_processing_started_at = $3,
              feedback_processing_heartbeat_at = $3,
              feedback_unavailable_reason = NULL,
              feedback_error_code = NULL
          WHERE id = $1
            AND feedback_status = 'pending'
          RETURNING id;
        `,
        [interviewId, attemptId, now],
      ),
    )

    return (result.rowCount ?? result.rows.length) > 0
  }

  async listRecordingJobs(interviewId: string): Promise<RecordingJobRow[]> {
    const result = await this.queryExecutor.query<RecordingJobRow>(
      createSqlQuery(
        `
          SELECT recording_type, finalization_status, error_code
          FROM interview_recordings
          WHERE interview_id = $1;
        `,
        [interviewId],
      ),
    )

    return result.rows
  }

  async getScreenshotFinalizationState(interviewId: string): Promise<ScreenshotFinalizationState | null> {
    const result = await this.queryExecutor.query<ScreenshotFinalizationState>(
      createSqlQuery(
        `
          SELECT screenshots_finalized_at
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
   * Refreshes the processing heartbeat so the stale-processing sweep does
   * not fence an attempt that is still actively running a long transcription
   * or analysis step. Returns `false` (a safe no-op) when the attempt is no
   * longer the active one, which callers treat as "stop working, another
   * attempt owns this interview now."
   */
  async refreshHeartbeat(interviewId: string, attemptId: string): Promise<boolean> {
    const result = await this.queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE interviews
          SET feedback_processing_heartbeat_at = NOW()
          WHERE id = $1
            AND feedback_status = 'processing'
            AND feedback_attempt_id = $2
          RETURNING id;
        `,
        [interviewId, attemptId],
      ),
    )

    return (result.rowCount ?? result.rows.length) > 0
  }

  /**
   * Conditionally transitions `processing -> failed` with one safe error
   * code, fenced by the active attempt ID. `feedback_attempt_id` and the
   * processing timestamps are intentionally preserved (not cleared) so an
   * operator replay can still read the prior attempt for its audit row.
   */
  async markFailed(interviewId: string, attemptId: string, errorCode: string): Promise<boolean> {
    const result = await this.queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE interviews
          SET feedback_status = 'failed',
              feedback_error_code = $3,
              feedback_unavailable_reason = NULL,
              updated_at = NOW()
          WHERE id = $1
            AND feedback_status = 'processing'
            AND feedback_attempt_id = $2
          RETURNING id;
        `,
        [interviewId, attemptId, errorCode],
      ),
    )

    return (result.rowCount ?? result.rows.length) > 0
  }

  /**
   * Conditionally transitions `processing -> not_started` with a safe
   * unavailable reason, fenced by the active attempt ID. Clears every
   * processing/error field so the row satisfies
   * `interviews_feedback_not_started_check` rather than being classified as
   * a failed infrastructure job.
   */
  async markUnavailable(
    interviewId: string,
    attemptId: string,
    reason: 'unsupported_format' | 'no_recording',
  ): Promise<boolean> {
    const result = await this.queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE interviews
          SET feedback_status = 'not_started',
              feedback_unavailable_reason = $3,
              feedback_error_code = NULL,
              feedback_attempt_id = NULL,
              feedback_processing_started_at = NULL,
              feedback_processing_heartbeat_at = NULL,
              feedback_prompt_version = NULL,
              updated_at = NOW()
          WHERE id = $1
            AND feedback_status = 'processing'
            AND feedback_attempt_id = $2
          RETURNING id;
        `,
        [interviewId, attemptId, reason],
      ),
    )

    return (result.rowCount ?? result.rows.length) > 0
  }
}
