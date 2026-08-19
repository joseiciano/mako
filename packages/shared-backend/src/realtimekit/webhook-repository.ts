import {
  createSqlQuery,
  rollbackTransactionSafely,
  type SqlQueryExecutor,
} from '../index'
import {
  realtimekitEventStatusPriority,
  type RealtimeKitWebhookAcceptanceInput,
  type RealtimeKitWebhookAcceptanceResult,
  type RealtimeKitWebhookEventStatus,
  type RealtimeKitWebhookRepositoryPort,
  type ResolvedRecordingJob,
} from './types'

export type RealtimeKitWebhookRepositoryDataSource = {
  acceptWebhookEvent(
    input: RealtimeKitWebhookAcceptanceInput,
  ): Promise<RealtimeKitWebhookAcceptanceResult>
}

type RealtimeKitWebhookRepositoryDependencies = {
  dataSource?: RealtimeKitWebhookRepositoryDataSource
  queryExecutor?: SqlQueryExecutor
}

type RealtimeKitWebhookRepositoryConstructorInput =
  | RealtimeKitWebhookRepositoryDataSource
  | SqlQueryExecutor
  | RealtimeKitWebhookRepositoryDependencies

export class RealtimeKitWebhookRepository
  implements RealtimeKitWebhookRepositoryPort
{
  private readonly dependencies: RealtimeKitWebhookRepositoryDependencies

  constructor(input: RealtimeKitWebhookRepositoryConstructorInput) {
    if (isDataSource(input)) {
      this.dependencies = { dataSource: input }
      return
    }

    if (isQueryExecutor(input)) {
      this.dependencies = { queryExecutor: input }
      return
    }

    this.dependencies = input
  }

  async acceptWebhookEvent(
    input: RealtimeKitWebhookAcceptanceInput,
  ): Promise<RealtimeKitWebhookAcceptanceResult> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.acceptWebhookEvent(input)
    }

    const queryExecutor = this.getQueryExecutor()
    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const jobLookup = await queryExecutor.query<ResolvedRecordingJob>(
        createSqlQuery(
          `
            SELECT
              id,
              interview_id,
              provider_recording_id,
              recording_type,
              participant_id,
              participant_role,
              provider_status,
              finalization_status
            FROM interview_recordings
            WHERE provider_recording_id = $1
            LIMIT 1
            FOR UPDATE;
          `,
          [input.provider_recording_id],
        ),
      )

      const [job] = jobLookup.rows

      if (!job) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return { outcome: 'unknown_recording' }
      }

      const existingEventLookup = await queryExecutor.query<{
        provider_event_id: string
      }>(
        createSqlQuery(
          `
            SELECT provider_event_id
            FROM realtimekit_webhook_events
            WHERE provider_event_id = $1
            LIMIT 1;
          `,
          [input.provider_event_id],
        ),
      )

      if (existingEventLookup.rows.length > 0) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return { outcome: 'duplicate' }
      }

      const latestStatusLookup = await queryExecutor.query<{
        status: RealtimeKitWebhookEventStatus
      }>(
        createSqlQuery(
          `
            SELECT status
            FROM realtimekit_webhook_events
            WHERE recording_id = $1
              AND provider_event_id <> $2
            ORDER BY received_at DESC, provider_event_id DESC
            LIMIT 1;
          `,
          [input.provider_recording_id, input.provider_event_id],
        ),
      )

      const [latestStatus] = latestStatusLookup.rows

      if (
        latestStatus &&
        realtimekitEventStatusPriority(input.mapped_status) <
          realtimekitEventStatusPriority(latestStatus.status)
      ) {
        // Out-of-order delivery. Acknowledge without regressing state.
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return { outcome: 'stale' }
      }

      const insertResult = await queryExecutor.query(
        createSqlQuery(
          `
            INSERT INTO realtimekit_webhook_events (
              provider_event_id,
              event_type,
              recording_id,
              provider_asset_id,
              status,
              attempt_count,
              next_attempt_at,
              received_at,
              processed_at,
              last_error_code
            )
            VALUES ($1, $2, $3, $4, $5, 0, $6, $7, NULL, $8)
            ON CONFLICT (provider_event_id) DO NOTHING;
          `,
          [
            input.provider_event_id,
            input.event_type,
            input.provider_recording_id,
            input.provider_asset_id,
            input.mapped_status,
            input.next_attempt_at,
            input.received_at,
            input.last_error_code,
          ],
        ),
      )

      if (insertResult.rowCount === 0) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return { outcome: 'duplicate' }
      }

      // Provider asset identity lives on the webhook event row (and later on
      // the artifact row during finalization); interview_recordings has no
      // provider_asset_id column in the schema.
      await queryExecutor.query(
        createSqlQuery(
          `
            UPDATE interview_recordings
            SET provider_status = $2,
                updated_at = $3
            WHERE provider_recording_id = $1;
          `,
          [
            input.provider_recording_id,
            input.provider_status,
            input.received_at,
          ],
        ),
      )

      await queryExecutor.query(createSqlQuery('COMMIT;'))
      return { outcome: 'recorded' }
    } catch (error) {
      await rollbackTransactionSafely(queryExecutor)
      throw error
    }
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.dependencies.queryExecutor

    if (!queryExecutor) {
      throw new Error('RealtimeKit webhook query executor is not configured')
    }

    return queryExecutor
  }
}

function isDataSource(
  input: RealtimeKitWebhookRepositoryConstructorInput,
): input is RealtimeKitWebhookRepositoryDataSource {
  return (
    typeof input === 'object' &&
    input !== null &&
    'acceptWebhookEvent' in input &&
    typeof input.acceptWebhookEvent === 'function'
  )
}

function isQueryExecutor(
  input: RealtimeKitWebhookRepositoryConstructorInput,
): input is SqlQueryExecutor {
  return (
    typeof input === 'object' &&
    input !== null &&
    'query' in input &&
    typeof input.query === 'function'
  )
}
