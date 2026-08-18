import {
  createSqlQuery,
  rollbackTransactionSafely,
  type SqlQueryExecutor,
} from '../index'
import type { ResolvedRecordingJob } from './types'

export type RecordingJobWithInterview = {
  job: ResolvedRecordingJob
  interview: {
    id: string
    mode: 'ai_led' | 'peer_to_peer'
    scheduler_id: string
    interviewer_id: string | null
    recording_status: string
  }
}

export type ExistingArtifactRow = {
  id: string
  object_key: string | null
}

export type RequiredRecordingArtifact = {
  provider_recording_id: string
  recording_type: 'composite' | 'participant_track'
  artifact_kind: 'playback_recording' | 'transcription_audio'
  artifact_object_key: string | null
}

export type SweepCandidateRow = {
  provider_event_id: string
  recording_id: string | null
  attempt_count: number
}

export type InsertArtifactInput = {
  id: string
  interview_id: string
  artifact_kind: 'playback_recording' | 'transcription_audio'
  participant_id: string | null
  participant_role: string | null
  object_key: string
  provider_asset_id: string
  idempotency_key: string
  content_metadata: { content_type: string; size_bytes: number }
  captured_at: string
  finalized_at: string
  expires_at: string
  created_at: string
}

export type RecordingFinalizationRepositoryPort = {
  getJobWithInterview(
    providerRecordingId: string,
  ): Promise<RecordingJobWithInterview | null>
  claimJob(providerRecordingId: string, now: string): Promise<boolean>
  releaseClaim(providerRecordingId: string, now: string): Promise<void>
  getArtifactByProviderAssetId(
    providerAssetId: string,
  ): Promise<ExistingArtifactRow | null>
  insertArtifact(input: InsertArtifactInput): Promise<'inserted' | 'duplicate'>
  finalizeJob(providerRecordingId: string, now: string): Promise<void>
  failJob(
    providerRecordingId: string,
    errorCode: string,
    checkpoint: string,
    now: string,
  ): Promise<void>
  markEventProcessed(recordingId: string, now: string): Promise<void>
  markEventAwaiting(recordingId: string, nextAttemptAt: string): Promise<void>
  markEventFailed(
    recordingId: string,
    errorCode: string,
    nextAttemptAt: string,
  ): Promise<void>
  getAggregateReadiness(interviewId: string): Promise<RequiredRecordingArtifact[]>
  setInterviewRecordingReady(interviewId: string, now: string): Promise<void>
  listSweepCandidates(limit: number, now: string): Promise<SweepCandidateRow[]>
  updateSweepCheckpoint(
    providerEventId: string,
    attemptCount: number,
    nextAttemptAt: string | null,
    terminalAt: string | null,
  ): Promise<void>
}

export type RecordingFinalizationRepositoryDataSource = {
  [Method in keyof RecordingFinalizationRepositoryPort]: RecordingFinalizationRepositoryPort[Method]
}

type RecordingFinalizationRepositoryDependencies = {
  dataSource?: RecordingFinalizationRepositoryDataSource
  queryExecutor?: SqlQueryExecutor
}

type RecordingFinalizationRepositoryConstructorInput =
  | RecordingFinalizationRepositoryDataSource
  | SqlQueryExecutor
  | RecordingFinalizationRepositoryDependencies

