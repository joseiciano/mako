import { describe, expect, it, vi } from 'vitest'
import type { SqlQuery } from '../index'
import {
  PremiumCancellationRepository,
  type PremiumCancellationInterviewRow,
  type PremiumCancellationInterviewSnapshotRow,
} from './premium-cancellation-repository'
import { PremiumCancellationService } from './premium-cancellation-service'
import { PremiumConflictError, PremiumNotFoundError } from './premium-errors'

const interviewId = '11111111-1111-4111-8111-111111111111'
const schedulerUserId = '22222222-2222-4222-8222-222222222222'
const interviewerUserId = '33333333-3333-4333-8333-333333333333'
const deletingUserId = '44444444-4444-4444-8444-444444444444'
const fourthUserId = '55555555-5555-4555-8555-555555555555'
const extraInterviewId = '66666666-6666-4666-8666-666666666666'

const fixedRefundId = 'refund-id'
const fixedNow = '2026-05-22T09:00:00.000Z'

type FullCancellationInterviewRow = PremiumCancellationInterviewRow & {
  created_at: string
  updated_at: string
}

function buildInterviewRow(
  overrides: Partial<PremiumCancellationInterviewRow> = {},
): FullCancellationInterviewRow {
  return {
    id: interviewId,
    scheduler_id: schedulerUserId,
    interviewer_id: interviewerUserId,
    type: 'system_design',
    mode: 'peer_to_peer',
    tier: 'premium',
    status: 'scheduled',
    booking_channel: 'verified_interviewer',
    scheduled_at: '2026-05-22T10:00:00.000Z',
    created_at: '2026-05-22T08:00:00.000Z',
    updated_at: '2026-05-22T08:00:00.000Z',
    ...overrides,
  }
}

type MockExecutorOptions = {
  // getInterviewForCancel rows (single interview) — null means not-found.
  interviewRow?: FullCancellationInterviewRow | null
  // lockInterviewForUpdate rows (single interview) — null means not-found.
  // Falls back to interviewRow when undefined.
  lockedInterviewRow?: FullCancellationInterviewRow | null
  // cancelInterviewIfScheduled rows — null means empty result (already cancelled race).
  cancelledRow?: FullCancellationInterviewRow | null
  // listAllUpcomingInterviewsForUser rows (initial query).
  upcomingRows?: FullCancellationInterviewRow[]
  // listAllUpcomingInterviewsForUser rows (requery after lock).
  requeriedRows?: FullCancellationInterviewRow[]
  // lockInterviewsForUpdate rows.
  lockedRows?: FullCancellationInterviewRow[]
  // lockUsersForUpdate rows.
  userRows?: { id: string }[]
  serializationConflict?: boolean
  refundInsertReturnsNull?: boolean
}

