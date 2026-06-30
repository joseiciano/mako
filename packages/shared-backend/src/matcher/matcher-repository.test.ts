import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import {
  MatcherRepository,
  type MatcherRepositoryLogger,
} from './matcher-repository'
import type { MatcherPairAttempt } from './types'

describe('MatcherRepository', function matcherRepositorySuite() {
  it('queries only active and available future candidates in deterministic order', async function shouldBuildCandidateQuery() {
    const executedQueries: SqlQuery[] = []
    const repository = new MatcherRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

        return {
          rows: [
            {
              request_id: '11111111-1111-4111-8111-111111111111',
              request_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              request_created_at: '2026-04-01T00:00:00.000Z',
              interview_type: 'system_design',
              slot_id: '22222222-2222-4222-8222-222222222222',
              slot_start_time: '2026-04-05T10:00:00.000Z',
              slot_end_time: '2026-04-05T11:00:00.000Z',
            },
          ] as Row[],
        }
      },
    })

    const candidates = await repository.listCandidateRows()

    expect(candidates).toHaveLength(1)
    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]?.text).toContain("slots.status = 'available'")
    expect(executedQueries[0]?.text).toContain("requests.status = 'active'")
    expect(executedQueries[0]?.text).toContain(
      'requests.current_matches < requests.max_matches',
    )
    expect(executedQueries[0]?.text).toContain('slots.start_time > NOW()')
    expect(executedQueries[0]?.text).toContain('requests.created_at ASC')
    expect(executedQueries[0]?.text).toContain('requests.id ASC')
    expect(executedQueries[0]?.text).toContain('slots.start_time ASC')
    expect(executedQueries[0]?.text).toContain('slots.id ASC')
    expect(executedQueries[0]?.values).toEqual([])
  })

  it('writes interviews atomically after deterministic locks and eligibility re-checks', async function shouldWriteMatchedPairInsideTransaction() {
    const executedQueries: SqlQuery[] = []
    const pairAttempt = createPairAttempt()
    const lockedSlotRowsById: Record<string, unknown> = {
      [pairAttempt.left.slot_id]: {
        id: pairAttempt.left.slot_id,
        request_id: pairAttempt.left.request_id,
        start_time: '2026-04-10T10:00:00.000Z',
        end_time: '2026-04-10T11:00:00.000Z',
        status: 'available',
      },
      [pairAttempt.right.slot_id]: {
        id: pairAttempt.right.slot_id,
        request_id: pairAttempt.right.request_id,
        start_time: '2026-04-10T10:30:00.000Z',
        end_time: '2026-04-10T11:30:00.000Z',
        status: 'available',
      },
    }
    const lockedRequestRowsById: Record<string, unknown> = {
      [pairAttempt.left.request_id]: {
        id: pairAttempt.left.request_id,
        user_id: pairAttempt.left.request_user_id,
        created_at: '2026-04-02T10:00:00.000Z',
        current_matches: 0,
        max_matches: 2,
        interview_type: 'system_design',
        status: 'active',
      },
      [pairAttempt.right.request_id]: {
        id: pairAttempt.right.request_id,
        user_id: pairAttempt.right.request_user_id,
        created_at: '2026-04-01T10:00:00.000Z',
        current_matches: 0,
        max_matches: 2,
        interview_type: 'system_design',
        status: 'active',
      },
    }
    const repository = new MatcherRepository(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)

          if (
            queryInput.text.includes('FROM availability_slots') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const slotId = queryInput.values[0] as string
            const slotRow = lockedSlotRowsById[slotId]

            return {
              rows: slotRow ? ([slotRow] as Row[]) : ([] as Row[]),
            }
          }

          if (
            queryInput.text.includes('FROM availability_requests') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const requestId = queryInput.values[0] as string
            const requestRow = lockedRequestRowsById[requestId]

            return {
              rows: requestRow ? ([requestRow] as Row[]) : ([] as Row[]),
            }
          }

          if (queryInput.text.includes('FROM "user"') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                  free_standard_interviews: 1,
                  credits: 1,
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('UPDATE "user"')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                },
              ] as Row[],
            }
          }

          return { rows: [] as Row[] }
        },
      },
      {
        createId: function createFixedInterviewId() {
          return '99999999-9999-4999-8999-999999999999'
        },
        now: function createFixedNowTimestamp() {
          return '2026-04-01T12:00:00.000Z'
        },
      },
    )

    const result = await repository.executePairAttemptTransaction(pairAttempt)

    expect(result).toEqual({
      status: 'created',
      interviewId: '99999999-9999-4999-8999-999999999999',
      interview: {
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        interviewer_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        type: 'system_design',
        mode: 'peer_to_peer',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      },
      diagnostics: {
        transactionConflicts: 0,
        transactionRetries: 0,
      },
    })

    expect(executedQueries[0]?.text).toContain('BEGIN')
    expect(executedQueries[executedQueries.length - 1]?.text).toContain('COMMIT')

    const slotLockQueries = executedQueries.filter(function isSlotLockQuery(sqlQuery) {
      return (
        sqlQuery.text.includes('FROM availability_slots') &&
        sqlQuery.text.includes('FOR UPDATE')
      )
    })

    expect(slotLockQueries.map(function mapSlotLockId(sqlQuery) {
      return sqlQuery.values[0]
    })).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ])

    const requestLockQueries = executedQueries.filter(
      function isRequestLockQuery(sqlQuery) {
        return (
          sqlQuery.text.includes('FROM availability_requests') &&
          sqlQuery.text.includes('FOR UPDATE')
        )
      },
    )

    expect(requestLockQueries.map(function mapRequestLockId(sqlQuery) {
      return sqlQuery.values[0]
    })).toEqual([
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ])

    const interviewInsertQuery = executedQueries.find(function findInsert(sqlQuery) {
      return sqlQuery.text.includes('INSERT INTO interviews')
    })

    expect(interviewInsertQuery?.values).toEqual([
      '99999999-9999-4999-8999-999999999999',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Candidate-Blue',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Interviewer-Red',
      'system_design',
      'standard',
      '2026-04-10T10:30:00.000Z',
      '2026-04-01T12:00:00.000Z',
    ])

    expect(executedQueries.some(function hasSlotUpdate(sqlQuery) {
      return sqlQuery.text.includes('UPDATE availability_slots')
    })).toBe(true)
    expect(executedQueries.some(function hasRequestUpdate(sqlQuery) {
      return sqlQuery.text.includes('UPDATE availability_requests')
    })).toBe(true)
  })

  it('skips writes when post-lock eligibility re-check fails', async function shouldSkipWhenQuotaWasReached() {
    const executedQueries: SqlQuery[] = []
    const pairAttempt = createPairAttempt()
    const repository = new MatcherRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

        if (
          queryInput.text.includes('FROM availability_slots') &&
          queryInput.text.includes('FOR UPDATE')
        ) {
          const slotId = queryInput.values[0]

          return {
            rows: [
              {
                id: slotId,
                request_id:
                  slotId === pairAttempt.left.slot_id
                    ? pairAttempt.left.request_id
                    : pairAttempt.right.request_id,
                start_time: '2026-04-10T10:00:00.000Z',
                end_time: '2026-04-10T11:00:00.000Z',
                status: 'available',
              },
            ] as Row[],
          }
        }

        if (
          queryInput.text.includes('FROM availability_requests') &&
          queryInput.text.includes('FOR UPDATE')
        ) {
          const requestId = queryInput.values[0] as string
          const isLeftRequest = requestId === pairAttempt.left.request_id

          return {
            rows: [
              {
                id: requestId,
                user_id: isLeftRequest
                  ? pairAttempt.left.request_user_id
                  : pairAttempt.right.request_user_id,
                created_at: isLeftRequest
                  ? '2026-04-01T10:00:00.000Z'
                  : '2026-04-01T10:05:00.000Z',
                current_matches: isLeftRequest ? 1 : 0,
                max_matches: 1,
                interview_type: 'system_design',
                status: 'active',
              },
            ] as Row[],
          }
        }

        return { rows: [] as Row[] }
      },
    })

    const result = await repository.executePairAttemptTransaction(pairAttempt)

    expect(result).toEqual({
      status: 'skipped',
      reason: 'request_quota_reached',
      diagnostics: {
        transactionConflicts: 0,
        transactionRetries: 0,
      },
    })

    expect(executedQueries.some(function hasInterviewInsert(sqlQuery) {
      return sqlQuery.text.includes('INSERT INTO interviews')
    })).toBe(false)
    expect(executedQueries.some(function hasSlotUpdate(sqlQuery) {
      return sqlQuery.text.includes('UPDATE availability_slots')
    })).toBe(false)
    expect(executedQueries.some(function hasRequestUpdate(sqlQuery) {
      return sqlQuery.text.includes('UPDATE availability_requests')
    })).toBe(false)
    expect(executedQueries[executedQueries.length - 1]?.text).toContain('COMMIT')
  })

  it('rolls back when a write fails inside the transaction', async function shouldRollbackOnWriteFailure() {
    const executedQueries: SqlQuery[] = []
    const errorLogs: Array<{ event: string; context: Record<string, unknown> }> = []
    const pairAttempt = createPairAttempt()
    const repository = new MatcherRepository(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)

          if (
            queryInput.text.includes('FROM availability_slots') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const slotId = queryInput.values[0]

            return {
              rows: [
                {
                  id: slotId,
                  request_id:
                    slotId === pairAttempt.left.slot_id
                      ? pairAttempt.left.request_id
                      : pairAttempt.right.request_id,
                  start_time: '2026-04-10T10:00:00.000Z',
                  end_time: '2026-04-10T11:00:00.000Z',
                  status: 'available',
                },
              ] as Row[],
            }
          }

          if (
            queryInput.text.includes('FROM availability_requests') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const requestId = queryInput.values[0] as string
            const isLeftRequest = requestId === pairAttempt.left.request_id

            return {
              rows: [
                {
                  id: requestId,
                  user_id: isLeftRequest
                    ? pairAttempt.left.request_user_id
                    : pairAttempt.right.request_user_id,
                  created_at: isLeftRequest
                    ? '2026-04-01T10:00:00.000Z'
                    : '2026-04-01T10:05:00.000Z',
                  current_matches: 0,
                  max_matches: 1,
                  interview_type: 'system_design',
                  status: 'active',
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('INSERT INTO interviews')) {
            throw new Error('insert failed')
          }

          if (queryInput.text.includes('FROM "user"') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                  free_standard_interviews: 1,
                  credits: 1,
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('UPDATE "user"')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                },
              ] as Row[],
            }
          }

          return { rows: [] as Row[] }
        },
      },
      {
        createId: function createFixedInterviewId() {
          return '99999999-9999-4999-8999-999999999999'
        },
        logger: {
          info: async function infoNoOp() {
            return undefined
          },
          warn: async function warnNoOp() {
            return undefined
          },
          error: async function captureError(event, context) {
            errorLogs.push({ event, context })
          },
        },
      },
    )

    await expect(repository.executePairAttemptTransaction(pairAttempt)).rejects.toThrow(
      'insert failed',
    )

    expect(executedQueries.some(function hasRollback(sqlQuery) {
      return sqlQuery.text.includes('ROLLBACK')
    })).toBe(true)

    expect(errorLogs).toContainEqual({
      event: 'matcher.transaction.rollback',
      context: {
        attempt_key: pairAttempt.attempt_key,
        slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
        request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
        interview_id: '99999999-9999-4999-8999-999999999999',
        rollback_succeeded: true,
        error_code: undefined,
        error_message: 'insert failed',
      },
    })
  })

  it('retries transaction conflicts and records conflict/retry diagnostics', async function shouldRetryTransactionConflicts() {
    const executedQueries: SqlQuery[] = []
    const logEntries = createCapturedLogs()
    const pairAttempt = createPairAttempt()
    let shouldConflict = true
    const repository = new MatcherRepository(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)

          if (
            queryInput.text.includes('FROM availability_slots') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const slotId = queryInput.values[0] as string

            return {
              rows: [
                {
                  id: slotId,
                  request_id:
                    slotId === pairAttempt.left.slot_id
                      ? pairAttempt.left.request_id
                      : pairAttempt.right.request_id,
                  start_time: '2026-04-10T10:00:00.000Z',
                  end_time: '2026-04-10T11:00:00.000Z',
                  status: 'available',
                },
              ] as Row[],
            }
          }

          if (
            queryInput.text.includes('FROM availability_requests') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const requestId = queryInput.values[0] as string

            return {
              rows: [
                {
                  id: requestId,
                  user_id:
                    requestId === pairAttempt.left.request_id
                      ? pairAttempt.left.request_user_id
                      : pairAttempt.right.request_user_id,
                  created_at:
                    requestId === pairAttempt.left.request_id
                      ? '2026-04-02T00:00:00.000Z'
                      : '2026-04-01T00:00:00.000Z',
                  current_matches: 0,
                  max_matches: 1,
                  interview_type: 'system_design',
                  status: 'active',
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('INSERT INTO interviews') && shouldConflict) {
            shouldConflict = false
            const error = new Error('serialization failure')
            Object.assign(error, { code: '40001' })
            throw error
          }

          if (queryInput.text.includes('FROM "user"') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                  free_standard_interviews: 1,
                  credits: 1,
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('UPDATE "user"')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                },
              ] as Row[],
            }
          }

          return {
            rows: [] as Row[],
          }
        },
      },
      {
        logger: logEntries.logger,
      },
    )

    const result = await repository.executePairAttemptTransaction(pairAttempt)

    expect(result).toMatchObject({
      status: 'created',
      diagnostics: {
        transactionConflicts: 1,
        transactionRetries: 1,
      },
    })

    expect(executedQueries.filter(function countBegins(sqlQuery) {
      return sqlQuery.text.includes('BEGIN')
    })).toHaveLength(2)
    expect(logEntries.warnEntries).toContainEqual({
      event: 'matcher.transaction.conflict',
      context: {
        attempt_key: pairAttempt.attempt_key,
        slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
        request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
        transaction_attempt: 1,
        max_transaction_attempts: 3,
        error_code: '40001',
        error_message: 'serialization failure',
      },
    })
    expect(logEntries.infoEntries).toContainEqual({
      event: 'matcher.transaction.retry',
      context: {
        attempt_key: pairAttempt.attempt_key,
        slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
        request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
        retry_number: 1,
        next_transaction_attempt: 2,
      },
    })
  })

  it('continues retry flow even when logger calls fail', async function shouldIgnoreLoggerFailuresDuringRetries() {
    const pairAttempt = createPairAttempt()
    let shouldConflict = true
    const repository = new MatcherRepository(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          if (
            queryInput.text.includes('FROM availability_slots') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const slotId = queryInput.values[0] as string

            return {
              rows: [
                {
                  id: slotId,
                  request_id:
                    slotId === pairAttempt.left.slot_id
                      ? pairAttempt.left.request_id
                      : pairAttempt.right.request_id,
                  start_time: '2026-04-10T10:00:00.000Z',
                  end_time: '2026-04-10T11:00:00.000Z',
                  status: 'available',
                },
              ] as Row[],
            }
          }

          if (
            queryInput.text.includes('FROM availability_requests') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const requestId = queryInput.values[0] as string

            return {
              rows: [
                {
                  id: requestId,
                  user_id:
                    requestId === pairAttempt.left.request_id
                      ? pairAttempt.left.request_user_id
                      : pairAttempt.right.request_user_id,
                  created_at:
                    requestId === pairAttempt.left.request_id
                      ? '2026-04-02T00:00:00.000Z'
                      : '2026-04-01T00:00:00.000Z',
                  current_matches: 0,
                  max_matches: 1,
                  interview_type: 'system_design',
                  status: 'active',
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('INSERT INTO interviews') && shouldConflict) {
            shouldConflict = false
            const error = new Error('serialization failure')
            Object.assign(error, { code: '40001' })
            throw error
          }

          if (queryInput.text.includes('FROM "user"') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                  free_standard_interviews: 1,
                  credits: 1,
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('UPDATE "user"')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                },
              ] as Row[],
            }
          }

          return {
            rows: [] as Row[],
          }
        },
      },
      {
        logger: {
          info: async function throwOnInfo() {
            throw new Error('logger info failed')
          },
          warn: async function throwOnWarn() {
            throw new Error('logger warn failed')
          },
          error: async function throwOnError() {
            throw new Error('logger error failed')
          },
        },
      },
    )

    const result = await repository.executePairAttemptTransaction(pairAttempt)

    expect(result).toMatchObject({
      status: 'created',
      diagnostics: {
        transactionConflicts: 1,
        transactionRetries: 1,
      },
    })
  })

  it('returns skipped transaction conflict after retries are exhausted', async function shouldStopAfterRetryLimit() {
    const pairAttempt = createPairAttempt()
    const logEntries = createCapturedLogs()
    const repository = new MatcherRepository(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          if (
            queryInput.text.includes('FROM availability_slots') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const slotId = queryInput.values[0] as string

            return {
              rows: [
                {
                  id: slotId,
                  request_id:
                    slotId === pairAttempt.left.slot_id
                      ? pairAttempt.left.request_id
                      : pairAttempt.right.request_id,
                  start_time: '2026-04-10T10:00:00.000Z',
                  end_time: '2026-04-10T11:00:00.000Z',
                  status: 'available',
                },
              ] as Row[],
            }
          }

          if (
            queryInput.text.includes('FROM availability_requests') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const requestId = queryInput.values[0] as string

            return {
              rows: [
                {
                  id: requestId,
                  user_id:
                    requestId === pairAttempt.left.request_id
                      ? pairAttempt.left.request_user_id
                      : pairAttempt.right.request_user_id,
                  created_at:
                    requestId === pairAttempt.left.request_id
                      ? '2026-04-02T00:00:00.000Z'
                      : '2026-04-01T00:00:00.000Z',
                  current_matches: 0,
                  max_matches: 1,
                  interview_type: 'system_design',
                  status: 'active',
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('INSERT INTO interviews')) {
            const error = new Error('deadlock detected')
            Object.assign(error, { code: '40P01' })
            throw error
          }

          if (queryInput.text.includes('FROM "user"') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                  free_standard_interviews: 1,
                  credits: 1,
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('UPDATE "user"')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                },
              ] as Row[],
            }
          }

          return {
            rows: [] as Row[],
          }
        },
      },
      {
        logger: logEntries.logger,
        maxTransactionRetries: 1,
      },
    )

    const result = await repository.executePairAttemptTransaction(pairAttempt)

    expect(result).toEqual({
      status: 'skipped',
      reason: 'transaction_conflict',
      diagnostics: {
        transactionConflicts: 2,
        transactionRetries: 1,
      },
    })
    expect(logEntries.infoEntries).toContainEqual({
      event: 'matcher.transaction.retry',
      context: {
        attempt_key: pairAttempt.attempt_key,
        slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
        request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
        retry_number: 1,
        next_transaction_attempt: 2,
      },
    })
    expect(logEntries.warnEntries).toContainEqual({
      event: 'matcher.transaction.conflict',
      context: {
        attempt_key: pairAttempt.attempt_key,
        slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
        request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
        transaction_attempt: 2,
        max_transaction_attempts: 2,
        error_code: '40P01',
        error_message: 'deadlock detected',
      },
    })
    expect(logEntries.warnEntries).toContainEqual({
      event: 'matcher.transaction.conflict_exhausted',
      context: {
        attempt_key: pairAttempt.attempt_key,
        slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
        request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
        transaction_attempt: 2,
        max_transaction_attempts: 2,
      },
    })
  })

  it('prevents duplicate matches across simultaneous executions for the same slot pair', async function shouldPreventDuplicateConcurrentMatches() {
    const pairAttempt = createPairAttempt()
    const simulation = createConcurrentMatcherSimulation(pairAttempt)
    const repositoryA = new MatcherRepository(
      {
        query: simulation.createQueryExecutor('worker-a').query,
      },
      {
        createId: function createStableAId() {
          return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        },
      },
    )
    const repositoryB = new MatcherRepository(
      {
        query: simulation.createQueryExecutor('worker-b').query,
      },
      {
        createId: function createStableBId() {
          return 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        },
      },
    )

    const [resultA, resultB] = await Promise.all([
      repositoryA.executePairAttemptTransaction(pairAttempt),
      repositoryB.executePairAttemptTransaction(pairAttempt),
    ])

    const createdCount = [resultA, resultB].filter(function isCreated(result) {
      return result.status === 'created'
    }).length

    expect(createdCount).toBe(1)
    expect(simulation.getCreatedInterviewIds()).toHaveLength(1)
    expect([resultA, resultB].some(function hasRecheckSkip(result) {
      return result.status === 'skipped' && result.reason === 'slot_not_available'
    })).toBe(true)
  })

  it('skips stale candidate writes when lock re-check finds matched slots', async function shouldSkipStaleSlotState() {
    const executedQueries: SqlQuery[] = []
    const pairAttempt = createPairAttempt()
    const repository = new MatcherRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

        if (
          queryInput.text.includes('FROM availability_slots') &&
          queryInput.text.includes('FOR UPDATE')
        ) {
          const slotId = queryInput.values[0]

          return {
            rows: [
              {
                id: slotId,
                request_id:
                  slotId === pairAttempt.left.slot_id
                    ? pairAttempt.left.request_id
                    : pairAttempt.right.request_id,
                start_time: '2026-04-10T10:00:00.000Z',
                end_time: '2026-04-10T11:00:00.000Z',
                status: 'matched',
              },
            ] as Row[],
          }
        }

        if (
          queryInput.text.includes('FROM availability_requests') &&
          queryInput.text.includes('FOR UPDATE')
        ) {
          const requestId = queryInput.values[0] as string
          const isLeftRequest = requestId === pairAttempt.left.request_id

          return {
            rows: [
              {
                id: requestId,
                user_id: isLeftRequest
                  ? pairAttempt.left.request_user_id
                  : pairAttempt.right.request_user_id,
                created_at: isLeftRequest
                  ? '2026-04-01T10:00:00.000Z'
                  : '2026-04-01T10:05:00.000Z',
                current_matches: 0,
                max_matches: 1,
                interview_type: 'system_design',
                status: 'active',
              },
            ] as Row[],
          }
        }

        return { rows: [] as Row[] }
      },
    })

    const result = await repository.executePairAttemptTransaction(pairAttempt)

    expect(result).toEqual({
      status: 'skipped',
      reason: 'slot_not_available',
      diagnostics: {
        transactionConflicts: 0,
        transactionRetries: 0,
      },
    })
    expect(executedQueries.some(function hasInterviewInsert(sqlQuery) {
      return sqlQuery.text.includes('INSERT INTO interviews')
    })).toBe(false)
  })

  it('decrements free_standard_interviews for both users and creates standard tier interview', async function shouldDecrementFreeStandardForBoth() {
    const executedQueries: SqlQuery[] = []
    const pairAttempt = createPairAttempt()
    const repository = new MatcherRepository(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)

          if (
            queryInput.text.includes('FROM availability_slots') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const slotId = queryInput.values[0] as string
            const slotRow = {
              id: slotId,
              request_id:
                slotId === pairAttempt.left.slot_id
                  ? pairAttempt.left.request_id
                  : pairAttempt.right.request_id,
              start_time: '2026-04-10T10:00:00.000Z',
              end_time: '2026-04-10T11:00:00.000Z',
              status: 'available',
            }

            return { rows: [slotRow] as Row[] }
          }

          if (
            queryInput.text.includes('FROM availability_requests') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const requestId = queryInput.values[0] as string
            const isLeftRequest = requestId === pairAttempt.left.request_id

            return {
              rows: [
                {
                  id: requestId,
                  user_id: isLeftRequest
                    ? pairAttempt.left.request_user_id
                    : pairAttempt.right.request_user_id,
                  created_at: isLeftRequest
                    ? '2026-04-02T10:00:00.000Z'
                    : '2026-04-01T10:00:00.000Z',
                  current_matches: 0,
                  max_matches: 2,
                  interview_type: 'system_design',
                  status: 'active',
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('FROM "user"') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                  free_standard_interviews: 2,
                  credits: 0,
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('UPDATE "user"')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                },
              ] as Row[],
            }
          }

          return { rows: [] as Row[] }
        },
      },
      {
        createId: function createFixedInterviewId() {
          return '99999999-9999-4999-8999-999999999999'
        },
        now: function createFixedNowTimestamp() {
          return '2026-04-01T12:00:00.000Z'
        },
      },
    )

    const result = await repository.executePairAttemptTransaction(pairAttempt)

    expect(result).toMatchObject({
      status: 'created',
      interview: {
        tier: 'standard',
      },
    })

    const userUpdates = executedQueries.filter(function isUserUpdate(sqlQuery) {
      return sqlQuery.text.includes('UPDATE "user"')
    })

    expect(userUpdates).toHaveLength(2)
    expect(userUpdates[0]?.text).toContain('RETURNING id')
    expect(userUpdates[1]?.text).toContain('RETURNING id')
  })

  it('decrements credits for one user and creates premium tier interview', async function shouldDecrementCreditsForOneUser() {
    const executedQueries: SqlQuery[] = []
    const pairAttempt = createPairAttempt()
    const repository = new MatcherRepository(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)

          if (
            queryInput.text.includes('FROM availability_slots') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const slotId = queryInput.values[0] as string
            const slotRow = {
              id: slotId,
              request_id:
                slotId === pairAttempt.left.slot_id
                  ? pairAttempt.left.request_id
                  : pairAttempt.right.request_id,
              start_time: '2026-04-10T10:00:00.000Z',
              end_time: '2026-04-10T11:00:00.000Z',
              status: 'available',
            }

            return { rows: [slotRow] as Row[] }
          }

          if (
            queryInput.text.includes('FROM availability_requests') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const requestId = queryInput.values[0] as string
            const isLeftRequest = requestId === pairAttempt.left.request_id

            return {
              rows: [
                {
                  id: requestId,
                  user_id: isLeftRequest
                    ? pairAttempt.left.request_user_id
                    : pairAttempt.right.request_user_id,
                  created_at: isLeftRequest
                    ? '2026-04-02T10:00:00.000Z'
                    : '2026-04-01T10:00:00.000Z',
                  current_matches: 0,
                  max_matches: 2,
                  interview_type: 'system_design',
                  status: 'active',
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('FROM "user"') && queryInput.text.includes('FOR UPDATE')) {
            const userId = queryInput.values[0] as string
            const isLeftUser = userId === pairAttempt.left.request_user_id

            return {
              rows: [
                {
                  id: userId,
                  free_standard_interviews: isLeftUser ? 0 : 1,
                  credits: isLeftUser ? 1 : 0,
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('UPDATE "user"')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                },
              ] as Row[],
            }
          }

          return { rows: [] as Row[] }
        },
      },
      {
        createId: function createFixedInterviewId() {
          return '99999999-9999-4999-8999-999999999999'
        },
        now: function createFixedNowTimestamp() {
          return '2026-04-01T12:00:00.000Z'
        },
      },
    )

    const result = await repository.executePairAttemptTransaction(pairAttempt)

    expect(result).toMatchObject({
      status: 'created',
      interview: {
        tier: 'premium',
      },
    })

    const creditDecrementQueries = executedQueries.filter(function isCreditDecrement(sqlQuery) {
      return sqlQuery.text.includes('UPDATE "user"') && sqlQuery.text.includes('credits = credits')
    })

    expect(creditDecrementQueries).toHaveLength(1)
    expect(creditDecrementQueries[0]?.text).toContain('RETURNING id, credits')
  })

  it('skips with insufficient_credits when either user lacks resources and commits without mutations', async function shouldSkipWhenInsufficientCredits() {
    const executedQueries: SqlQuery[] = []
    const pairAttempt = createPairAttempt()
    const repository = new MatcherRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

        if (
          queryInput.text.includes('FROM availability_slots') &&
          queryInput.text.includes('FOR UPDATE')
        ) {
          const slotId = queryInput.values[0] as string
          const slotRow = {
            id: slotId,
            request_id:
              slotId === pairAttempt.left.slot_id
                ? pairAttempt.left.request_id
                : pairAttempt.right.request_id,
            start_time: '2026-04-10T10:00:00.000Z',
            end_time: '2026-04-10T11:00:00.000Z',
            status: 'available',
          }

          return { rows: [slotRow] as Row[] }
        }

        if (
          queryInput.text.includes('FROM availability_requests') &&
          queryInput.text.includes('FOR UPDATE')
        ) {
          const requestId = queryInput.values[0] as string
          const isLeftRequest = requestId === pairAttempt.left.request_id

          return {
            rows: [
              {
                id: requestId,
                user_id: isLeftRequest
                  ? pairAttempt.left.request_user_id
                  : pairAttempt.right.request_user_id,
                created_at: isLeftRequest
                  ? '2026-04-01T10:00:00.000Z'
                  : '2026-04-01T10:05:00.000Z',
                current_matches: 0,
                max_matches: 2,
                interview_type: 'system_design',
                status: 'active',
              },
            ] as Row[],
          }
        }

        if (queryInput.text.includes('FROM "user"') && queryInput.text.includes('FOR UPDATE')) {
          const userId = queryInput.values[0] as string
          const isLeftUser = userId === pairAttempt.left.request_user_id

          return {
            rows: [
              {
                id: userId,
                free_standard_interviews: isLeftUser ? 0 : 1,
                credits: isLeftUser ? 0 : 1,
              },
            ] as Row[],
          }
        }

        return { rows: [] as Row[] }
      },
    })

    const result = await repository.executePairAttemptTransaction(pairAttempt)

    expect(result).toEqual({
      status: 'skipped',
      reason: 'insufficient_credits',
      diagnostics: {
        transactionConflicts: 0,
        transactionRetries: 0,
      },
    })

    expect(executedQueries.some(function hasInterviewInsert(sqlQuery) {
      return sqlQuery.text.includes('INSERT INTO interviews')
    })).toBe(false)
    expect(executedQueries.some(function hasUserUpdate(sqlQuery) {
      return sqlQuery.text.includes('UPDATE "user"')
    })).toBe(false)
    expect(executedQueries[executedQueries.length - 1]?.text).toContain('COMMIT')
  })

  it('throws and rolls back when a decrement mutation unexpectedly fails', async function shouldRollbackOnDecrementFailure() {
    const executedQueries: SqlQuery[] = []
    const pairAttempt = createPairAttempt()
    let decrementCallCount = 0
    const repository = new MatcherRepository(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)

          if (
            queryInput.text.includes('FROM availability_slots') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const slotId = queryInput.values[0] as string
            const slotRow = {
              id: slotId,
              request_id:
                slotId === pairAttempt.left.slot_id
                  ? pairAttempt.left.request_id
                  : pairAttempt.right.request_id,
              start_time: '2026-04-10T10:00:00.000Z',
              end_time: '2026-04-10T11:00:00.000Z',
              status: 'available',
            }

            return { rows: [slotRow] as Row[] }
          }

          if (
            queryInput.text.includes('FROM availability_requests') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const requestId = queryInput.values[0] as string
            const isLeftRequest = requestId === pairAttempt.left.request_id

            return {
              rows: [
                {
                  id: requestId,
                  user_id: isLeftRequest
                    ? pairAttempt.left.request_user_id
                    : pairAttempt.right.request_user_id,
                  created_at: isLeftRequest
                    ? '2026-04-02T10:00:00.000Z'
                    : '2026-04-01T10:00:00.000Z',
                  current_matches: 0,
                  max_matches: 2,
                  interview_type: 'system_design',
                  status: 'active',
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('FROM "user"') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                  free_standard_interviews: 1,
                  credits: 1,
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('UPDATE "user"')) {
            decrementCallCount += 1
            if (decrementCallCount === 2) {
              return { rows: [] as Row[] }
            }
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                },
              ] as Row[],
            }
          }

          return { rows: [] as Row[] }
        },
      },
      {
        createId: function createFixedInterviewId() {
          return '99999999-9999-4999-8999-999999999999'
        },
      },
    )

    await expect(repository.executePairAttemptTransaction(pairAttempt)).rejects.toThrow()

    expect(executedQueries.some(function hasRollback(sqlQuery) {
      return sqlQuery.text.includes('ROLLBACK')
    })).toBe(true)
  })
})

