import {
  createSqlQuery,
  type SqlQueryExecutor,
} from '../index'

export type ReadableArtifactRow = {
  id: string
  interview_id: string
  artifact_kind: 'playback_recording' | 'screenshot'
  object_key: string
  content_metadata: Record<string, unknown> | null
  finalized_at: string | null
  expires_at: string | null
  deleted_at: string | null
}

export type PendingRecordingRow = {
  id: string
  finalization_status: 'pending' | 'processing' | 'finalized' | 'failed'
}

export type ArtifactReadRepositoryDependencies = {
  queryExecutor?: SqlQueryExecutor
}

export type ArtifactReadRepositoryConstructorInput =
  | ArtifactReadRepositoryDependencies
  | SqlQueryExecutor

function isQueryExecutor(
  input: ArtifactReadRepositoryConstructorInput,
): input is SqlQueryExecutor {
  return (
    typeof input === 'object' &&
    input !== null &&
    'query' in input &&
    typeof input.query === 'function'
  )
}

/**
 * Resolves participant-facing artifact identifiers to normalized
 * `interview_artifacts` rows. Object keys stay server-only: callers receive
 * durable rows and stream through the private storage port.
 */
export class ArtifactReadRepository {
  private readonly queryExecutor: SqlQueryExecutor | undefined

  constructor(input: ArtifactReadRepositoryConstructorInput) {
    if (isQueryExecutor(input)) {
      this.queryExecutor = input
      return
    }

    this.queryExecutor = input.queryExecutor
  }

  async getRecordingArtifact(interviewId: string): Promise<ReadableArtifactRow | null> {
    const result = await this.getQueryExecutor().query<ReadableArtifactRow>(
      createSqlQuery(
        `
          SELECT
            id,
            interview_id,
            artifact_kind,
            object_key,
            content_metadata,
            finalized_at,
            expires_at,
            deleted_at
          FROM interview_artifacts
          WHERE interview_id = $1
            AND artifact_kind = 'playback_recording'
          ORDER BY finalized_at DESC NULLS LAST, created_at DESC
          LIMIT 1;
        `,
        [interviewId],
      ),
    )

    return result.rows[0] ?? null
  }

  async listScreenshotArtifacts(interviewId: string): Promise<ReadableArtifactRow[]> {
    const result = await this.getQueryExecutor().query<ReadableArtifactRow>(
      createSqlQuery(
        `
          SELECT
            id,
            interview_id,
            artifact_kind,
            object_key,
            content_metadata,
            finalized_at,
            expires_at,
            deleted_at
          FROM interview_artifacts
          WHERE interview_id = $1
            AND artifact_kind = 'screenshot'
          ORDER BY created_at ASC;
        `,
        [interviewId],
      ),
    )

    return result.rows
  }

  async getScreenshotArtifact(
    interviewId: string,
    captureId: string,
  ): Promise<ReadableArtifactRow | null> {
    const result = await this.getQueryExecutor().query<ReadableArtifactRow>(
      createSqlQuery(
        `
          SELECT
            id,
            interview_id,
            artifact_kind,
            object_key,
            content_metadata,
            finalized_at,
            expires_at,
            deleted_at
          FROM interview_artifacts
          WHERE interview_id = $1
            AND id = $2
            AND artifact_kind = 'screenshot'
          LIMIT 1;
        `,
        [interviewId, captureId],
      ),
    )

    return result.rows[0] ?? null
  }

  async getRecordingFinalizationStatus(
    interviewId: string,
  ): Promise<PendingRecordingRow | null> {
    const result = await this.getQueryExecutor().query<PendingRecordingRow>(
      createSqlQuery(
        `
          SELECT id, finalization_status
          FROM interview_recordings
          WHERE interview_id = $1
          ORDER BY created_at DESC
          LIMIT 1;
        `,
        [interviewId],
      ),
    )

    return result.rows[0] ?? null
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.queryExecutor

    if (!queryExecutor) {
      throw new Error('Artifact read query executor is not configured')
    }

    return queryExecutor
  }
}