function createService(options: MockExecutorOptions = {}) {
  const queries: SqlQuery[] = []
  const persistOutboxEvent = vi.fn(async () => {})
  const softDeleteAccount = vi.fn(async (_queryExecutor?: unknown) => {})
  let listAllUpcomingCallCount = 0

  const executor = {
    queries,
    async query<Row>(queryInput: SqlQuery): Promise<{ rows: Row[] }> {
      queries.push(queryInput)

      if (options.serializationConflict) {
        const conflictError = new Error('deadlock detected')
        ;(conflictError as { code?: string }).code = '40P01'
        throw conflictError
      }

      const text = queryInput.text
      const normalized = text.trim().toUpperCase()

      if (
        normalized === 'BEGIN;' ||
        normalized === 'COMMIT;' ||
        normalized === 'ROLLBACK;'
      ) {
        return { rows: [] as Row[] }
      }

      if (text.includes('INSERT INTO premium_booking_credit_refunds')) {
        if (options.refundInsertReturnsNull) {
          return { rows: [] as Row[] }
        }
        return { rows: [{ id: fixedRefundId }] as Row[] }
      }

      if (text.includes('credits = credits + 1')) {
        const [schedulerId] = queryInput.values
        return { rows: [{ id: schedulerId as string }] as Row[] }
      }

      if (text.includes('UPDATE interviews')) {
        if (options.cancelledRow === null) {
          return { rows: [] as Row[] }
        }

        const [id] = queryInput.values
        const knownRows = [
          ...(options.upcomingRows ?? []),
          ...(options.requeriedRows ?? []),
          ...(options.lockedRows ?? []),
        ]
        const matched = knownRows.find(function sameId(row) {
          return row.id === id
        })

        if (matched) {
          return { rows: [{ ...matched, status: 'cancelled' }] as Row[] }
        }

        return {
          rows: [
            (options.cancelledRow ?? buildInterviewRow({ status: 'cancelled' })) as Row,
          ],
        }
      }

      if (text.includes('FROM interviews') && text.includes('WHERE id = ANY')) {
        return { rows: (options.lockedRows ?? []) as Row[] }
      }

      if (
        text.includes('FROM interviews') &&
        text.includes("WHERE status = 'scheduled'")
      ) {
        // Each attempt issues two listAllUpcomingInterviewsForUser queries:
        // an initial snapshot (odd call) and a requery after user locks (even
        // call). Returning the requery rows on even calls keeps the expansion
        // visible on every retry attempt.
        listAllUpcomingCallCount += 1
        if (listAllUpcomingCallCount % 2 === 1) {
          return { rows: (options.upcomingRows ?? []) as Row[] }
        }
        return { rows: (options.requeriedRows ?? options.upcomingRows ?? []) as Row[] }
      }

      if (text.includes('FROM interviews') && text.includes('WHERE id = $1')) {
        if (text.includes('FOR UPDATE')) {
          if (options.lockedInterviewRow === null) {
            return { rows: [] as Row[] }
          }
          return {
            rows: [
              (options.lockedInterviewRow ??
                options.interviewRow ??
                buildInterviewRow()) as Row,
            ],
          }
        }

        if (options.interviewRow === null) {
          return { rows: [] as Row[] }
        }

        return {
          rows: [(options.interviewRow ?? buildInterviewRow()) as Row],
        }
      }

      if (text.includes('FROM "user"') && text.includes('WHERE id = ANY')) {
        return { rows: (options.userRows ?? []) as Row[] }
      }

      return { rows: [] as Row[] }
    },
  }

  const repository = new PremiumCancellationRepository()

  const service = new PremiumCancellationService(
    repository,
    executor,
    function createId() {
      return fixedRefundId
    },
    function now() {
      return fixedNow
    },
  )

  return { executor, queries, persistOutboxEvent, service, softDeleteAccount }
}

