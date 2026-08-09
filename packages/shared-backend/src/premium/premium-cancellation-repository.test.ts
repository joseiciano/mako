import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { PremiumCancellationRepository } from './premium-cancellation-repository'

const userId = '11111111-1111-4111-8111-111111111111'
const interviewId = '22222222-2222-4222-8222-222222222222'
const schedulerId = '33333333-3333-4333-8333-333333333333'
const interviewerId = '44444444-4444-4444-8444-444444444444'

describe('PremiumCancellationRepository', function repositorySuite() {
  it('listAllUpcomingInterviewsForUser selects without LIMIT', async function shouldHaveNoLimit() {
    const executedQueries: SqlQuery[] = []

    const repository = new PremiumCancellationRepository()
    await repository.listAllUpcomingInterviewsForUser(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)
          return { rows: [] as Row[] }
        },
      },
      userId,
    )

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]!.text).toContain('FROM interviews')
    expect(executedQueries[0]!.text).toContain("WHERE status = 'scheduled'")
    expect(executedQueries[0]!.text).toContain('scheduled_at > NOW()')
    expect(executedQueries[0]!.text).not.toContain('LIMIT')
    expect(executedQueries[0]!.values).toEqual([userId])
  })

  it('lockUsersForUpdate orders by id', async function shouldOrderById() {
    const executedQueries: SqlQuery[] = []

    const repository = new PremiumCancellationRepository()
    await repository.lockUsersForUpdate(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)
          return { rows: [] as Row[] }
        },
      },
      [userId, schedulerId],
    )

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]!.text).toContain('FROM "user"')
    expect(executedQueries[0]!.text).toContain('ORDER BY id')
    expect(executedQueries[0]!.text).toContain('FOR UPDATE')
    expect(executedQueries[0]!.values).toEqual([[userId, schedulerId]])
  })

  it('lockUsersForUpdate uses uuid array cast and database-level ordering', async function shouldUseUuidCast() {
    const executedQueries: SqlQuery[] = []

    const repository = new PremiumCancellationRepository()
    await repository.lockUsersForUpdate(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)
          return { rows: [] as Row[] }
        },
      },
      [schedulerId, userId],
    )

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]!.text).toContain('WHERE id = ANY($1::uuid[])')
    expect(executedQueries[0]!.text).toContain('ORDER BY id')
    expect(executedQueries[0]!.text).toContain('FOR UPDATE')
    // Repository orders at the database level regardless of input order.
    expect(executedQueries[0]!.values).toEqual([[schedulerId, userId]])
  })

  it('lockInterviewsForUpdate orders by id', async function shouldOrderInterviewLocks() {
    const executedQueries: SqlQuery[] = []

    const repository = new PremiumCancellationRepository()
    await repository.lockInterviewsForUpdate(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)
          return { rows: [] as Row[] }
        },
      },
      [interviewId],
    )

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]!.text).toContain('FROM interviews')
    expect(executedQueries[0]!.text).toContain('ORDER BY id')
    expect(executedQueries[0]!.text).toContain('FOR UPDATE')
    expect(executedQueries[0]!.values).toEqual([[interviewId]])
  })

  it('getInterviewForCancel returns interview row', async function shouldReturnRow() {
    const executedQueries: SqlQuery[] = []

    const repository = new PremiumCancellationRepository()
    const result = await repository.getInterviewForCancel(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)
          return {
            rows: [
              {
                id: interviewId,
                scheduler_id: schedulerId,
                interviewer_id: interviewerId,
                type: 'system_design',
                mode: 'peer_to_peer',
                tier: 'premium',
                status: 'scheduled',
                booking_channel: 'verified_interviewer',
                scheduled_at: '2026-05-22T10:00:00.000Z',
              },
            ] as Row[],
          }
        },
      },
      interviewId,
    )

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]!.text).toContain('FROM interviews')
    expect(executedQueries[0]!.text).toContain('WHERE id = $1')
    expect(executedQueries[0]!.values).toEqual([interviewId])
    expect(result).toEqual({
      id: interviewId,
      scheduler_id: schedulerId,
      interviewer_id: interviewerId,
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'premium',
      status: 'scheduled',
      booking_channel: 'verified_interviewer',
      scheduled_at: '2026-05-22T10:00:00.000Z',
    })
  })

  it('cancelInterviewIfScheduled updates status and returns row', async function shouldCancel() {
    const executedQueries: SqlQuery[] = []
    const updatedAt = '2026-05-22T09:00:00.000Z'

    const repository = new PremiumCancellationRepository()
    const result = await repository.cancelInterviewIfScheduled(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)
          return {
            rows: [
              {
                id: interviewId,
                scheduler_id: schedulerId,
                interviewer_id: interviewerId,
                type: 'system_design',
                mode: 'peer_to_peer',
                tier: 'premium',
                status: 'cancelled',
                booking_channel: 'verified_interviewer',
                scheduled_at: '2026-05-22T10:00:00.000Z',
              },
            ] as Row[],
          }
        },
      },
      interviewId,
      updatedAt,
    )

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]!.text).toContain('UPDATE interviews')
    expect(executedQueries[0]!.text).toContain("status = 'cancelled'")
    expect(executedQueries[0]!.values).toEqual([interviewId, updatedAt])
    expect(result?.status).toBe('cancelled')
  })

  it('insertRefundRow inserts with ON CONFLICT DO NOTHING', async function shouldInsertRefund() {
    const executedQueries: SqlQuery[] = []

    const repository = new PremiumCancellationRepository()
    const result = await repository.insertRefundRow(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)
          return { rows: [{ id: 'refund-id' }] as Row[] }
        },
      },
      {
        id: 'refund-id',
        interviewId,
        schedulerId,
        reason: 'interviewer_cancelled',
        initiatedByUserId: interviewerId,
        createdAt: '2026-05-22T09:00:00.000Z',
      },
    )

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]!.text).toContain('INSERT INTO premium_booking_credit_refunds')
    expect(executedQueries[0]!.text).toContain('ON CONFLICT (interview_id) DO NOTHING')
    expect(result).toEqual({ id: 'refund-id' })
  })

  it('incrementSchedulerCredits updates credits for active user', async function shouldIncrementCredits() {
    const executedQueries: SqlQuery[] = []
    const updatedAt = '2026-05-22T09:00:00.000Z'

    const repository = new PremiumCancellationRepository()
    const result = await repository.incrementSchedulerCredits(
      {
        query: async function query<Row>(queryInput: SqlQuery) {
          executedQueries.push(queryInput)
          return { rows: [{ id: schedulerId }] as Row[] }
        },
      },
      schedulerId,
      updatedAt,
    )

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]!.text).toContain('UPDATE "user"')
    expect(executedQueries[0]!.text).toContain('credits = credits + 1')
    expect(executedQueries[0]!.text).toContain('deleted_at IS NULL')
    expect(executedQueries[0]!.values).toEqual([schedulerId, updatedAt])
    expect(result).toEqual({ id: schedulerId })
  })
})
