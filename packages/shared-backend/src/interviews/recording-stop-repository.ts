import { createSqlQuery, type SqlQueryExecutor } from '../index'

export type StopHandoff = {
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
  }): Promise<string[]> {
    const result = await this.queryExecutor.query<{ interview_id: string }>(
      createSqlQuery(
        `
          SELECT interview_id
          FROM interview_recording_stop_handoffs
          WHERE processed_at IS NULL AND created_at < $1
          ORDER BY created_at
          LIMIT $2;
        `,
        [input.older_than, input.limit],
      ),
    )
    return result.rows.map((row) => row.interview_id)
  }

  async listOverdueRecordings(input: {
    created_before: string
    limit: number
  }): Promise<OverdueRecordingRow[]> {
    const result = await this.queryExecutor.query<OverdueRecordingRow>(
      createSqlQuery(
        `
          SELECT id, interview_id, provider_recording_id
          FROM interview_recordings
          WHERE stop_confirmed_at IS NULL AND created_at < $1
          ORDER BY created_at
          LIMIT $2;
        `,
        [input.created_before, input.limit],
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

  async recordHandoffFailure(interviewId: string, errorCode: string, now: string): Promise<void> {
    await this.queryExecutor.query(
      createSqlQuery(
        `
          UPDATE interview_recording_stop_handoffs
          SET attempt_count = attempt_count + 1, last_error_code = $2, updated_at = $3
          WHERE interview_id = $1 AND processed_at IS NULL;
        `,
        [interviewId, errorCode, now],
      ),
    )
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