describe('PremiumCancellationService', function premiumCancellationServiceSuite() {
  describe('cancelInterview', function cancelInterviewSuite() {
    it('cancels with scheduler source and verified channel without refund or credit increment', async function run() {
      const { executor, queries, persistOutboxEvent, service } = createService({
        interviewRow: buildInterviewRow(),
        cancelledRow: buildInterviewRow({ status: 'cancelled' }),
        userRows: [{ id: schedulerUserId }, { id: interviewerUserId }],
      })

      const result = await service.cancelInterview({
        interviewId,
        source: 'scheduler',
        initiatedByUserId: schedulerUserId,
        persistOutboxEvent,
      })

      expect(result).toEqual({ outcome: 'cancelled' })

      const refundQueries = queries.filter(function isRefund(query) {
        return query.text.includes('INSERT INTO premium_booking_credit_refunds')
      })
      const creditQueries = queries.filter(function isCreditIncrement(query) {
        return query.text.includes('credits = credits + 1')
      })

      expect(refundQueries).toHaveLength(0)
      expect(creditQueries).toHaveLength(0)
      expect(persistOutboxEvent).toHaveBeenCalledTimes(1)

      const normalizedTexts = executor.queries.map(function normalize(query) {
        return query.text.trim().toUpperCase()
      })
      expect(normalizedTexts[0]).toBe('BEGIN;')
      expect(normalizedTexts.at(-1)).toBe('COMMIT;')
      expect(normalizedTexts).not.toContain('ROLLBACK;')
    })

    it('refunds one credit when interviewer cancels a verified interview', async function run() {
      const { queries, persistOutboxEvent, service } = createService({
        interviewRow: buildInterviewRow(),
        cancelledRow: buildInterviewRow({ status: 'cancelled' }),
        userRows: [{ id: schedulerUserId }, { id: interviewerUserId }],
      })

      const result = await service.cancelInterview({
        interviewId,
        source: 'interviewer',
        initiatedByUserId: interviewerUserId,
        persistOutboxEvent,
      })

      expect(result).toEqual({ outcome: 'cancelled' })

      const refundQueries = queries.filter(function isRefund(query) {
        return query.text.includes('INSERT INTO premium_booking_credit_refunds')
      })
      expect(refundQueries).toHaveLength(1)
      expect(refundQueries[0]!.values).toEqual([
        fixedRefundId,
        interviewId,
        schedulerUserId,
        'interviewer_cancelled',
        interviewerUserId,
        fixedNow,
      ])
      expect(refundQueries[0]!.text).toContain('credits_refunded')
      expect(refundQueries[0]!.text).toContain('VALUES ($1, $2, $3, $4, $5, 1, $6)')

      const creditQueries = queries.filter(function isCreditIncrement(query) {
        return query.text.includes('credits = credits + 1')
      })
      expect(creditQueries).toHaveLength(1)
      expect(creditQueries[0]!.values[0]).toBe(schedulerUserId)

      expect(persistOutboxEvent).toHaveBeenCalledTimes(1)
    })

    it('returns already_cancelled idempotently when the initial lock sees a cancelled interview', async function run() {
      const { queries, persistOutboxEvent, service } = createService({
        interviewRow: buildInterviewRow({ status: 'cancelled' }),
      })

      const result = await service.cancelInterview({
        interviewId,
        source: 'scheduler',
        initiatedByUserId: schedulerUserId,
        persistOutboxEvent,
      })

      expect(result).toEqual({ outcome: 'already_cancelled' })
      expect(persistOutboxEvent).not.toHaveBeenCalled()

      const refundQueries = queries.filter(function isRefund(query) {
        return query.text.includes('INSERT INTO premium_booking_credit_refunds')
      })
      const creditQueries = queries.filter(function isCreditIncrement(query) {
        return query.text.includes('credits = credits + 1')
      })
      expect(refundQueries).toHaveLength(0)
      expect(creditQueries).toHaveLength(0)
    })

    it('returns invalid_status when the interview is ongoing', async function run() {
      const { persistOutboxEvent, service } = createService({
        interviewRow: buildInterviewRow({ status: 'ongoing' }),
      })

      const result = await service.cancelInterview({
        interviewId,
        source: 'scheduler',
        initiatedByUserId: schedulerUserId,
        persistOutboxEvent,
      })

      expect(result).toEqual({ outcome: 'invalid_status' })
      expect(persistOutboxEvent).not.toHaveBeenCalled()
    })

    it('rejects with PremiumNotFoundError when the interview does not exist', async function run() {
      const { queries, persistOutboxEvent, service } = createService({
        interviewRow: null,
      })

      const promise = service.cancelInterview({
        interviewId,
        source: 'scheduler',
        initiatedByUserId: schedulerUserId,
        persistOutboxEvent,
      })

      await expect(promise).rejects.toBeInstanceOf(PremiumNotFoundError)
      await expect(
        service.cancelInterview({
          interviewId,
          source: 'scheduler',
          initiatedByUserId: schedulerUserId,
          persistOutboxEvent,
        }),
      ).rejects.toMatchObject({ name: 'PremiumNotFoundError' })

      const normalizedTexts = queries.map(function normalize(query) {
        return query.text.trim().toUpperCase()
      })
      expect(normalizedTexts).toContain('ROLLBACK;')
    })

    it('throws a conflict error when serialization conflicts are exhausted', async function run() {
      const { persistOutboxEvent, service } = createService({
        interviewRow: buildInterviewRow(),
        serializationConflict: true,
      })

      await expect(
        service.cancelInterview({
          interviewId,
          source: 'scheduler',
          initiatedByUserId: schedulerUserId,
          persistOutboxEvent,
        }),
      ).rejects.toThrow(PremiumConflictError)
    })

    it('locks participant users before locking the interview for update', async function run() {
      const { queries, persistOutboxEvent, service } = createService({
        interviewRow: buildInterviewRow(),
        cancelledRow: buildInterviewRow({ status: 'cancelled' }),
        userRows: [{ id: schedulerUserId }, { id: interviewerUserId }],
      })

      await service.cancelInterview({
        interviewId,
        source: 'scheduler',
        initiatedByUserId: schedulerUserId,
        persistOutboxEvent,
      })

      const userLockIndex = queries.findIndex(function isUserLock(query) {
        return (
          query.text.includes('FROM "user"') &&
          query.text.includes('FOR UPDATE')
        )
      })
      const interviewLockIndex = queries.findIndex(function isInterviewLock(query) {
        return (
          query.text.includes('FROM interviews') &&
          query.text.includes('WHERE id = $1') &&
          query.text.includes('FOR UPDATE')
        )
      })

      expect(userLockIndex).toBeGreaterThanOrEqual(0)
      expect(interviewLockIndex).toBeGreaterThanOrEqual(0)
      expect(userLockIndex).toBeLessThan(interviewLockIndex)
    })

    it('passes participant user ids in sorted uuid order to lockUsersForUpdate', async function run() {
      const reversedSchedulerId =
        '99999999-9999-4999-8999-999999999999'
      const reversedInterviewerId =
        '11111111-1111-4111-8111-111111111111'

      const { queries, persistOutboxEvent, service } = createService({
        interviewRow: buildInterviewRow({
          scheduler_id: reversedSchedulerId,
          interviewer_id: reversedInterviewerId,
        }),
        cancelledRow: buildInterviewRow({
          status: 'cancelled',
          scheduler_id: reversedSchedulerId,
          interviewer_id: reversedInterviewerId,
        }),
        userRows: [
          { id: reversedInterviewerId },
          { id: reversedSchedulerId },
        ],
      })

      await service.cancelInterview({
        interviewId,
        source: 'scheduler',
        initiatedByUserId: reversedSchedulerId,
        persistOutboxEvent,
      })

      const userLockQuery = queries.find(function isUserLock(query) {
        return (
          query.text.includes('FROM "user"') &&
          query.text.includes('FOR UPDATE')
        )
      })

      expect(userLockQuery).toBeDefined()
      expect(userLockQuery!.values).toEqual([
        [reversedInterviewerId, reversedSchedulerId],
      ])
    })

    it('retries when interview participants change between initial read and lock', async function run() {
      const { queries, persistOutboxEvent, service } = createService({
        interviewRow: buildInterviewRow({
          interviewer_id: interviewerUserId,
        }),
        lockedInterviewRow: buildInterviewRow({
          interviewer_id: '77777777-7777-4777-8777-777777777777',
        }),
        cancelledRow: buildInterviewRow({ status: 'cancelled' }),
        userRows: [
          { id: schedulerUserId },
          { id: interviewerUserId },
          { id: '77777777-7777-4777-8777-777777777777' },
        ],
      })

      const promise = service.cancelInterview({
        interviewId,
        source: 'scheduler',
        initiatedByUserId: schedulerUserId,
        persistOutboxEvent,
      })

      await expect(promise).rejects.toThrow(PremiumConflictError)
      expect(persistOutboxEvent).not.toHaveBeenCalled()

      const beginCount = queries.filter(function isBegin(query) {
        return query.text.trim().toUpperCase() === 'BEGIN;'
      })
      expect(beginCount).toHaveLength(3)
    })

    it('throws conflict error after exhausting retries on participant changes', async function run() {
      const { persistOutboxEvent, service } = createService({
        interviewRow: buildInterviewRow({
          interviewer_id: interviewerUserId,
        }),
        lockedInterviewRow: buildInterviewRow({
          interviewer_id: '77777777-7777-4777-8777-777777777777',
        }),
        cancelledRow: buildInterviewRow({ status: 'cancelled' }),
        userRows: [
          { id: schedulerUserId },
          { id: interviewerUserId },
          { id: '77777777-7777-4777-8777-777777777777' },
        ],
      })

      await expect(
        service.cancelInterview({
          interviewId,
          source: 'scheduler',
          initiatedByUserId: schedulerUserId,
          persistOutboxEvent,
        }),
      ).rejects.toThrow(
        'Cancellation transaction conflicts exhausted after retries. Please retry.',
      )
    })
  })

  describe('cancelUpcomingInterviewsForUser', function cancelUpcomingSuite() {
    it('cancels all upcoming interviews and refunds only the verified interviewer row', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
        booking_channel: 'verified_interviewer',
      })
      const standardRow = buildInterviewRow({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        scheduler_id: deletingUserId,
        interviewer_id: interviewerUserId,
        booking_channel: 'standard_match',
      })
      const aiDirectRow = buildInterviewRow({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        scheduler_id: deletingUserId,
        interviewer_id: null,
        mode: 'ai_led',
        tier: 'standard',
        booking_channel: 'ai_direct',
      })

      const { queries, persistOutboxEvent, service } = createService({
        upcomingRows: [verifiedRow, standardRow, aiDirectRow],
        lockedRows: [verifiedRow, standardRow, aiDirectRow],
        userRows: [
          { id: deletingUserId },
          { id: schedulerUserId },
          { id: interviewerUserId },
        ],
      })

      const result = await service.cancelUpcomingInterviewsForUser({
        userId: deletingUserId,
        persistOutboxEvent,
      })

      expect(result).toEqual({ outcome: 'cancelled', count: 3 })
      expect(persistOutboxEvent).toHaveBeenCalledTimes(3)

      const refundQueries = queries.filter(function isRefund(query) {
        return query.text.includes('INSERT INTO premium_booking_credit_refunds')
      })
      expect(refundQueries).toHaveLength(1)
      expect(refundQueries[0]!.values).toEqual([
        fixedRefundId,
        interviewId,
        schedulerUserId,
        'interviewer_account_deleted',
        deletingUserId,
        fixedNow,
      ])

      const creditQueries = queries.filter(function isCreditIncrement(query) {
        return query.text.includes('credits = credits + 1')
      })
      expect(creditQueries).toHaveLength(1)
      expect(creditQueries[0]!.values[0]).toBe(schedulerUserId)
    })

    it('calls softDeleteAccount when provided', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
        booking_channel: 'verified_interviewer',
      })

      const { persistOutboxEvent, service, softDeleteAccount } = createService({
        upcomingRows: [verifiedRow],
        lockedRows: [verifiedRow],
        userRows: [{ id: deletingUserId }, { id: schedulerUserId }],
      })

      const result = await service.cancelUpcomingInterviewsForUser({
        userId: deletingUserId,
        persistOutboxEvent,
        softDeleteAccount,
      })

      expect(result).toEqual({ outcome: 'cancelled', count: 1 })
      expect(softDeleteAccount).toHaveBeenCalledTimes(1)
    })

    it('passes the transaction query executor to softDeleteAccount', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
        booking_channel: 'verified_interviewer',
      })

      const receivedExecutors: unknown[] = []
      const softDeleteAccount = vi.fn(async function softDelete(qe: unknown) {
        receivedExecutors.push(qe)
      })

      const { executor, persistOutboxEvent, service } = createService({
        upcomingRows: [verifiedRow],
        lockedRows: [verifiedRow],
        userRows: [{ id: deletingUserId }, { id: schedulerUserId }],
      })

      await service.cancelUpcomingInterviewsForUser({
        userId: deletingUserId,
        persistOutboxEvent,
        softDeleteAccount,
      })

      expect(softDeleteAccount).toHaveBeenCalledTimes(1)
      expect(receivedExecutors).toHaveLength(1)
      expect(receivedExecutors[0]).toBe(executor)
    })

    it('requeries all qualifying interviews after locking users using no LIMIT', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
      })

      const { queries, persistOutboxEvent, service } = createService({
        upcomingRows: [verifiedRow],
        lockedRows: [verifiedRow],
        userRows: [{ id: deletingUserId }, { id: schedulerUserId }],
      })

      await service.cancelUpcomingInterviewsForUser({
        userId: deletingUserId,
        persistOutboxEvent,
      })

      const listQueries = queries.filter(function isListQuery(query) {
        return (
          query.text.includes('FROM interviews') &&
          query.text.includes("WHERE status = 'scheduled'")
        )
      })

      expect(listQueries.length).toBeGreaterThanOrEqual(2)
      for (const listQuery of listQueries) {
        expect(listQuery.text).not.toContain('LIMIT 500')
      }
    })

    it('locks the participant user union before locking interviews for update', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
        booking_channel: 'verified_interviewer',
      })

      const { queries, persistOutboxEvent, service } = createService({
        upcomingRows: [verifiedRow],
        lockedRows: [verifiedRow],
        userRows: [{ id: deletingUserId }, { id: schedulerUserId }],
      })

      await service.cancelUpcomingInterviewsForUser({
        userId: deletingUserId,
        persistOutboxEvent,
      })

      const userLockIndex = queries.findIndex(function isUserLock(query) {
        return (
          query.text.includes('FROM "user"') &&
          query.text.includes('FOR UPDATE')
        )
      })
      const interviewLockIndex = queries.findIndex(function isInterviewLock(query) {
        return (
          query.text.includes('FROM interviews') &&
          query.text.includes('WHERE id = ANY') &&
          query.text.includes('FOR UPDATE')
        )
      })

      expect(userLockIndex).toBeGreaterThanOrEqual(0)
      expect(interviewLockIndex).toBeGreaterThanOrEqual(0)
      expect(userLockIndex).toBeLessThan(interviewLockIndex)
    })

    it('retries when requeried interviews contain new participants', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
      })
      const expansionRow = buildInterviewRow({
        id: extraInterviewId,
        scheduler_id: fourthUserId,
        interviewer_id: null,
        booking_channel: 'standard_match',
      })

      const { queries, persistOutboxEvent, service } = createService({
        upcomingRows: [verifiedRow],
        requeriedRows: [verifiedRow, expansionRow],
        lockedRows: [verifiedRow, expansionRow],
        userRows: [
          { id: deletingUserId },
          { id: schedulerUserId },
          { id: fourthUserId },
        ],
      })

      const promise = service.cancelUpcomingInterviewsForUser({
        userId: deletingUserId,
        persistOutboxEvent,
      })

      await expect(promise).rejects.toThrow(/participant set expanded/i)
      expect(persistOutboxEvent).not.toHaveBeenCalled()

      const beginCount = queries.filter(function isBegin(query) {
        return query.text.trim().toUpperCase() === 'BEGIN;'
      })
      expect(beginCount).toHaveLength(3)
    })

    it('locks interviews before detecting expansion from requeried rows', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
      })
      const expansionRow = buildInterviewRow({
        id: extraInterviewId,
        scheduler_id: fourthUserId,
        interviewer_id: null,
        booking_channel: 'standard_match',
      })

      const { queries, persistOutboxEvent, service } = createService({
        upcomingRows: [verifiedRow],
        requeriedRows: [verifiedRow, expansionRow],
        lockedRows: [verifiedRow, expansionRow],
        userRows: [
          { id: deletingUserId },
          { id: schedulerUserId },
          { id: fourthUserId },
        ],
      })

      const promise = service.cancelUpcomingInterviewsForUser({
        userId: deletingUserId,
        persistOutboxEvent,
      })

      await expect(promise).rejects.toThrow(/participant set expanded/i)
      expect(persistOutboxEvent).not.toHaveBeenCalled()

      const interviewLockIndex = queries.findIndex(function isInterviewLock(query) {
        return (
          query.text.includes('FROM interviews') &&
          query.text.includes('WHERE id = ANY') &&
          query.text.includes('FOR UPDATE')
        )
      })

      expect(interviewLockIndex).toBeGreaterThanOrEqual(0)
    })

    it('retries when requeried interviews contain new interview ids', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
      })
      const newInterviewRow = buildInterviewRow({
        id: '77777777-7777-4777-8777-777777777777',
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
        booking_channel: 'standard_match',
      })

      const { queries, persistOutboxEvent, service } = createService({
        upcomingRows: [verifiedRow],
        requeriedRows: [verifiedRow, newInterviewRow],
        lockedRows: [verifiedRow, newInterviewRow],
        userRows: [{ id: deletingUserId }, { id: schedulerUserId }],
      })

      const promise = service.cancelUpcomingInterviewsForUser({
        userId: deletingUserId,
        persistOutboxEvent,
      })

      await expect(promise).rejects.toThrow(/participant set expanded/i)
      expect(persistOutboxEvent).not.toHaveBeenCalled()

      const beginCount = queries.filter(function isBegin(query) {
        return query.text.trim().toUpperCase() === 'BEGIN;'
      })
      expect(beginCount).toHaveLength(3)
    })

    it('retries on participant-union expansion from locked rows and throws after three attempts', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
        booking_channel: 'verified_interviewer',
      })
      const standardRow = buildInterviewRow({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        scheduler_id: deletingUserId,
        interviewer_id: interviewerUserId,
        booking_channel: 'standard_match',
      })
      const expansionRow = buildInterviewRow({
        id: extraInterviewId,
        scheduler_id: fourthUserId,
        interviewer_id: null,
        booking_channel: 'standard_match',
      })

      const { queries, persistOutboxEvent, service } = createService({
        upcomingRows: [verifiedRow, standardRow],
        lockedRows: [verifiedRow, standardRow, expansionRow],
        userRows: [
          { id: deletingUserId },
          { id: schedulerUserId },
          { id: interviewerUserId },
        ],
      })

      const promise = service.cancelUpcomingInterviewsForUser({
        userId: deletingUserId,
        persistOutboxEvent,
      })

      await expect(promise).rejects.toThrow(/participant set expanded/i)
      expect(persistOutboxEvent).not.toHaveBeenCalled()

      const beginCount = queries.filter(function isBegin(query) {
        return query.text.trim().toUpperCase() === 'BEGIN;'
      })
      expect(beginCount.length).toBeGreaterThanOrEqual(2)
      expect(beginCount).toHaveLength(3)
    })

    it('retries on expanded union and succeeds with expanded snapshot on second attempt', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
        booking_channel: 'verified_interviewer',
      })
      const expansionRow = buildInterviewRow({
        id: extraInterviewId,
        scheduler_id: deletingUserId,
        interviewer_id: fourthUserId,
        booking_channel: 'standard_match',
      })

      const queries: SqlQuery[] = []
      let attemptCount = 0
      let listAllUpcomingCallCount = 0

      const executor = {
        queries,
        async query<Row>(queryInput: SqlQuery): Promise<{ rows: Row[] }> {
          queries.push(queryInput)
          const text = queryInput.text
          const normalized = text.trim().toUpperCase()

          if (normalized === 'BEGIN;') {
            attemptCount += 1
            return { rows: [] as Row[] }
          }

          if (normalized === 'COMMIT;' || normalized === 'ROLLBACK;') {
            return { rows: [] as Row[] }
          }

          if (text.includes('INSERT INTO premium_booking_credit_refunds')) {
            return { rows: [{ id: fixedRefundId }] as Row[] }
          }

          if (text.includes('credits = credits + 1')) {
            const [schedulerId] = queryInput.values
            return { rows: [{ id: schedulerId as string }] as Row[] }
          }

          if (text.includes('UPDATE interviews')) {
            const [id] = queryInput.values
            const knownRows = [verifiedRow, expansionRow]
            const matched = knownRows.find(function sameId(row) {
              return row.id === id
            })
            if (matched) {
              return { rows: [{ ...matched, status: 'cancelled' }] as Row[] }
            }
            return { rows: [buildInterviewRow({ status: 'cancelled' })] as Row[] }
          }

          if (text.includes('FROM interviews') && text.includes('WHERE id = ANY')) {
            return { rows: [verifiedRow, expansionRow] as Row[] }
          }

          if (
            text.includes('FROM interviews') &&
            text.includes("WHERE status = 'scheduled'")
          ) {
            listAllUpcomingCallCount += 1
            const isInitial = listAllUpcomingCallCount % 2 === 1
            if (attemptCount === 1 && isInitial) {
              return { rows: [verifiedRow] as Row[] }
            }
            return { rows: [verifiedRow, expansionRow] as Row[] }
          }

          if (text.includes('FROM "user"') && text.includes('WHERE id = ANY')) {
            return {
              rows: [
                { id: deletingUserId },
                { id: schedulerUserId },
                { id: fourthUserId },
              ] as Row[],
            }
          }

          return { rows: [] as Row[] }
        },
      }

      const repository = new PremiumCancellationRepository()
      const service = new PremiumCancellationService(
        repository,
        executor,
        function createId() {
          return fixedRefundId
        },
        function now() {
          return fixedNow
        },
      )
      const persistOutboxEvent = vi.fn(async () => {})

      const result = await service.cancelUpcomingInterviewsForUser({
        userId: deletingUserId,
        persistOutboxEvent,
      })

      expect(result).toEqual({ outcome: 'cancelled', count: 2 })
      expect(persistOutboxEvent).toHaveBeenCalledTimes(2)

      const beginCount = queries.filter(function isBegin(query) {
        return query.text.trim().toUpperCase() === 'BEGIN;'
      })
      expect(beginCount).toHaveLength(2)
    })

    it('rolls back transaction when refund insert fails during account deletion', async function run() {
      const verifiedRow = buildInterviewRow({
        id: interviewId,
        scheduler_id: schedulerUserId,
        interviewer_id: deletingUserId,
        booking_channel: 'verified_interviewer',
      })

      const { queries, persistOutboxEvent, service, softDeleteAccount } = createService({
        upcomingRows: [verifiedRow],
        lockedRows: [verifiedRow],
        userRows: [{ id: deletingUserId }, { id: schedulerUserId }],
        refundInsertReturnsNull: true,
      })

      await expect(
        service.cancelUpcomingInterviewsForUser({
          userId: deletingUserId,
          persistOutboxEvent,
          softDeleteAccount,
        }),
      ).rejects.toThrow('Refund row already exists for this interview.')

      expect(softDeleteAccount).not.toHaveBeenCalled()

      const normalizedTexts = queries.map(function normalize(query) {
        return query.text.trim().toUpperCase()
      })
      expect(normalizedTexts).toContain('ROLLBACK;')
      expect(normalizedTexts).not.toContain('COMMIT;')
    })
  })
})
