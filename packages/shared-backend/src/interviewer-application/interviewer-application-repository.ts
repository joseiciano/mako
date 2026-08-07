import {
  parseInterviewerApplicationRow,
  parseUserCompanyRow,
  type InterviewerApplicationRow,
} from '../database/foundation-schemas'
import { createSqlQuery, type SqlQueryExecutor } from '../index'
import {
  InterviewerApplicationConflictError,
  InterviewerApplicationForbiddenError,
  InterviewerApplicationValidationError,
  snapshotEntryWriteSchema,
} from './types'

export type QueryResult<Row> = {
  rows: Row[]
  rowCount?: number
}

export type InterviewerApplicationRepositoryDataSource = {
  isUserActive(userId: string): Promise<boolean>
  hasActiveApplication(userId: string): Promise<boolean>
  getLatestApplication(userId: string): Promise<InterviewerApplicationRow | null>
  submitApplication(input: SubmitApplicationInput): Promise<InterviewerApplicationRow>
}

export type SubmitApplicationInput = {
  userId: string
  email: string
  employmentRecordIds: string[]
}

type InterviewerApplicationRepositoryDependencies = {
  dataSource?: InterviewerApplicationRepositoryDataSource
  queryExecutor?: SqlQueryExecutor
}

type InterviewerApplicationRepositoryConstructorInput =
  | InterviewerApplicationRepositoryDataSource
  | SqlQueryExecutor
  | InterviewerApplicationRepositoryDependencies

export class InterviewerApplicationRepository {
  private readonly dependencies: InterviewerApplicationRepositoryDependencies

  constructor(input: InterviewerApplicationRepositoryConstructorInput) {
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

  async isUserActive(userId: string): Promise<boolean> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.isUserActive(userId)
    }

    const result = await this.getQueryExecutor().query<{ exists: number }>({
      text: `
        SELECT 1 FROM "user"
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1;
      `,
      values: [userId],
    })

    return result.rows.length > 0
  }

  async hasActiveApplication(userId: string): Promise<boolean> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.hasActiveApplication(userId)
    }

    const result = await this.getQueryExecutor().query<{ id: string }>({
      text: `
        SELECT id
        FROM user_interviewer_applications
        WHERE user_id = $1
          AND status IN ('pending', 'approved')
        LIMIT 1;
      `,
      values: [userId],
    })

    return result.rows.length > 0
  }

  async getLatestApplication(userId: string): Promise<InterviewerApplicationRow | null> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.getLatestApplication(userId)
    }

    const result = await this.getQueryExecutor().query<InterviewerApplicationRow>({
      text: `
        SELECT
          id,
          user_id,
          email,
          employment_history,
          status,
          reviewed_by,
          created_at,
          updated_at
        FROM user_interviewer_applications
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1;
      `,
      values: [userId],
    })

    const [latestRow] = result.rows

    if (!latestRow) {
      return null
    }

    return parseInterviewerApplicationRow(latestRow)
  }

  async submitApplication(input: SubmitApplicationInput): Promise<InterviewerApplicationRow> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.submitApplication(input)
    }

    const queryExecutor = this.getQueryExecutor()
    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      // 1. Lock the applicant "user" row and revalidate the account is active.
      const userResult = await queryExecutor.query<{ id: string }>(
        createSqlQuery(
          `
            SELECT id
            FROM "user"
            WHERE id = $1
              AND deleted_at IS NULL
            FOR UPDATE;
          `,
          [input.userId],
        ),
      )

      if (userResult.rows.length === 0) {
        throw new InterviewerApplicationForbiddenError()
      }

      // 2. Reject when a pending or approved application already exists.
      const activeApplicationResult = await queryExecutor.query<{ id: string }>(
        createSqlQuery(
          `
            SELECT id
            FROM user_interviewer_applications
            WHERE user_id = $1
              AND status IN ('pending', 'approved')
            LIMIT 1;
          `,
          [input.userId],
        ),
      )

      if (activeApplicationResult.rows.length > 0) {
        throw new InterviewerApplicationConflictError()
      }

      // 3. Lock the selected user_companies rows sorted by id ascending, then
      //    revalidate every selection resolves to an active, complete record
      //    owned by the authenticated user.
      const companyResult = await queryExecutor.query(
        createSqlQuery(
          `
            SELECT
              id,
              user_id,
              company,
              role,
              joined,
              ended_at,
              created_at,
              updated_at,
              deleted_at
            FROM user_companies
            WHERE id = ANY($2)
              AND user_id = $1
              AND deleted_at IS NULL
              AND role IS NOT NULL
            ORDER BY id ASC
            FOR UPDATE;
          `,
          [input.userId, input.employmentRecordIds],
        ),
      )

      if (companyResult.rows.length !== input.employmentRecordIds.length) {
        throw new InterviewerApplicationValidationError(
          'One or more selected employment records are missing, deleted, incomplete, or not owned by you.',
        )
      }

      const snapshotEntries = companyResult.rows.map(function buildSnapshotEntry(row) {
        const companyRow = parseUserCompanyRow(row)

        return snapshotEntryWriteSchema.parse({
          sourceCompanyId: companyRow.id,
          company: companyRow.company,
          role: companyRow.role,
          start: extractDateOnly(companyRow.joined),
          end: companyRow.ended_at ? extractDateOnly(companyRow.ended_at) : null,
        })
      })

      // 4. Persist the application with its immutable employment_history snapshot.
      const applicationId = crypto.randomUUID()
      const now = new Date().toISOString()

      let insertResult: QueryResult<InterviewerApplicationRow>

      try {
        insertResult = await queryExecutor.query<InterviewerApplicationRow>(
          createSqlQuery(
            `
              INSERT INTO user_interviewer_applications (
                id,
                user_id,
                email,
                employment_history,
                status,
                created_at,
                updated_at
              ) VALUES ($1, $2, $3, $4, 'pending', $5, $6)
              RETURNING
                id,
                user_id,
                email,
                employment_history,
                status,
                reviewed_by,
                created_at,
                updated_at;
            `,
            [
              applicationId,
              input.userId,
              input.email,
              JSON.stringify(snapshotEntries),
              now,
              now,
            ],
          ),
        )
      } catch (error) {
        if (isUniqueViolationError(error)) {
          throw new InterviewerApplicationConflictError()
        }

        throw error
      }

      const [createdRow] = insertResult.rows

      if (!createdRow) {
        throw new Error('Failed to insert interviewer application record.')
      }

      await queryExecutor.query(createSqlQuery('COMMIT;'))

      return parseInterviewerApplicationRow(createdRow)
    } catch (error) {
      await rollbackTransactionSafely(queryExecutor)
      throw error
    }
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.dependencies.queryExecutor

    if (!queryExecutor) {
      throw new Error('Interviewer application query executor is not configured')
    }

    return queryExecutor
  }
}