function createPairAttempt(): MatcherPairAttempt {
  return {
    attempt_key:
      '44444444-4444-4444-8444-444444444444:22222222-2222-4222-8222-222222222222|33333333-3333-4333-8333-333333333333:11111111-1111-4111-8111-111111111111',
    left: {
      request_id: '44444444-4444-4444-8444-444444444444',
      request_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      request_created_at: '2026-04-02T00:00:00.000Z',
      interview_type: 'system_design',
      slot_id: '22222222-2222-4222-8222-222222222222',
      slot_start_time: '2026-04-10T10:00:00.000Z',
      slot_end_time: '2026-04-10T11:00:00.000Z',
    },
    right: {
      request_id: '33333333-3333-4333-8333-333333333333',
      request_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      request_created_at: '2026-04-01T00:00:00.000Z',
      interview_type: 'system_design',
      slot_id: '11111111-1111-4111-8111-111111111111',
      slot_start_time: '2026-04-10T10:30:00.000Z',
      slot_end_time: '2026-04-10T11:30:00.000Z',
    },
  }
}

function createCapturedLogs(): {
  logger: MatcherRepositoryLogger
  infoEntries: Array<{ event: string; context: Record<string, unknown> }>
  warnEntries: Array<{ event: string; context: Record<string, unknown> }>
} {
  const infoEntries: Array<{ event: string; context: Record<string, unknown> }> = []
  const warnEntries: Array<{ event: string; context: Record<string, unknown> }> = []

  return {
    logger: {
      info: async function captureInfo(event, context) {
        infoEntries.push({ event, context })
      },
      warn: async function captureWarn(event, context) {
        warnEntries.push({ event, context })
      },
      error: async function errorNoOp() {
        return undefined
      },
    },
    infoEntries,
    warnEntries,
  }
}

