import { createSqlQuery, type SqlQueryExecutor } from '../index'

type StopHandoff = {
  interview_id: string
  realtime_session_id: string | null
  recording_status: string
  /** True while a recording start holds a fresh pending claim. */
  start_in_flight: boolean
}

export type OverdueRecordingRow = {
  id: string
  interview_id: string
  provider_recording_id: string
}

export type StopRecordingRow = {
  id: string
  provider_recording_id: string
  stop_requested_at: string | null
  stop_confirmed_at: string | null
}

/**
 * Bounds how long a sweep keeps retrying a row: rows created before
 * created_after are abandoned, and rows with fast_attempts or more failed
 * attempts are retried only when last_attempted_at is before slow_retry_before.
 */
export type SweepRetryWindow = {
  fast_attempts: number
  slow_retry_before: string
  created_after: string
}

export class RecordingStopRepository {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  async getUnprocessedHandoff(
    interviewId: string,
    freshClaimAfter: string,
  ): Promise<StopHandoff | null> {
    const result = await this.queryExecutor.query<StopHandoff>(
      createSqlQuery(
        `
          SELECT h.interview_id, i.realtime_session_id, i.recording_status,
                 (i.recording_status = 'pending' AND i.recording_start_claimed_at > $2)
                   AS start_in_flight
          FROM interview_recording_stop_handoffs h
          JOIN interviews i ON i.id = h.interview_id
          WHERE h.interview_id = $1 AND h.processed_at IS NULL
          LIMIT 1;
        `,
        [interviewId, freshClaimAfter],
      ),
    )
    return result.rows[0] ?? null
  }

  async listUnprocessedHandoffInterviewIds(input: {
    older_than: string
    limit: number
    retry: SweepRetryWindow
  }): Promise<string[]> {
    const result = await this.queryExecutor.query<{ interview_id: string }>(
      createSqlQuery(
        `
          SELECT interview_id
          FROM interview_recording_stop_handoffs
          WHERE processed_at IS NULL
            AND created_at < $1
            AND created_at > $4
            AND (attempt_count < $3 OR last_attempted_at < $5)
          ORDER BY last_attempted_at ASC NULLS FIRST, created_at
          LIMIT $2;
        `,
        [
          input.older_than,
          input.limit,
          input.retry.fast_attempts,
          input.retry.created_after,
          input.retry.slow_retry_before,
        ],
      ),
    )
    return result.rows.map((row) => row.interview_id)
  }

  async listOverdueRecordings(input: {
    created_before: string
    limit: number
    retry: SweepRetryWindow
  }): Promise<OverdueRecordingRow[]> {
    const result = await this.queryExecutor.query<OverdueRecordingRow>(
      createSqlQuery(
        `
          SELECT id, interview_id, provider_recording_id
          FROM interview_recordings
          WHERE stop_confirmed_at IS NULL
            AND created_at < $1
            AND created_at > $4
            AND (stop_attempt_count < $3 OR stop_last_attempted_at < $5)
          ORDER BY stop_last_attempted_at ASC NULLS FIRST, created_at
          LIMIT $2;
        `,
        [
          input.created_before,
          input.limit,
          input.retry.fast_attempts,
          input.retry.created_after,
          input.retry.slow_retry_before,
        ],
      ),
    )
    return result.rows
  }

  async listOpenRecordingsForInterview(
    interviewId: string,
  ): Promise<(OverdueRecordingRow & { created_at: string })[]> {
    const result = await this.queryExecutor.query<OverdueRecordingRow & { created_at: string }>(
      createSqlQuery(
        `
          SELECT id, interview_id, provider_recording_id, created_at
          FROM interview_recordings
          WHERE interview_id = $1
            AND stop_confirmed_at IS NULL
          ORDER BY created_at, id;
        `,
        [interviewId],
      ),
    )
    return result.rows
  }

  async listRecordings(interviewId: string): Promise<StopRecordingRow[]> {
    const result = await this.queryExecutor.query<StopRecordingRow>(
      createSqlQuery(
        `
          SELECT id, provider_recording_id, stop_requested_at, stop_confirmed_at
          FROM interview_recordings
          WHERE interview_id = $1
          ORDER BY created_at, id;
        `,
        [interviewId],
      ),
    )
    return result.rows
  }

  async markStopRequested(recordingRowId: string, now: string): Promise<void> {
    await this.queryExecutor.query(
      createSqlQuery(
        `
          UPDATE interview_recordings
          SET stop_requested_at = COALESCE(stop_requested_at, $2), updated_at = $2
          WHERE id = $1;
        `,
        [recordingRowId, now],
      ),
    )
  }

