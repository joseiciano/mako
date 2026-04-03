import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { MatcherRepository } from './matcher-repository'
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

        return { rows: [] as Row[] }
      },
    })

    await expect(repository.executePairAttemptTransaction(pairAttempt)).rejects.toThrow(
      'insert failed',
    )

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
