import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import {
  PremiumAvailabilityRepository,
  type PremiumInterviewerSlotRow,
} from './premium-availability-repository'
import { PremiumAvailabilityService } from './premium-availability-service'
import { defaultPremiumPolicyConfig } from './premium-policy-config'
import {
  PremiumConflictError,
  PremiumForbiddenError,
  PremiumNotFoundError,
  PremiumUnauthorizedError,
  PremiumValidationError,
  type PremiumSession,
} from './premium-errors'

const sessionUserId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '99999999-9999-4999-8999-999999999999'

const activeSession: PremiumSession = {
  userId: sessionUserId,
  email: 'interviewer@mako.dev',
}

const fixedNow = '2026-04-13T09:00:00.000Z'
const fixedSlotId = '22222222-2222-4222-8222-222222222222'

const validStartTime = '2026-04-13T10:00:00.000Z'
const validEndTime = '2026-04-13T11:00:00.000Z'

describe('PremiumAvailabilityService', function premiumAvailabilityServiceSuite() {
  describe('publishSlot', function publishSlotSuite() {
    it('publishes an available slot with server-derived endTime', async function run() {
      const { service, queries } = createService()

      const result = await service.publishSlot(activeSession, {
        interviewType: 'coding',
        startTime: validStartTime,
      })

      expect(result.slot).toMatchObject({
        id: fixedSlotId,
        interviewerId: sessionUserId,
        interviewType: 'coding',
        startTime: validStartTime,
        endTime: validEndTime,
        status: 'available',
        createdAt: fixedNow,
        updatedAt: fixedNow,
      })

      // Transaction bookends and user-row lock precede overlap/interview/insert checks.
      const normalizedTexts = queries.map(function normalize(q) {
        return q.text.trim().toUpperCase()
      })
      expect(normalizedTexts[0]).toBe('BEGIN;')
      expect(normalizedTexts.at(-1)).toBe('COMMIT;')
      expect(normalizedTexts[1]).toContain('FOR UPDATE')
      expect(normalizedTexts[1]).toContain('FROM "USER"')
    })

    it('rejects an unauthenticated session', async function run() {
      const { service } = createService()

      await expect(
        service.publishSlot(null, {
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      ).rejects.toBeInstanceOf(PremiumUnauthorizedError)
    })

    it('rejects a soft-deleted interviewer under lock with ACCOUNT_INACTIVE', async function run() {
      const { service } = createService({
        userRow: { deleted_at: '2026-04-01T00:00:00.000Z', companies: true },
      })

      const promise = service.publishSlot(activeSession, {
        interviewType: 'coding',
        startTime: validStartTime,
      })

      await expect(promise).rejects.toBeInstanceOf(PremiumForbiddenError)
      await expect(promise).rejects.toMatchObject({ message: 'ACCOUNT_INACTIVE' })
    })

    it('rejects a missing interviewer row under lock with ACCOUNT_INACTIVE', async function run() {
      const { service } = createService({ userRow: null })

      await expect(
        service.publishSlot(activeSession, {
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      ).rejects.toBeInstanceOf(PremiumForbiddenError)
    })

    it('rejects a non-eligible interviewer (companies != true) under lock', async function run() {
      const { service } = createService({
        userRow: { deleted_at: null, companies: false },
      })

      await expect(
        service.publishSlot(activeSession, {
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      ).rejects.toBeInstanceOf(PremiumForbiddenError)
    })

    it('rejects a startTime inside the configured lead time', async function run() {
      const { service } = createService()

      await expect(
        service.publishSlot(activeSession, {
          interviewType: 'coding',
          startTime: '2026-04-13T09:30:00.000Z',
        }),
      ).rejects.toBeInstanceOf(PremiumValidationError)
    })

    it('rejects a startTime beyond the configured horizon', async function run() {
      const { service } = createService()

      await expect(
        service.publishSlot(activeSession, {
          interviewType: 'coding',
          startTime: '2026-08-01T10:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(PremiumValidationError)
    })

    it('rejects an invalid interview type', async function run() {
      const { service } = createService()

      await expect(
        service.publishSlot(activeSession, {
          interviewType: 'invalid_type',
          startTime: validStartTime,
        }),
      ).rejects.toBeInstanceOf(Error)
    })

    it('rejects an overlapping existing non-cancelled premium slot', async function run() {
      const { service } = createService({ overlap: true })

      await expect(
        service.publishSlot(activeSession, {
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      ).rejects.toBeInstanceOf(PremiumConflictError)
    })

    it('rejects a window conflicting with a scheduled/ongoing interview', async function run() {
      const { service } = createService({ interviewConflict: true })

      await expect(
        service.publishSlot(activeSession, {
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      ).rejects.toBeInstanceOf(PremiumConflictError)
    })

    it('emits PII-safe publish requested log at start', async function run() {
      const logs: LogEntry[] = []
      const { service } = createService({}, logs)

      await service.publishSlot(activeSession, {
        interviewType: 'coding',
        startTime: validStartTime,
      })

      const log = logs.find(function findLog(l) {
        return l.event === 'premium.slot.publish_requested'
      })
      expect(log).toBeDefined()
      expect(log!.context).toHaveProperty('interviewerId', sessionUserId)
      expect(log!.context).toHaveProperty('interviewType', 'coding')
      expect(log!.context).toHaveProperty('outcome', 'requested')
      expect(JSON.stringify(log!.context)).not.toContain('displayName')
      expect(JSON.stringify(log!.context)).not.toContain('email')
    })

    it('emits PII-safe publish outcome log on success', async function run() {
      const logs: LogEntry[] = []
      const { service } = createService({}, logs)

      await service.publishSlot(activeSession, {
        interviewType: 'coding',
        startTime: validStartTime,
      })

      const log = logs.find(function findLog(l) {
        return l.event === 'premium.slot.publish_succeeded'
      })
      expect(log).toBeDefined()
      expect(log!.context).toHaveProperty('slotId', fixedSlotId)
      expect(log!.context).toHaveProperty('interviewerId', sessionUserId)
      expect(log!.context).toHaveProperty('interviewType', 'coding')
      expect(log!.context).toHaveProperty('outcome', 'published')
      expect(JSON.stringify(log!.context)).not.toContain('displayName')
      expect(JSON.stringify(log!.context)).not.toContain('email')
    })

    it('emits PII-safe publish outcome log on conflict', async function run() {
      const logs: LogEntry[] = []
      const { service } = createService({ overlap: true }, logs)

      await expect(
        service.publishSlot(activeSession, {
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      ).rejects.toBeInstanceOf(PremiumConflictError)

      const log = logs.find(function findLog(l) {
        return l.event === 'premium.slot.publish_conflicted'
      })
      expect(log).toBeDefined()
      expect(log!.context).toHaveProperty('interviewerId', sessionUserId)
      expect(log!.context).toHaveProperty('interviewType', 'coding')
      expect(log!.context).toHaveProperty('outcome', 'overlap_rejected')
      expect(JSON.stringify(log!.context)).not.toContain('displayName')
      expect(JSON.stringify(log!.context)).not.toContain('email')
    })

    it('retries publish on serialization conflict and eventually succeeds', async function run() {
      const logs: LogEntry[] = []
      const { service } = createService({ serializationConflict: 1 }, logs)

      const result = await service.publishSlot(activeSession, {
        interviewType: 'coding',
        startTime: validStartTime,
      })

      expect(result.slot.id).toBe(fixedSlotId)

      const retryLog = logs.find(function findLog(l) {
        return l.event === 'premium.slot.publish_retry'
      })
      expect(retryLog).toBeDefined()
      expect(retryLog!.context).toHaveProperty('interviewerId', sessionUserId)
      expect(retryLog!.context).toHaveProperty('attempt', 1)
      expect(retryLog!.context).toHaveProperty('maxAttempts', 3)

      const successLog = logs.find(function findLog(l) {
        return l.event === 'premium.slot.publish_succeeded'
      })
      expect(successLog).toBeDefined()
    })

    it('throws conflict error when publish retries are exhausted', async function run() {
      const logs: LogEntry[] = []
      const { service } = createService({ serializationConflict: true }, logs)

      await expect(
        service.publishSlot(activeSession, {
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      ).rejects.toBeInstanceOf(PremiumConflictError)

      const exhaustedLog = logs.find(function findLog(l) {
        return l.event === 'premium.slot.publish_conflict_exhausted'
      })
      expect(exhaustedLog).toBeDefined()
      expect(exhaustedLog!.context).toHaveProperty('interviewerId', sessionUserId)
    })
  })

  describe('listSlots', function listSlotsSuite() {
    it('returns slots with pagination and policy metadata', async function run() {
      const rows: PremiumInterviewerSlotRow[] = [
        {
          id: fixedSlotId,
          interviewer_id: sessionUserId,
          interview_type: 'coding',
          start_time: validStartTime,
          end_time: validEndTime,
          status: 'available',
          created_at: fixedNow,
          updated_at: fixedNow,
        },
      ]
      const { service } = createService({ listRows: rows, count: 1 })

      const result = await service.listSlots(activeSession, {})

      expect(result.slots).toHaveLength(1)
      expect(result.slots[0]).toMatchObject({
        interviewerId: sessionUserId,
        interviewType: 'coding',
        status: 'available',
      })
      expect(result.pagination).toEqual({
        limit: 25,
        offset: 0,
        hasMore: false,
      })
      expect(result.policy).toEqual({
        leadTimeMinutes: 60,
        horizonDays: 90,
        priceCredits: 1,
      })
    })

    it('applies status and interviewType filters from the query', async function run() {
      const { service, queries } = createService({ listRows: [], count: 0 })

      await service.listSlots(activeSession, {
        status: 'claimed',
        interviewType: 'behavioral',
        limit: 5,
        offset: 10,
      })

      const listQuery = queries.find(function findListQuery(q) {
        return q.text.includes('FROM premium_interviewer_slots') && q.text.includes('ORDER BY start_time')
      })

      expect(listQuery).toBeDefined()
      expect(listQuery!.text).toContain('ORDER BY start_time ASC, id ASC')
      expect(listQuery!.values).toContain('claimed')
      expect(listQuery!.values).toContain('behavioral')
      expect(listQuery!.values).toContain(5)
      expect(listQuery!.values).toContain(10)
    })

    it('rejects an unauthenticated session', async function run() {
      const { service } = createService()

      await expect(service.listSlots(null, {})).rejects.toBeInstanceOf(
        PremiumUnauthorizedError,
      )
    })

    it('rejects an inactive account with ACCOUNT_INACTIVE', async function run() {
      const { service } = createService({
        userRow: { deleted_at: '2026-04-01T00:00:00.000Z', companies: true },
      })

      await expect(service.listSlots(activeSession, {})).rejects.toBeInstanceOf(
        PremiumForbiddenError,
      )
    })
  })

  describe('cancelSlot', function cancelSlotSuite() {
    it('cancels an available slot owned by the interviewer', async function run() {
      const { service } = createService({ cancelResult: 'updated' })

      const result = await service.cancelSlot(activeSession, fixedSlotId)

      expect(result).toEqual({ success: true })
    })

    it('returns idempotent success for an already-cancelled slot', async function run() {
      const { service } = createService({
        cancelResult: 'empty',
        existingSlot: 'cancelled',
      })

      const result = await service.cancelSlot(activeSession, fixedSlotId)

      expect(result).toEqual({ success: true })
    })

    it('rejects cancelling a claimed slot', async function run() {
      const { service } = createService({
        cancelResult: 'empty',
        existingSlot: 'claimed',
      })

      await expect(service.cancelSlot(activeSession, fixedSlotId)).rejects.toBeInstanceOf(
        PremiumConflictError,
      )
    })

    it('rejects an unknown slot', async function run() {
      const { service } = createService({
        cancelResult: 'empty',
        existingSlot: 'none',
      })

      await expect(service.cancelSlot(activeSession, fixedSlotId)).rejects.toBeInstanceOf(
        PremiumNotFoundError,
      )
    })

    it('rejects a slot owned by another interviewer without leaking existence', async function run() {
      const { service } = createService({
        cancelResult: 'empty',
        existingSlotOwnerId: otherUserId,
      })

      await expect(service.cancelSlot(activeSession, fixedSlotId)).rejects.toBeInstanceOf(
        PremiumNotFoundError,
      )
    })

    it('rejects an unauthenticated session', async function run() {
      const { service } = createService()

      await expect(service.cancelSlot(null, fixedSlotId)).rejects.toBeInstanceOf(
        PremiumUnauthorizedError,
      )
    })

    it('rejects an inactive account with ACCOUNT_INACTIVE', async function run() {
      const { service } = createService({
        userRow: { deleted_at: '2026-04-01T00:00:00.000Z', companies: true },
      })

      await expect(service.cancelSlot(activeSession, fixedSlotId)).rejects.toBeInstanceOf(
        PremiumForbiddenError,
      )
    })

    it('emits PII-safe cancel outcome log on success', async function run() {
      const logs: LogEntry[] = []
      const { service } = createService({ cancelResult: 'updated' }, logs)

      await service.cancelSlot(activeSession, fixedSlotId)

      const log = logs.find(function findLog(l) {
        return l.event === 'premium.slot.cancelled'
      })
      expect(log).toBeDefined()
      expect(log!.context).toHaveProperty('slotId', fixedSlotId)
      expect(log!.context).toHaveProperty('interviewerId', sessionUserId)
      expect(log!.context).toHaveProperty('outcome', 'cancelled')
      expect(JSON.stringify(log!.context)).not.toContain('displayName')
      expect(JSON.stringify(log!.context)).not.toContain('email')
    })

    it('emits PII-safe cancel outcome log on claimed rejection', async function run() {
      const logs: LogEntry[] = []
      const { service } = createService({ cancelResult: 'empty', existingSlot: 'claimed' }, logs)

      await expect(service.cancelSlot(activeSession, fixedSlotId)).rejects.toBeInstanceOf(
        PremiumConflictError,
      )

      const log = logs.find(function findLog(l) {
        return l.event === 'premium.slot.cancel_rejected'
      })
      expect(log).toBeDefined()
      expect(log!.context).toHaveProperty('slotId', fixedSlotId)
      expect(log!.context).toHaveProperty('interviewerId', sessionUserId)
      expect(log!.context).toHaveProperty('outcome', 'claimed_rejected')
      expect(JSON.stringify(log!.context)).not.toContain('displayName')
      expect(JSON.stringify(log!.context)).not.toContain('email')
    })

    it('retries cancel on serialization conflict and eventually succeeds', async function run() {
      const logs: LogEntry[] = []
      const { service } = createService(
        { cancelResult: 'updated', serializationConflict: 1 },
        logs,
      )

      const result = await service.cancelSlot(activeSession, fixedSlotId)

      expect(result).toEqual({ success: true })

      const retryLog = logs.find(function findLog(l) {
        return l.event === 'premium.slot.cancel_retry'
      })
      expect(retryLog).toBeDefined()
      expect(retryLog!.context).toHaveProperty('slotId', fixedSlotId)
      expect(retryLog!.context).toHaveProperty('interviewerId', sessionUserId)
      expect(retryLog!.context).toHaveProperty('attempt', 1)
      expect(retryLog!.context).toHaveProperty('maxAttempts', 3)

      const successLog = logs.find(function findLog(l) {
        return l.event === 'premium.slot.cancelled'
      })
      expect(successLog).toBeDefined()
    })

    it('throws conflict error when cancel retries are exhausted', async function run() {
      const logs: LogEntry[] = []
      const { service } = createService(
        { cancelResult: 'updated', serializationConflict: true },
        logs,
      )

      await expect(service.cancelSlot(activeSession, fixedSlotId)).rejects.toBeInstanceOf(
        PremiumConflictError,
      )

      const exhaustedLog = logs.find(function findLog(l) {
        return l.event === 'premium.slot.cancel_conflict_exhausted'
      })
      expect(exhaustedLog).toBeDefined()
      expect(exhaustedLog!.context).toHaveProperty('slotId', fixedSlotId)
      expect(exhaustedLog!.context).toHaveProperty('interviewerId', sessionUserId)
    })
  })
})

type MockExecutorOptions = {
  userRow?: { deleted_at: string | null; companies: boolean } | null
  overlap?: boolean
  interviewConflict?: boolean
  cancelResult?: 'updated' | 'empty'
  existingSlot?: 'claimed' | 'cancelled' | 'none'
  existingSlotOwnerId?: string
  listRows?: PremiumInterviewerSlotRow[]
  count?: number
  serializationConflict?: boolean | number
}

type LogEntry = {
  event: string
  context: Record<string, unknown>
}

function createService(options: MockExecutorOptions = {}, logs?: LogEntry[]) {
  const queries: SqlQuery[] = []
  let beginCount = 0

  const executor = {
    queries,
    async query<Row>(queryInput: SqlQuery): Promise<{ rows: Row[] }> {
      queries.push(queryInput)
      const text = queryInput.text

      if (text.trim().toUpperCase() === 'BEGIN;') {
        beginCount += 1
      }

      if (
        options.serializationConflict === true ||
        (typeof options.serializationConflict === 'number' &&
          beginCount === options.serializationConflict)
      ) {
        const conflictError = new Error('deadlock detected')
        ;(conflictError as { code?: string }).code = '40001'
        throw conflictError
      }

      if (text.includes('BEGIN') || text.includes('COMMIT') || text.includes('ROLLBACK')) {
        return { rows: [] as Row[] }
      }

      if (text.includes('INSERT INTO premium_interviewer_slots')) {
        const [id, interviewerId, interviewType, startTime, endTime, createdAt, updatedAt] =
          queryInput.values
        return {
          rows: [
            {
              id,
              interviewer_id: interviewerId,
              interview_type: interviewType,
              start_time: startTime,
              end_time: endTime,
              status: 'available',
              created_at: createdAt,
              updated_at: updatedAt,
            },
          ] as Row[],
        }
      }

      if (text.includes('UPDATE premium_interviewer_slots')) {
        if (options.cancelResult === 'empty') {
          return { rows: [] as Row[] }
        }

        const [slotId] = queryInput.values
        return {
          rows: [
            {
              id: slotId,
              interviewer_id: sessionUserId,
              interview_type: 'coding',
              start_time: validStartTime,
              end_time: validEndTime,
              status: 'cancelled',
              created_at: fixedNow,
              updated_at: fixedNow,
            },
          ] as Row[],
        }
      }

      if (text.includes('FROM premium_interviewer_slots') && text.includes('COUNT(*)')) {
        return { rows: [{ count: String(options.count ?? 0) }] as Row[] }
      }

      if (
        text.includes('FROM premium_interviewer_slots') &&
        text.includes('ORDER BY start_time')
      ) {
        return { rows: (options.listRows ?? []) as Row[] }
      }

      if (
        text.includes('FROM premium_interviewer_slots') &&
        text.includes("status <> 'cancelled'")
      ) {
        return { rows: (options.overlap ? [{ id: 'overlap-slot-id' }] : []) as Row[] }
      }

      if (text.includes('FROM premium_interviewer_slots')) {
        const status = options.existingSlot ?? 'none'

        if (status === 'none') {
          return { rows: [] as Row[] }
        }

        const [slotId] = queryInput.values
        return {
          rows: [
            {
              id: slotId,
              interviewer_id: options.existingSlotOwnerId ?? sessionUserId,
              interview_type: 'coding',
              start_time: validStartTime,
              end_time: validEndTime,
              status,
              created_at: fixedNow,
              updated_at: fixedNow,
            },
          ] as Row[],
        }
      }

      if (text.includes('FROM interviews')) {
        return {
          rows: (options.interviewConflict ? [{ id: 'conflict-interview-id' }] : []) as Row[],
        }
      }

      if (text.includes('FROM "user"')) {
        if (options.userRow === undefined) {
          return { rows: [{ id: sessionUserId, deleted_at: null, companies: true }] as Row[] }
        }

        if (options.userRow === null) {
          return { rows: [] as Row[] }
        }

        return { rows: [{ id: sessionUserId, ...options.userRow }] as Row[] }
      }

      return { rows: [] as Row[] }
    },
  }

  const logger = logs
    ? {
        info: function info(event: string, context: Record<string, unknown>) {
          logs.push({ event, context })
        },
      }
    : undefined

  const service = new PremiumAvailabilityService(
    new PremiumAvailabilityRepository(),
    defaultPremiumPolicyConfig,
    executor,
    function createId() {
      return fixedSlotId
    },
    function now() {
      return fixedNow
    },
    logger,
  )

  return { executor, queries, service }
}