  async markStopConfirmed(recordingRowId: string, now: string): Promise<void> {
    await this.queryExecutor.query(
      createSqlQuery(
        `
          UPDATE interview_recordings
          SET stop_confirmed_at = COALESCE(stop_confirmed_at, $2), updated_at = $2
          WHERE id = $1;
        `,
        [recordingRowId, now],
      ),
    )
  }

  /** Returns the new attempt count (0 when the handoff is already processed). */
  async recordHandoffFailure(interviewId: string, errorCode: string, now: string): Promise<number> {
    const result = await this.queryExecutor.query<{ attempt_count: number }>(
      createSqlQuery(
        `
          UPDATE interview_recording_stop_handoffs
          SET attempt_count = attempt_count + 1,
              last_attempted_at = $3,
              last_error_code = $2,
              updated_at = $3
          WHERE interview_id = $1 AND processed_at IS NULL
          RETURNING attempt_count;
        `,
        [interviewId, errorCode, now],
      ),
    )
    return result.rows[0]?.attempt_count ?? 0
  }

  /** Returns the new attempt count for the recording row. */
  async recordStopFailure(recordingRowId: string, errorCode: string, now: string): Promise<number> {
    const result = await this.queryExecutor.query<{ stop_attempt_count: number }>(
      createSqlQuery(
        `
          UPDATE interview_recordings
          SET stop_attempt_count = stop_attempt_count + 1,
              stop_last_attempted_at = $3,
              stop_last_error_code = $2,
              updated_at = $3
          WHERE id = $1
          RETURNING stop_attempt_count;
        `,
        [recordingRowId, errorCode, now],
      ),
    )
    return result.rows[0]?.stop_attempt_count ?? 0
  }

  /**
   * Handoffs whose feedback workflow has not been started yet: processed ones
   * (processed_before) and ones the provider never let finish
   * (unprocessed_before), so feedback does not depend on provider availability.
   */
  async listHandoffsAwaitingFeedback(input: {
    processed_before: string
    unprocessed_before: string
    limit: number
    retry: SweepRetryWindow
  }): Promise<string[]> {
    const result = await this.queryExecutor.query<{ interview_id: string }>(
      createSqlQuery(
        `
          SELECT interview_id
          FROM interview_recording_stop_handoffs
          WHERE feedback_triggered_at IS NULL
            AND created_at > $5
            AND (feedback_attempt_count < $4 OR feedback_last_attempted_at < $6)
            AND (
              (processed_at IS NOT NULL AND processed_at < $1)
              OR (processed_at IS NULL AND created_at < $2)
            )
          ORDER BY feedback_last_attempted_at ASC NULLS FIRST, created_at
          LIMIT $3;
        `,
        [
          input.processed_before,
          input.unprocessed_before,
          input.limit,
          input.retry.fast_attempts,
          input.retry.created_after,
          input.retry.slow_retry_before,
        ],
      ),
    )
    return result.rows.map((row) => row.interview_id)
  }

  async markFeedbackTriggered(interviewId: string, now: string): Promise<void> {
    await this.queryExecutor.query(
      createSqlQuery(
        `
          UPDATE interview_recording_stop_handoffs
          SET feedback_triggered_at = COALESCE(feedback_triggered_at, $2)
          WHERE interview_id = $1;
        `,
        [interviewId, now],
      ),
    )
  }

  /** Returns the new feedback attempt count. */
  async recordFeedbackFailure(interviewId: string, now: string): Promise<number> {
    const result = await this.queryExecutor.query<{ feedback_attempt_count: number }>(
      createSqlQuery(
        `
          UPDATE interview_recording_stop_handoffs
          SET feedback_attempt_count = feedback_attempt_count + 1,
              feedback_last_attempted_at = $2
          WHERE interview_id = $1 AND feedback_triggered_at IS NULL
          RETURNING feedback_attempt_count;
        `,
        [interviewId, now],
      ),
    )
    return result.rows[0]?.feedback_attempt_count ?? 0
  }

  async markHandoffProcessed(interviewId: string, now: string): Promise<void> {
    await this.queryExecutor.query(
      createSqlQuery(
        `
          UPDATE interview_recording_stop_handoffs
          SET processed_at = COALESCE(processed_at, $2),
              attempt_count = attempt_count + 1,
              last_error_code = NULL,
              updated_at = $2
          WHERE interview_id = $1;
        `,
        [interviewId, now],
      ),
    )
  }
}
