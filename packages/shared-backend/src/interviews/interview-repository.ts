import type { Interview } from '@mako/shared'
import { createSqlQuery, type SqlQuery } from '../index'
import {
  InterviewPolicyConflictError,
  authenticatedInterviewUserIdSchema,
  createInterviewRecordInputSchema,
  interviewAccountPolicySchema,
  parseInterview,
  type CreateInterviewRecordInput,
  type InterviewAccountPolicy,
} from './types'

export type QueryResult<Row> = {
  rows: Row[]
  rowCount?: number
}

export type SqlQueryExecutor = {
  query<Row>(query: SqlQuery): Promise<QueryResult<Row>>
}

export interface InterviewRepositoryDataSource {
  getAccountPolicy(userId: string): Promise<InterviewAccountPolicy | null>
  createDirectInterview(input: CreateInterviewRecordInput): Promise<Interview>
}

export type InMemoryInterviewAccountRecord = {
  userId: string
  credits: number
  freeAiInterviews: number
}

type InterviewRepositoryDependencies = {
  dataSource?: InterviewRepositoryDataSource
  queryExecutor?: SqlQueryExecutor
}

type InterviewRepositoryConstructorInput =
  | InterviewRepositoryDataSource
  | SqlQueryExecutor
  | InterviewRepositoryDependencies

export class InterviewRepository {
  private readonly dependencies: InterviewRepositoryDependencies

  constructor(input: InterviewRepositoryConstructorInput) {
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

  async getAccountPolicy(userId: string): Promise<InterviewAccountPolicy | null> {
    const authenticatedUserId = authenticatedInterviewUserIdSchema.parse(userId)
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.getAccountPolicy(authenticatedUserId)
    }

    const result = await this.getQueryExecutor().query<InterviewAccountPolicy>(
      createSqlQuery(
        `
          SELECT credits, free_ai_interviews
          FROM users
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1;
        `,
        [authenticatedUserId],
      ),
    )

    const [row] = result.rows

    if (!row) {
      return null
    }

    return interviewAccountPolicySchema.parse(row)
  }

  async createDirectInterview(input: CreateInterviewRecordInput): Promise<Interview> {
    const parsedInput = createInterviewRecordInputSchema.parse(input)
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.createDirectInterview(parsedInput)
    }

    const queryExecutor = this.getQueryExecutor()
    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const reservationResult = await queryExecutor.query<{ id: string }>(
        buildConsumptionReservationQuery(parsedInput),
      )

      if (!hasRows(reservationResult)) {
        throw new InterviewPolicyConflictError()
      }

      const insertResult = await queryExecutor.query<Interview>(
        createSqlQuery(
          `
            INSERT INTO interviews (
              id,
              scheduler_id,
              scheduler_alias,
              interviewer_id,
              interviewer_alias,
              type,
              mode,
              tier,
              status,
              scheduled_at,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING
              id,
              scheduler_id,
              scheduler_alias,
              interviewer_id,
              interviewer_alias,
              type,
              mode,
              tier,
              status,
              scheduled_at,
              created_at,
              updated_at;
          `,
          [
            parsedInput.id,
            parsedInput.scheduler_id,
            parsedInput.scheduler_alias,
            parsedInput.interviewer_id,
            parsedInput.interviewer_alias,
            parsedInput.type,
            parsedInput.mode,
            parsedInput.tier,
            parsedInput.status,
            parsedInput.scheduled_at,
            parsedInput.created_at,
            parsedInput.updated_at,
          ],
        ),
      )

      const [createdInterview] = insertResult.rows

      if (!createdInterview) {
        throw new Error('Failed to insert interview record.')
      }

      await queryExecutor.query(createSqlQuery('COMMIT;'))
      return parseInterview(createdInterview)
    } catch (error) {
      await rollbackTransactionSafely(queryExecutor)
      throw error
    }
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.dependencies.queryExecutor

    if (!queryExecutor) {
      throw new Error('Interview query executor is not configured')
    }

    return queryExecutor
  }
}

export function createInMemoryInterviewDataSource(
  seedAccounts: readonly InMemoryInterviewAccountRecord[],
): InterviewRepositoryDataSource {
  const accountStateByUserId = new Map<
    string,
    { credits: number; freeAiInterviews: number }
  >()

  for (const account of seedAccounts) {
    accountStateByUserId.set(account.userId, {
      credits: account.credits,
      freeAiInterviews: account.freeAiInterviews,
    })
  }

  return {
    async getAccountPolicy(userId: string): Promise<InterviewAccountPolicy | null> {
      const accountState = accountStateByUserId.get(userId)

      if (!accountState) {
        return null
      }

      return {
        credits: accountState.credits,
        free_ai_interviews: accountState.freeAiInterviews,
      }
    },
    async createDirectInterview(input: CreateInterviewRecordInput): Promise<Interview> {
      const parsedInput = createInterviewRecordInputSchema.parse(input)
      const accountState = accountStateByUserId.get(parsedInput.scheduler_id)

      if (!accountState) {
        throw new InterviewPolicyConflictError('Account state is unavailable.')
      }

      if (parsedInput.policy_consumption === 'free_ai_interview') {
        if (accountState.freeAiInterviews <= 0) {
          throw new InterviewPolicyConflictError()
        }

        accountState.freeAiInterviews -= 1
      }

      if (parsedInput.policy_consumption === 'credit') {
        if (accountState.credits <= 0) {
          throw new InterviewPolicyConflictError()
        }

        accountState.credits -= 1
      }

      const interview = parseInterview(parsedInput)
      return structuredClone(interview)
    },
  }
}

function isDataSource(
  input: InterviewRepositoryConstructorInput,
): input is InterviewRepositoryDataSource {
  return (
    typeof input === 'object' &&
    input !== null &&
    'getAccountPolicy' in input &&
    typeof input.getAccountPolicy === 'function' &&
    'createDirectInterview' in input &&
    typeof input.createDirectInterview === 'function'
  )
}

function isQueryExecutor(
  input: InterviewRepositoryConstructorInput,
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

function buildConsumptionReservationQuery(
  input: CreateInterviewRecordInput,
): SqlQuery {
  if (input.policy_consumption === 'free_ai_interview') {
    return createSqlQuery(
      `
        UPDATE users
        SET free_ai_interviews = free_ai_interviews - 1,
            updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
          AND free_ai_interviews > 0
        RETURNING id;
      `,
      [input.scheduler_id],
    )
  }

  return createSqlQuery(
    `
      UPDATE users
      SET credits = credits - 1,
          updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
        AND credits > 0
      RETURNING id;
    `,
    [input.scheduler_id],
  )
}

async function rollbackTransactionSafely(
  queryExecutor: SqlQueryExecutor,
): Promise<void> {
  try {
    await queryExecutor.query(createSqlQuery('ROLLBACK;'))
  } catch {}
}
