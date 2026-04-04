import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { MatcherRepository } from './matcher-repository'

const slotAId = '11111111-1111-4111-8111-111111111111'
const slotBId = '22222222-2222-4222-8222-222222222222'
const requestAId = '33333333-3333-4333-8333-333333333333'
const requestBId = '44444444-4444-4444-8444-444444444444'
const userAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const userBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('MatcherRepository', function matcherRepositorySuite() {
  it('listCandidates applies strict eligibility filters', async function shouldListCandidates() {
    const executedQueries: SqlQuery[] = []

    const repository = new MatcherRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

        return {
          rows: [
            {
              slot_id: slotAId,
              request_id: requestAId,
              user_id: userAId,
              interview_type: 'coding',
              request_created_at: '2026-04-02T09:00:00.000Z',
              request_max_matches: 1,
              request_current_matches: 0,
              request_status: 'active',
              slot_start_time: '2026-04-02T10:00:00.000Z',
              slot_end_time: '2026-04-02T11:00:00.000Z',
              slot_status: 'available',
            },
          ] as Row[],
        }
      },
    })

    const nowIso = '2026-04-02T08:00:00.000Z'
    const candidates = await repository.listCandidates({ nowIso })
    const [query] = executedQueries

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      slotId: slotAId,
      requestId: requestAId,
      userId: userAId,
    })
    expect(query?.values).toEqual([nowIso])
    expect(query?.text).toContain("slot.status = 'available'")
    expect(query?.text).toContain("request.status = 'active'")
    expect(query?.text).toContain('request.current_matches < request.max_matches')
    expect(query?.text).toContain('slot.start_time > $1::timestamptz')
    expect(query?.text).toContain('request.created_at ASC')
  })

  it('fulfills requests and cancels remaining slots atomically at quota boundary', async function shouldFulfillAndCancelRemainingSlots() {
    const executedQueries: SqlQuery[] = []

    const repository = new MatcherRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)
        const normalizedSql = normalizeSql(queryInput.text)

        if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT') {
          return { rows: [] as Row[] }
        }

        if (
          normalizedSql.includes('FROM availability_slots') &&
          normalizedSql.includes('FOR UPDATE')
        ) {
          return {
            rows: [
              createSlotRow({
                id: slotAId,
                requestId: requestAId,
                start: '2026-04-02T10:00:00.000Z',
                end: '2026-04-02T11:00:00.000Z',
                status: 'available',
              }),
              createSlotRow({
                id: slotBId,
                requestId: requestBId,
                start: '2026-04-02T10:00:00.000Z',
                end: '2026-04-02T11:00:00.000Z',
                status: 'available',
              }),
            ] as Row[],
          }
        }

        if (
          normalizedSql.includes('FROM availability_requests') &&
          normalizedSql.includes('FOR UPDATE')
        ) {
          return {
            rows: [
              createRequestRow({
                id: requestAId,
                userId: userAId,
                status: 'active',
                currentMatches: 0,
                maxMatches: 1,
                interviewType: 'coding',
              }),
              createRequestRow({
                id: requestBId,
                userId: userBId,
                status: 'active',
                currentMatches: 0,
                maxMatches: 2,
                interviewType: 'coding',
              }),
            ] as Row[],
          }
        }

        if (normalizedSql.includes("UPDATE availability_slots SET status = 'matched'")) {
          return {
            rows: [
              createSlotRow({
                id: slotAId,
                requestId: requestAId,
                start: '2026-04-02T10:00:00.000Z',
                end: '2026-04-02T11:00:00.000Z',
                status: 'matched',
              }),
              createSlotRow({
                id: slotBId,
                requestId: requestBId,
                start: '2026-04-02T10:00:00.000Z',
                end: '2026-04-02T11:00:00.000Z',
                status: 'matched',
              }),
            ] as Row[],
          }
        }

        if (
          normalizedSql.includes(
            'UPDATE availability_requests SET current_matches = current_matches + 1',
          )
        ) {
          return {
            rows: [
              createRequestRow({
                id: requestAId,
                userId: userAId,
                status: 'active',
                currentMatches: 1,
                maxMatches: 1,
                interviewType: 'coding',
              }),
              createRequestRow({
                id: requestBId,
                userId: userBId,
                status: 'active',
                currentMatches: 1,
                maxMatches: 2,
                interviewType: 'coding',
              }),
            ] as Row[],
          }
        }

        if (normalizedSql.includes("UPDATE availability_requests SET status = 'fulfilled'")) {
          return {
            rows: [] as Row[],
          }
        }

        if (
          normalizedSql.includes("UPDATE availability_slots SET status = 'cancelled'") &&
          normalizedSql.includes('request_id = ANY($1::uuid[])')
        ) {
          return {
            rows: [
              createSlotRow({
                id: '55555555-5555-4555-8555-555555555555',
                requestId: requestAId,
                start: '2026-04-02T12:00:00.000Z',
                end: '2026-04-02T13:00:00.000Z',
                status: 'cancelled',
              }),
            ] as Row[],
          }
        }

        throw new Error(`Unexpected SQL query in test: ${normalizedSql}`)
      },
    })

    const result = await repository.executePairAttempt({
      slotAId,
      slotBId,
    })

    expect(result).toEqual({
      outcome: 'matched',
      fulfilledRequestIds: [requestAId],
      cancelledSlotIds: ['55555555-5555-4555-8555-555555555555'],
    })

    expect(normalizeSql(executedQueries[0]?.text ?? '')).toBe('BEGIN')
    expect(normalizeSql(executedQueries[executedQueries.length - 1]?.text ?? '')).toBe(
      'COMMIT',
    )
    expect(
      executedQueries.some(function hasRollback(queryInput) {
        return normalizeSql(queryInput.text) === 'ROLLBACK'
      }),
    ).toBe(false)
  })

  it('rolls back when request is no longer eligible after lock', async function shouldRollbackWhenIneligible() {
    const executedQueries: SqlQuery[] = []

    const repository = new MatcherRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)
        const normalizedSql = normalizeSql(queryInput.text)

        if (normalizedSql === 'BEGIN' || normalizedSql === 'ROLLBACK') {
          return { rows: [] as Row[] }
        }

        if (
          normalizedSql.includes('FROM availability_slots') &&
          normalizedSql.includes('FOR UPDATE')
        ) {
          return {
            rows: [
              createSlotRow({
                id: slotAId,
                requestId: requestAId,
                start: '2026-04-02T10:00:00.000Z',
                end: '2026-04-02T11:00:00.000Z',
                status: 'available',
              }),
              createSlotRow({
                id: slotBId,
                requestId: requestBId,
                start: '2026-04-02T10:00:00.000Z',
                end: '2026-04-02T11:00:00.000Z',
                status: 'available',
              }),
            ] as Row[],
          }
        }

        if (
          normalizedSql.includes('FROM availability_requests') &&
          normalizedSql.includes('FOR UPDATE')
        ) {
          return {
            rows: [
              createRequestRow({
                id: requestAId,
                userId: userAId,
                status: 'fulfilled',
                currentMatches: 1,
                maxMatches: 1,
                interviewType: 'coding',
              }),
              createRequestRow({
                id: requestBId,
                userId: userBId,
                status: 'active',
                currentMatches: 0,
                maxMatches: 2,
                interviewType: 'coding',
              }),
            ] as Row[],
          }
        }

        throw new Error(`Unexpected SQL query in test: ${normalizedSql}`)
      },
    })

    const result = await repository.executePairAttempt({
      slotAId,
      slotBId,
    })

    expect(result).toEqual({
      outcome: 'skipped',
      reason: 'ineligible_after_lock',
    })
    expect(
      executedQueries.some(function matchedUpdateRan(queryInput) {
        return normalizeSql(queryInput.text).includes(
          "UPDATE availability_slots SET status = 'matched'",
        )
      }),
    ).toBe(false)
    expect(
      executedQueries.some(function hasRollback(queryInput) {
        return normalizeSql(queryInput.text) === 'ROLLBACK'
      }),
    ).toBe(true)
  })
})

function normalizeSql(statementText: string): string {
  return statementText.replaceAll(/\s+/g, ' ').trim()
}

function createSlotRow(input: {
  id: string
  requestId: string
  start: string
  end: string
  status: 'available' | 'matched' | 'cancelled'
}) {
  return {
    id: input.id,
    request_id: input.requestId,
    start_time: input.start,
    end_time: input.end,
    status: input.status,
    created_at: '2026-04-02T08:00:00.000Z',
    updated_at: '2026-04-02T08:00:00.000Z',
  }
}

function createRequestRow(input: {
  id: string
  userId: string
  status: 'active' | 'fulfilled' | 'cancelled'
  currentMatches: number
  maxMatches: number
  interviewType: 'system_design' | 'coding' | 'behavioral'
}) {
  return {
    id: input.id,
    user_id: input.userId,
    max_matches: input.maxMatches,
    current_matches: input.currentMatches,
    interview_type: input.interviewType,
    status: input.status,
    created_at: '2026-04-02T08:00:00.000Z',
    updated_at: '2026-04-02T08:00:00.000Z',
  }
}
