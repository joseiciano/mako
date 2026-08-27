import type { SqlQueryExecutor } from '@mako/shared-backend'

export type WebhookEventInsert = {
  providerEventId: string
  eventType: string
  recordingId: string
  status: string
}

export type RecordingRow = {
  id: string
  provider_recording_id: string
  interview_id: string
  provider_status: string | null
  finalization_status: string | null
}

export class RealtimeKitWebhookRepository {
  async insertWebhookEvent(
    executor: SqlQueryExecutor,
    input: WebhookEventInsert,
  ): Promise<{ rowCount: number }> {
    const result = await executor.query<{ provider_event_id: string }>({
      text: `INSERT INTO realtimekit_webhook_events (provider_event_id, event_type, recording_id, status, received_at, attempt_count) VALUES ($1, $2, $3, $4, NOW(), 0) ON CONFLICT (provider_event_id) DO NOTHING`,
      values: [input.providerEventId, input.eventType, input.recordingId, input.status],
    })
    const rowCount = (result as { rowCount?: number }).rowCount ?? (result.rows.length > 0 ? 1 : 0)
    return { rowCount }
  }

  async findRecordingForUpdate(
    executor: SqlQueryExecutor,
    providerRecordingId: string,
  ): Promise<RecordingRow | null> {
    const result = await executor.query<RecordingRow>({
      text: `SELECT id, provider_recording_id, interview_id, provider_status, finalization_status FROM interview_recordings WHERE provider_recording_id = $1 FOR UPDATE`,
      values: [providerRecordingId],
    })
    if (result.rows.length === 0) return null
    return result.rows[0] as RecordingRow
  }

  async updateRecordingStatus(
    executor: SqlQueryExecutor,
    input: { providerRecordingId: string; providerStatus: string; checkpoint: string; errorCode: string | null },
  ): Promise<void> {
    if (input.errorCode) {
      await executor.query({
        text: `UPDATE interview_recordings SET provider_status = $1, finalization_checkpoint = $2, error_code = $3, updated_at = NOW() WHERE provider_recording_id = $4`,
        values: [input.providerStatus, input.checkpoint, input.errorCode, input.providerRecordingId],
      })
    } else {
      await executor.query({
        text: `UPDATE interview_recordings SET provider_status = $1, finalization_checkpoint = $2, updated_at = NOW() WHERE provider_recording_id = $3`,
        values: [input.providerStatus, input.checkpoint, input.providerRecordingId],
      })
    }
  }
}