export function createInMemoryInterviewerApplicationDataSource(): InterviewerApplicationRepositoryDataSource {
  const applicationsByUserId = new Map<string, InterviewerApplicationRow>()

  return {
    async isUserActive() {
      return true
    },
    async hasActiveApplication(userId) {
      const application = applicationsByUserId.get(userId)
      return application !== undefined && application.status !== 'rejected'
    },
    async getLatestApplication(userId) {
      const application = applicationsByUserId.get(userId)
      return application ? structuredClone(application) : null
    },
    async submitApplication(input) {
      const existing = applicationsByUserId.get(input.userId)

      if (existing && existing.status !== 'rejected') {
        throw new InterviewerApplicationConflictError()
      }

      const now = new Date().toISOString()
      const applicationRow = parseInterviewerApplicationRow({
        id: crypto.randomUUID(),
        user_id: input.userId,
        email: input.email,
        employment_history: input.employmentRecordIds.map(
          function buildSyntheticSnapshotEntry(sourceCompanyId) {
            return {
              sourceCompanyId,
              company: 'demo company',
              role: 'demo role',
              start: '2020-01-01',
              end: null,
            }
          },
        ),
        status: 'pending',
        reviewed_by: null,
        created_at: now,
        updated_at: now,
      })

      applicationsByUserId.set(input.userId, structuredClone(applicationRow))
      return applicationRow
    },
  }
}

function isDataSource(
  input: InterviewerApplicationRepositoryConstructorInput,
): input is InterviewerApplicationRepositoryDataSource {
  return (
    typeof input === 'object' &&
    input !== null &&
    'isUserActive' in input &&
    typeof input.isUserActive === 'function' &&
    'hasActiveApplication' in input &&
    typeof input.hasActiveApplication === 'function' &&
    'getLatestApplication' in input &&
    typeof input.getLatestApplication === 'function' &&
    'submitApplication' in input &&
    typeof input.submitApplication === 'function'
  )
}

function isQueryExecutor(
  input: InterviewerApplicationRepositoryConstructorInput,
): input is SqlQueryExecutor {
  return (
    typeof input === 'object' &&
    input !== null &&
    'query' in input &&
    typeof input.query === 'function'
  )
}

async function rollbackTransactionSafely(queryExecutor: SqlQueryExecutor): Promise<void> {
  try {
    await queryExecutor.query(createSqlQuery('ROLLBACK;'))
  } catch (error) {
    console.error('Transaction rollback failed', error)
  }
}

function isUniqueViolationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === '23505'
  )
}

function extractDateOnly(isoTimestamp: string): string {
  // Timestamps are persisted as ISO-8601 UTC strings, so the first 10
  // characters are the UTC date (YYYY-MM-DD) without timezone drift.
  return isoTimestamp.slice(0, 10)
}