export class RecordingFinalizationRepository
  implements RecordingFinalizationRepositoryPort
{
  private readonly dependencies: RecordingFinalizationRepositoryDependencies

  constructor(input: RecordingFinalizationRepositoryConstructorInput) {
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

  async getJobWithInterview(
    providerRecordingId: string,
  ): Promise<RecordingJobWithInterview | null> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.getJobWithInterview(providerRecordingId)
    }

    const result = await this.getQueryExecutor().query<RawRecordingJobWithInterviewRow | RecordingJobWithInterview>(
      createSqlQuery(
        `
          SELECT
            r.id,
            r.interview_id,
            r.provider_recording_id,
            r.recording_type,
            r.participant_id,
            r.participant_role,
            r.provider_status,
            r.finalization_status,
            i.mode,
            i.scheduler_id,
            i.interviewer_id,
            i.recording_status
          FROM interview_recordings r
          JOIN interviews i ON i.id = r.interview_id
          WHERE r.provider_recording_id = $1
          LIMIT 1;
        `,
        [providerRecordingId],
      ),
    )

    const row = result.rows[0]

    if (!row) {
      return null
    }

    if ('job' in row && 'interview' in row) {
      return row
    }

    return {
      job: {
        id: row.id,
        interview_id: row.interview_id,
        provider_recording_id: row.provider_recording_id,
        recording_type: row.recording_type,
        participant_id: row.participant_id,
        participant_role: row.participant_role,
        provider_status: row.provider_status,
        finalization_status: row.finalization_status,
      },
      interview: {
        id: row.interview_id,
        mode: row.mode,
        scheduler_id: row.scheduler_id,
        interviewer_id: row.interviewer_id,
        recording_status: row.recording_status,
      },
    }
  }

  async claimJob(providerRecordingId: string, now: string): Promise<boolean> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.claimJob(providerRecordingId, now)
    }

    const result = await this.getQueryExecutor().query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE interview_recordings
          SET finalization_status = 'processing',
              finalization_checkpoint = 'started',
              error_code = NULL,
              updated_at = $2
          WHERE provider_recording_id = $1
            AND finalization_status IN ('pending', 'failed')
          RETURNING id;
        `,
        [providerRecordingId, now],
      ),
    )

    return hasRows(result)
  }

  async releaseClaim(providerRecordingId: string, now: string): Promise<void> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.releaseClaim(providerRecordingId, now)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE interview_recordings
          SET finalization_status = 'pending',
              finalization_checkpoint = 'awaiting_provider',
              error_code = NULL,
              updated_at = $2
          WHERE provider_recording_id = $1
            AND finalization_status = 'processing';
        `,
        [providerRecordingId, now],
      ),
    )
  }

  async getArtifactByProviderAssetId(
    providerAssetId: string,
  ): Promise<ExistingArtifactRow | null> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.getArtifactByProviderAssetId(providerAssetId)
    }

    const result = await this.getQueryExecutor().query<ExistingArtifactRow>(
      createSqlQuery(
        `
          SELECT id, object_key
          FROM interview_artifacts
          WHERE provider_asset_id = $1
            AND deleted_at IS NULL
          LIMIT 1;
        `,
        [providerAssetId],
      ),
    )

    return result.rows[0] ?? null
  }

  async insertArtifact(input: InsertArtifactInput): Promise<'inserted' | 'duplicate'> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.insertArtifact(input)
    }

    const queryExecutor = this.getQueryExecutor()
    const result = await queryExecutor.query<ExistingArtifactRow>(
      createSqlQuery(
        `
          INSERT INTO interview_artifacts (
            id,
            interview_id,
            artifact_kind,
            participant_id,
            participant_role,
            object_key,
            provider_asset_id,
            idempotency_key,
            content_metadata,
            captured_at,
            finalized_at,
            expires_at,
            deleted_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, $13, $13)
          ON CONFLICT (provider_asset_id) WHERE provider_asset_id IS NOT NULL DO NOTHING
          RETURNING id, object_key;
        `,
        [
          input.id,
          input.interview_id,
          input.artifact_kind,
          input.participant_id,
          input.participant_role,
          input.object_key,
          input.provider_asset_id,
          input.idempotency_key,
          JSON.stringify(input.content_metadata),
          input.captured_at,
          input.finalized_at,
          input.expires_at,
          input.created_at,
        ],
      ),
    )

    if (result.rows.length > 0) {
      return 'inserted'
    }

    // A retried or parallel finalization already persisted this provider asset.
    return 'duplicate'
  }

  async finalizeJob(providerRecordingId: string, now: string): Promise<void> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.finalizeJob(providerRecordingId, now)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE interview_recordings
          SET finalization_status = 'finalized',
              finalization_checkpoint = 'artifacts_copied',
              error_code = NULL,
              updated_at = $2
          WHERE provider_recording_id = $1;
        `,
        [providerRecordingId, now],
      ),
    )
  }

  async failJob(
    providerRecordingId: string,
    errorCode: string,
    checkpoint: string,
    now: string,
  ): Promise<void> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.failJob(providerRecordingId, errorCode, checkpoint, now)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE interview_recordings
          SET finalization_status = 'failed',
              finalization_checkpoint = $3,
              error_code = $2,
              updated_at = $4
          WHERE provider_recording_id = $1;
        `,
        [providerRecordingId, errorCode, checkpoint, now],
      ),
    )
  }

  async markEventProcessed(recordingId: string, now: string): Promise<void> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.markEventProcessed(recordingId, now)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE realtimekit_webhook_events
          SET status = 'processed',
              processed_at = $2,
              next_attempt_at = NULL,
              last_error_code = NULL
          WHERE recording_id = $1
            AND processed_at IS NULL;
        `,
        [recordingId, now],
      ),
    )
  }

  async markEventAwaiting(recordingId: string, nextAttemptAt: string): Promise<void> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.markEventAwaiting(recordingId, nextAttemptAt)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE realtimekit_webhook_events
          SET next_attempt_at = $2
          WHERE recording_id = $1
            AND processed_at IS NULL;
        `,
        [recordingId, nextAttemptAt],
      ),
    )
  }

  async markEventFailed(
    recordingId: string,
    errorCode: string,
    nextAttemptAt: string,
  ): Promise<void> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.markEventFailed(recordingId, errorCode, nextAttemptAt)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE realtimekit_webhook_events
          SET status = 'failed',
              last_error_code = $2,
              next_attempt_at = $3
          WHERE recording_id = $1
            AND processed_at IS NULL;
        `,
        [recordingId, errorCode, nextAttemptAt],
      ),
    )
  }

  async getAggregateReadiness(
    interviewId: string,
  ): Promise<RequiredRecordingArtifact[]> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.getAggregateReadiness(interviewId)
    }

    const result = await this.getQueryExecutor().query<RequiredRecordingArtifact>(
      createSqlQuery(
        `
          SELECT
            r.provider_recording_id,
            r.recording_type,
            CASE
              WHEN r.recording_type = 'composite' THEN 'playback_recording'
              ELSE 'transcription_audio'
            END AS artifact_kind,
            a.object_key AS artifact_object_key
          FROM interview_recordings r
          LEFT JOIN LATERAL (
            SELECT a.object_key
            FROM interview_artifacts a
            WHERE a.interview_id = r.interview_id
              AND a.deleted_at IS NULL
              AND a.object_key IS NOT NULL
              AND a.artifact_kind = CASE
                WHEN r.recording_type = 'composite' THEN 'playback_recording'
                ELSE 'transcription_audio'
              END
              AND (
                (r.participant_id IS NULL AND a.participant_id IS NULL)
                OR (r.participant_id IS NOT NULL AND a.participant_id = r.participant_id)
              )
            ORDER BY a.finalized_at DESC, a.id ASC
            LIMIT 1
          ) a ON TRUE
          WHERE r.interview_id = $1;
        `,
        [interviewId],
      ),
    )

    return result.rows
  }

  async setInterviewRecordingReady(interviewId: string, now: string): Promise<void> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.setInterviewRecordingReady(interviewId, now)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE interviews
          SET recording_status = 'ready',
              updated_at = $2
          WHERE id = $1
            AND recording_status <> 'ready';
        `,
        [interviewId, now],
      ),
    )
  }

  async listSweepCandidates(
    limit: number,
    now: string,
  ): Promise<SweepCandidateRow[]> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.listSweepCandidates(limit, now)
    }

    const result = await this.getQueryExecutor().query<SweepCandidateRow>(
      createSqlQuery(
        `
          SELECT provider_event_id, recording_id, attempt_count
          FROM realtimekit_webhook_events
          WHERE processed_at IS NULL
            AND next_attempt_at IS NOT NULL
            AND next_attempt_at <= $1
          ORDER BY next_attempt_at ASC, provider_event_id ASC
          LIMIT $2;
        `,
        [now, limit],
      ),
    )

    return result.rows
  }

  async updateSweepCheckpoint(
    providerEventId: string,
    attemptCount: number,
    nextAttemptAt: string | null,
    terminalAt: string | null,
  ): Promise<void> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.updateSweepCheckpoint(
        providerEventId,
        attemptCount,
        nextAttemptAt,
        terminalAt,
      )
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE realtimekit_webhook_events
          SET attempt_count = $2,
              next_attempt_at = $3,
              processed_at = $4,
              last_error_code = CASE
                WHEN $4 IS NULL THEN last_error_code
                ELSE 'sweep_exhausted'
              END
          WHERE provider_event_id = $1;
        `,
        [providerEventId, attemptCount, nextAttemptAt, terminalAt],
      ),
    )
  }

  async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return callback()
    }

    const queryExecutor = this.getQueryExecutor()
    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const result = await callback()
      await queryExecutor.query(createSqlQuery('COMMIT;'))
      return result
    } catch (error) {
      await rollbackTransactionSafely(queryExecutor)
      throw error
    }
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.dependencies.queryExecutor

    if (!queryExecutor) {
      throw new Error('Recording finalization query executor is not configured')
    }

    return queryExecutor
  }
}

function isDataSource(
  input: RecordingFinalizationRepositoryConstructorInput,
): input is RecordingFinalizationRepositoryDataSource {
  return (
    typeof input === 'object' &&
    input !== null &&
    'getJobWithInterview' in input &&
    typeof input.getJobWithInterview === 'function'
  )
}

function isQueryExecutor(
  input: RecordingFinalizationRepositoryConstructorInput,
): input is SqlQueryExecutor {
  return (
    typeof input === 'object' &&
    input !== null &&
    'query' in input &&
    typeof input.query === 'function'
  )
}

function hasRows<Row>(result: { rows: Row[]; rowCount?: number }): boolean {
  if (typeof result.rowCount === 'number') {
    return result.rowCount > 0
  }

  return result.rows.length > 0
}

type RawRecordingJobWithInterviewRow = {
  id: string
  interview_id: string
  provider_recording_id: string
  recording_type: 'composite' | 'participant_track'
  participant_id: string | null
  participant_role: string | null
  provider_status: string | null
  finalization_status: 'pending' | 'processing' | 'finalized' | 'failed'
  mode: 'ai_led' | 'peer_to_peer'
  scheduler_id: string
  interviewer_id: string | null
  recording_status: string
}
