import {
  createSqlQuery,
  type QueryResult,
  type SqlQueryExecutor,
} from '../index'

export type ScreenshotArtifactRow = {
  id: string
  interview_id: string
  artifact_kind: 'screenshot'
  object_key: string
  idempotency_key: string
  content_type: string
  content_size_bytes: number
  capture_timestamp: string
  finalized_at: string | null
  expires_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type InsertScreenshotInput = {
  id: string
  interview_id: string
  object_key: string
  idempotency_key: string
  content_type: string
  content_size_bytes: number
  capture_timestamp: string
  created_at: string
  updated_at: string
  max_screenshots: number
}

export type ScreenshotRepositoryDependencies = {
  queryExecutor?: SqlQueryExecutor
}

type ScreenshotRepositoryConstructorInput =
  | ScreenshotRepositoryDependencies
  | SqlQueryExecutor

export class ScreenshotRepository {
  private readonly queryExecutor: SqlQueryExecutor | undefined

  constructor(input: ScreenshotRepositoryConstructorInput) {
    if (isQueryExecutor(input)) {
      this.queryExecutor = input
      return
    }

    this.queryExecutor = input.queryExecutor
  }

  async insertScreenshot(
    input: InsertScreenshotInput,
  ): Promise<{ outcome: 'inserted' | 'duplicate'; row?: ScreenshotArtifactRow }> {
    const result = await this.getQueryExecutor().query<ScreenshotArtifactRow>(
      createSqlQuery(
        `
          INSERT INTO interview_artifacts (
            id,
            interview_id,
            artifact_kind,
            object_key,
            idempotency_key,
            content_type,
            content_size_bytes,
            capture_timestamp,
            created_at,
            updated_at
          )
          SELECT $1, $2, 'screenshot', $3, $4, $5, $6, $7, $8, $8
          WHERE EXISTS (
            SELECT 1 FROM interviews
            WHERE id = $2
              AND screenshots_finalized_at IS NULL
          )
          AND (
            SELECT COUNT(*) FROM interview_artifacts
            WHERE interview_id = $2
              AND artifact_kind = 'screenshot'
              AND deleted_at IS NULL
          ) < $9
          ON CONFLICT (interview_id, idempotency_key) DO NOTHING
          RETURNING
            id,
            interview_id,
            artifact_kind,
            object_key,
            idempotency_key,
            content_type,
            content_size_bytes,
            capture_timestamp,
            finalized_at,
            expires_at,
            deleted_at,
            created_at,
            updated_at;
        `,
        [
          input.id,
          input.interview_id,
          input.object_key,
          input.idempotency_key,
          input.content_type,
          input.content_size_bytes,
          input.capture_timestamp,
          input.created_at,
          input.max_screenshots,
        ],
      ),
    )

    const [row] = result.rows

    if (row) {
      return { outcome: 'inserted', row }
    }

    // The (interview_id, idempotency_key) conflict guard returned no row, so a
    // retried upload resolved against an existing artifact. Return the existing
    // row so the service can expose the original stable capture id.
    const existingResult = await this.getQueryExecutor().query<ScreenshotArtifactRow>(
      createSqlQuery(
        `
          SELECT
            id,
            interview_id,
            artifact_kind,
            object_key,
            idempotency_key,
            content_type,
            content_size_bytes,
            capture_timestamp,
            finalized_at,
            expires_at,
            deleted_at,
            created_at,
            updated_at
          FROM interview_artifacts
          WHERE interview_id = $1
            AND idempotency_key = $2
          LIMIT 1;
        `,
        [input.interview_id, input.idempotency_key],
      ),
    )

    const [existingRow] = existingResult.rows
    return { outcome: 'duplicate', row: existingRow }
  }

  async countScreenshots(interviewId: string): Promise<number> {
    const result = await this.getQueryExecutor().query<{ count: number }>(
      createSqlQuery(
        `
          SELECT COUNT(*)::int AS count
          FROM interview_artifacts
          WHERE interview_id = $1
            AND artifact_kind = 'screenshot'
            AND deleted_at IS NULL;
        `,
        [interviewId],
      ),
    )

    const [row] = result.rows
    return row?.count ?? 0
  }

  async isFinalized(interviewId: string): Promise<boolean> {
    const result = await this.getQueryExecutor().query<{
      screenshots_finalized_at: string | null
    }>(
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

    const [row] = result.rows
    return Boolean(row?.screenshots_finalized_at)
  }

  // Scaffolding for future screenshot finalization stories (5.16/5.17).
  // Not currently called by any production code path.
  async finalizeScreenshots(interviewId: string, timestamp: string): Promise<boolean> {
    const result = await this.getQueryExecutor().query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE interviews
          SET screenshots_finalized_at = $2
          WHERE id = $1
            AND screenshots_finalized_at IS NULL
          RETURNING id;
        `,
        [interviewId, timestamp],
      ),
    )

    return hasRows(result)
  }

  // Scaffolding for future artifact cleanup stories (5.16/5.17).
  // Not currently called by any production code path.
  async deleteByKey(key: string): Promise<void> {
    await this.getQueryExecutor().query<{ id: string }>(
      createSqlQuery(
        `
          DELETE FROM interview_artifacts
          WHERE object_key = $1;
        `,
        [key],
      ),
    )
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.queryExecutor

    if (!queryExecutor) {
      throw new Error('Screenshot query executor is not configured')
    }

    return queryExecutor
  }
}

function isQueryExecutor(
  input: ScreenshotRepositoryConstructorInput,
): input is SqlQueryExecutor {
  return (
    typeof input === 'object' &&
    input !== null &&
    'query' in input &&
    typeof input.query === 'function'
  )
}

function hasRows<Row>(queryResult: QueryResult<Row>): boolean {
  if (typeof queryResult.rowCount === 'number') {
    return queryResult.rowCount > 0
  }

  return queryResult.rows.length > 0
}