function createConcurrentMatcherSimulation(pairAttempt: MatcherPairAttempt): {
  createQueryExecutor(workerId: string): {
    query<Row>(queryInput: SqlQuery): Promise<{ rows: Row[] }>
  }
  getCreatedInterviewIds(): string[]
} {
  const slotStateById = new Map<string, {
    id: string
    request_id: string
    start_time: string
    end_time: string
    status: 'available' | 'matched' | 'cancelled'
  }>([
    [
      pairAttempt.left.slot_id,
      {
        id: pairAttempt.left.slot_id,
        request_id: pairAttempt.left.request_id,
        start_time: pairAttempt.left.slot_start_time,
        end_time: pairAttempt.left.slot_end_time,
        status: 'available',
      },
    ],
    [
      pairAttempt.right.slot_id,
      {
        id: pairAttempt.right.slot_id,
        request_id: pairAttempt.right.request_id,
        start_time: pairAttempt.right.slot_start_time,
        end_time: pairAttempt.right.slot_end_time,
        status: 'available',
      },
    ],
  ])

  const requestStateById = new Map<string, {
    id: string
    user_id: string
    created_at: string
    current_matches: number
    max_matches: number
    interview_type: 'system_design' | 'coding' | 'behavioral'
    status: 'active' | 'fulfilled' | 'cancelled'
  }>([
    [
      pairAttempt.left.request_id,
      {
        id: pairAttempt.left.request_id,
        user_id: pairAttempt.left.request_user_id,
        created_at: pairAttempt.left.request_created_at,
        current_matches: 0,
        max_matches: 1,
        interview_type: pairAttempt.left.interview_type,
        status: 'active',
      },
    ],
    [
      pairAttempt.right.request_id,
      {
        id: pairAttempt.right.request_id,
        user_id: pairAttempt.right.request_user_id,
        created_at: pairAttempt.right.request_created_at,
        current_matches: 0,
        max_matches: 1,
        interview_type: pairAttempt.right.interview_type,
        status: 'active',
      },
    ],
  ])

  const createdInterviewIds: string[] = []
  const slotLockOwnerById = new Map<string, string>()
  const requestLockOwnerById = new Map<string, string>()
  const waitersByResourceId = new Map<string, Array<() => void>>()
  const transactionStateByWorkerId = new Map<string, {
    lockedSlotIds: Set<string>
    lockedRequestIds: Set<string>
  }>()

  function getOrCreateWorkerState(workerId: string) {
    const existingState = transactionStateByWorkerId.get(workerId)

    if (existingState) {
      return existingState
    }

    const nextState = {
      lockedSlotIds: new Set<string>(),
      lockedRequestIds: new Set<string>(),
    }
    transactionStateByWorkerId.set(workerId, nextState)
    return nextState
  }

  async function waitForResourceRelease(resourceId: string): Promise<void> {
    await new Promise<void>(function waitForLock(resolve) {
      const existingWaiters = waitersByResourceId.get(resourceId) ?? []
      existingWaiters.push(resolve)
      waitersByResourceId.set(resourceId, existingWaiters)
    })
  }

  function notifyResourceReleased(resourceId: string): void {
    const waiters = waitersByResourceId.get(resourceId)

    if (!waiters || waiters.length === 0) {
      return
    }

    waitersByResourceId.delete(resourceId)

    for (const waiter of waiters) {
      waiter()
    }
  }

  async function acquireSlotLock(workerId: string, slotId: string): Promise<void> {
    for (;;) {
      const lockOwner = slotLockOwnerById.get(slotId)

      if (!lockOwner || lockOwner === workerId) {
        slotLockOwnerById.set(slotId, workerId)
        return
      }

      await waitForResourceRelease(`slot:${slotId}`)
    }
  }

  async function acquireRequestLock(workerId: string, requestId: string): Promise<void> {
    for (;;) {
      const lockOwner = requestLockOwnerById.get(requestId)

      if (!lockOwner || lockOwner === workerId) {
        requestLockOwnerById.set(requestId, workerId)
        return
      }

      await waitForResourceRelease(`request:${requestId}`)
    }
  }

  function releaseTransactionLocks(workerId: string): void {
    const workerState = getOrCreateWorkerState(workerId)

    for (const slotId of workerState.lockedSlotIds) {
      const lockOwner = slotLockOwnerById.get(slotId)

      if (lockOwner === workerId) {
        slotLockOwnerById.delete(slotId)
        notifyResourceReleased(`slot:${slotId}`)
      }
    }

    workerState.lockedSlotIds.clear()

    for (const requestId of workerState.lockedRequestIds) {
      const lockOwner = requestLockOwnerById.get(requestId)

      if (lockOwner === workerId) {
        requestLockOwnerById.delete(requestId)
        notifyResourceReleased(`request:${requestId}`)
      }
    }

    workerState.lockedRequestIds.clear()
  }

  function createQueryExecutor(workerId: string): {
    query<Row>(queryInput: SqlQuery): Promise<{ rows: Row[] }>
  } {
    return {
      query: async function query<Row>(queryInput: SqlQuery): Promise<{ rows: Row[] }> {
        const workerState = getOrCreateWorkerState(workerId)

        if (queryInput.text.includes('BEGIN')) {
          return { rows: [] as Row[] }
        }

        if (queryInput.text.includes('ROLLBACK')) {
          releaseTransactionLocks(workerId)
          return { rows: [] as Row[] }
        }

        if (queryInput.text.includes('COMMIT')) {
          releaseTransactionLocks(workerId)
          return { rows: [] as Row[] }
        }

        if (
          queryInput.text.includes('FROM availability_slots') &&
          queryInput.text.includes('FOR UPDATE')
        ) {
          const slotId = queryInput.values[0] as string
          await acquireSlotLock(workerId, slotId)
          workerState.lockedSlotIds.add(slotId)

          const slotRow = slotStateById.get(slotId)

          return {
            rows: slotRow ? ([slotRow] as Row[]) : ([] as Row[]),
          }
        }

          if (
            queryInput.text.includes('FROM availability_requests') &&
            queryInput.text.includes('FOR UPDATE')
          ) {
            const requestId = queryInput.values[0] as string
            await acquireRequestLock(workerId, requestId)
            workerState.lockedRequestIds.add(requestId)

            const requestRow = requestStateById.get(requestId)

            return {
              rows: requestRow ? ([requestRow] as Row[]) : ([] as Row[]),
            }
          }

          if (queryInput.text.includes('FROM "user"') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                  free_standard_interviews: 1,
                  credits: 1,
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('UPDATE "user"')) {
            return {
              rows: [
                {
                  id: queryInput.values[0] as string,
                },
              ] as Row[],
            }
          }

          if (queryInput.text.includes('INSERT INTO interviews')) {
          const interviewId = queryInput.values[0] as string
          createdInterviewIds.push(interviewId)
          return { rows: [] as Row[] }
        }

        if (queryInput.text.includes('UPDATE availability_slots')) {
          const slotIds = queryInput.values[0] as string[]

          for (const slotId of slotIds) {
            const slot = slotStateById.get(slotId)

            if (!slot) {
              continue
            }

            slot.status = 'matched'
          }

          return { rows: [] as Row[] }
        }

        if (queryInput.text.includes('UPDATE availability_requests')) {
          const requestIds = queryInput.values[0] as string[]

          for (const requestId of requestIds) {
            const request = requestStateById.get(requestId)

            if (!request) {
              continue
            }

            request.current_matches += 1
          }

          return { rows: [] as Row[] }
        }

        return { rows: [] as Row[] }
      },
    }
  }

  return {
    createQueryExecutor,
    getCreatedInterviewIds: function getCreatedInterviewIds() {
      return [...createdInterviewIds]
    },
  }
}
