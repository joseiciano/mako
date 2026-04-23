import type { Interview } from '@mako/shared'
import { createSqlQuery, type SqlQuery } from '../index'
import {
  cancelInterviewRecordInputSchema,
  InterviewPolicyConflictError,
  listParticipantInterviewsInputSchema,
  authenticatedInterviewUserIdSchema,
  createInterviewRecordInputSchema,
  interviewAccountPolicySchema,
  parseInterview,
  type CancelInterviewRecordInput,
  type CancelInterviewRecordResult,
  type CreateInterviewRecordInput,
  type InterviewAccountPolicy,
  type ListParticipantInterviewsInput,
  type ParsedListParticipantInterviewsInput,
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
  listParticipantInterviews?(
    input: ListParticipantInterviewsInput,
  ): Promise<Interview[]>
  cancelInterview?(
    input: CancelInterviewRecordInput,
  ): Promise<CancelInterviewRecordResult>
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

  async listParticipantInterviews(
    input: ListParticipantInterviewsInput,
  ): Promise<Interview[]> {
    const parsedInput = listParticipantInterviewsInputSchema.parse(input)
    const dataSource = this.dependencies.dataSource

    if (typeof dataSource?.listParticipantInterviews === 'function') {
      return dataSource.listParticipantInterviews(parsedInput)
    }

    const result = await this.getQueryExecutor().query<Interview>(
      buildListParticipantInterviewsQuery(parsedInput),
    )

    return result.rows.map(function parseInterviewRow(row) {
      return parseInterview(row)
    })
  }

  async cancelInterview(
    input: CancelInterviewRecordInput,
  ): Promise<CancelInterviewRecordResult> {
    const parsedInput = cancelInterviewRecordInputSchema.parse(input)
    const dataSource = this.dependencies.dataSource

    if (typeof dataSource?.cancelInterview === 'function') {
      return dataSource.cancelInterview(parsedInput)
    }

    const queryExecutor = this.getQueryExecutor()
    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const lookupResult = await queryExecutor.query<Interview>(
        createSqlQuery(
          `
            SELECT
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
            FROM interviews
            WHERE id = $1
              AND (scheduler_id = $2 OR interviewer_id = $2)
            LIMIT 1
            FOR UPDATE;
          `,
          [parsedInput.interview_id, parsedInput.participant_user_id],
        ),
      )

      const [existingInterview] = lookupResult.rows

      if (!existingInterview) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return { outcome: 'not_found' }
      }

      const parsedInterview = parseInterview(existingInterview)

      if (parsedInterview.status === 'cancelled') {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'already_cancelled',
          interview: parsedInterview,
        }
      }

      if (parsedInterview.status !== 'scheduled') {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'invalid_status',
          interview: parsedInterview,
        }
      }

      const updateResult = await queryExecutor.query<Interview>(
        createSqlQuery(
          `
            UPDATE interviews
            SET status = 'cancelled',
                updated_at = $2
            WHERE id = $1
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
          [parsedInput.interview_id, parsedInput.updated_at],
        ),
      )

      const [cancelledInterview] = updateResult.rows

      if (!cancelledInterview) {
        throw new Error('Failed to cancel interview record.')
      }

      await queryExecutor.query(createSqlQuery('COMMIT;'))

      return {
        outcome: 'cancelled',
        interview: parseInterview(cancelledInterview),
      }
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
  seedInterviews: readonly Interview[] = [],
): InterviewRepositoryDataSource {
  const accountStateByUserId = new Map<
    string,
    { credits: number; freeAiInterviews: number }
  >()
  const interviewsById = new Map<string, Interview>()

  for (const account of seedAccounts) {
    accountStateByUserId.set(account.userId, {
      credits: account.credits,
      freeAiInterviews: account.freeAiInterviews,
    })
  }

  for (const interview of seedInterviews) {
    interviewsById.set(interview.id, structuredClone(interview))
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
      interviewsById.set(interview.id, structuredClone(interview))
      return structuredClone(interview)
    },
    async listParticipantInterviews(
      input: ListParticipantInterviewsInput,
    ): Promise<Interview[]> {
      const parsedInput = listParticipantInterviewsInputSchema.parse(input)

      return Array.from(interviewsById.values())
        .filter(function isParticipantInterview(interview) {
          return (
            interview.scheduler_id === parsedInput.participant_user_id ||
            interview.interviewer_id === parsedInput.participant_user_id
          )
        })
        .filter(function matchesStatus(interview) {
          return parsedInput.status === undefined
            ? true
            : interview.status === parsedInput.status
        })
        .sort(compareInterviewListOrder)
        .slice(parsedInput.offset, parsedInput.offset + parsedInput.limit)
        .map(function cloneInterview(interview) {
          return structuredClone(interview)
        })
    },
    async cancelInterview(
      input: CancelInterviewRecordInput,
    ): Promise<CancelInterviewRecordResult> {
      const parsedInput = cancelInterviewRecordInputSchema.parse(input)
      const existingInterview = interviewsById.get(parsedInput.interview_id)

      if (
        !existingInterview ||
        (existingInterview.scheduler_id !== parsedInput.participant_user_id &&
          existingInterview.interviewer_id !== parsedInput.participant_user_id)
      ) {
        return { outcome: 'not_found' }
      }

      if (existingInterview.status === 'cancelled') {
        return {
          outcome: 'already_cancelled',
          interview: structuredClone(existingInterview),
        }
      }

      if (existingInterview.status !== 'scheduled') {
        return {
          outcome: 'invalid_status',
          interview: structuredClone(existingInterview),
        }
      }

      const cancelledInterview = parseInterview({
        ...existingInterview,
        status: 'cancelled',
        updated_at: parsedInput.updated_at,
      })

      interviewsById.set(cancelledInterview.id, structuredClone(cancelledInterview))

      return {
        outcome: 'cancelled',
        interview: structuredClone(cancelledInterview),
      }
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

function compareInterviewListOrder(left: Interview, right: Interview): number {
  if (left.scheduled_at < right.scheduled_at) {
    return -1
  }

  if (left.scheduled_at > right.scheduled_at) {
    return 1
  }

  if (left.id < right.id) {
    return -1
  }

  if (left.id > right.id) {
    return 1
  }

  return 0
}

function buildListParticipantInterviewsQuery(
  input: ParsedListParticipantInterviewsInput,
): SqlQuery {
  const hasStatusFilter = input.status !== undefined
  const statusClause = hasStatusFilter ? 'AND status = $2' : ''
  const limitPlaceholder = hasStatusFilter ? '$3' : '$2'
  const offsetPlaceholder = hasStatusFilter ? '$4' : '$3'
  const values = hasStatusFilter
    ? [input.participant_user_id, input.status, input.limit, input.offset]
    : [input.participant_user_id, input.limit, input.offset]

  return createSqlQuery(
    `
      SELECT
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
      FROM (
        SELECT
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
        FROM interviews
        WHERE scheduler_id = $1
          ${statusClause}
        UNION ALL
        SELECT
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
        FROM interviews
        WHERE interviewer_id = $1
          ${statusClause}
      ) AS participant_interviews
      ORDER BY scheduled_at ASC, id ASC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder};
    `,
    values,
  )
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
