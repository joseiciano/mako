import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { registerPremiumAvailabilityController } from './premium-availability-controller'
import { PremiumAvailabilityRepository, type PremiumInterviewerSlotRow } from './premium-availability-repository'
import { PremiumAvailabilityService } from './premium-availability-service'
import { defaultPremiumPolicyConfig } from './premium-policy-config'
import type { PremiumSession } from './premium-errors'

type TestBindings = Record<string, unknown>

const sessionUserId = '11111111-1111-4111-8111-111111111111'

const activeSession: PremiumSession = {
  userId: sessionUserId,
  email: 'interviewer@mako.dev',
}

const fixedNow = '2026-04-13T09:00:00.000Z'
const fixedSlotId = '22222222-2222-4222-8222-222222222222'

const validStartTime = '2026-04-13T10:00:00.000Z'
const validEndTime = '2026-04-13T11:00:00.000Z'

describe('PremiumAvailabilityController', function premiumAvailabilityControllerSuite() {
  describe('POST /api/premium/interviewer/slots', function publishRouteSuite() {
    it('returns 201 with the published slot and no-store cache header', async function run() {
      const app = createPremiumApp({ session: activeSession })

      const response = await app.request('/api/premium/interviewer/slots', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      })

      expect(response.status).toBe(201)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.json()).resolves.toEqual({
        slot: {
          id: fixedSlotId,
          interviewerId: sessionUserId,
          interviewType: 'coding',
          startTime: validStartTime,
          endTime: validEndTime,
          status: 'available',
          createdAt: fixedNow,
          updatedAt: fixedNow,
        },
      })
    })

    it('returns 400 for a non-JSON body', async function run() {
      const app = createPremiumApp({ session: activeSession })

      const response = await app.request('/api/premium/interviewer/slots', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: '{bad-json',
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        error: 'Request body must be valid JSON.',
      })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 400 for an invalid interview type', async function run() {
      const app = createPremiumApp({ session: activeSession })

      const response = await app.request('/api/premium/interviewer/slots', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          interviewType: 'invalid_type',
          startTime: validStartTime,
        }),
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        error: 'Invalid request payload',
      })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 400 for a startTime inside the lead time', async function run() {
      const app = createPremiumApp({ session: activeSession })

      const response = await app.request('/api/premium/interviewer/slots', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          interviewType: 'coding',
          startTime: '2026-04-13T09:30:00.000Z',
        }),
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        error: 'startTime must be at least 60 minutes in the future.',
      })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 401 without an authenticated session', async function run() {
      const app = createPremiumApp({ session: null })

      const response = await app.request('/api/premium/interviewer/slots', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({
        error: 'You must be authenticated to access this resource.',
      })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 403 for a soft-deleted interviewer', async function run() {
      const app = createPremiumApp({
        session: activeSession,
        executorOptions: {
          userRow: { deleted_at: '2026-04-01T00:00:00.000Z', companies: true },
        },
      })

      const response = await app.request('/api/premium/interviewer/slots', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      })

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body).toEqual({ error: 'ACCOUNT_INACTIVE' })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 403 for a non-eligible interviewer', async function run() {
      const app = createPremiumApp({
        session: activeSession,
        executorOptions: {
          userRow: { deleted_at: null, companies: false },
        },
      })

      const response = await app.request('/api/premium/interviewer/slots', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      })

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body).toEqual({ error: 'Account is not eligible to publish premium availability slots.' })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 409 when the window overlaps an existing slot', async function run() {
      const app = createPremiumApp({
        session: activeSession,
        executorOptions: { overlap: true },
      })

      const response = await app.request('/api/premium/interviewer/slots', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      })

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body).toEqual({ error: 'The premium slot window conflicts with existing availability.' })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 409 when the window conflicts with an interview', async function run() {
      const app = createPremiumApp({
        session: activeSession,
        executorOptions: { interviewConflict: true },
      })

      const response = await app.request('/api/premium/interviewer/slots', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          interviewType: 'coding',
          startTime: validStartTime,
        }),
      })

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body).toEqual({ error: 'The premium slot window conflicts with an existing interview.' })
      expect(body).not.toHaveProperty('details')
    })
  })

  describe('GET /api/premium/interviewer/slots', function ownerListRouteSuite() {
    it('returns 200 with slots, pagination, policy, and no-store cache header', async function run() {
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
      const app = createPremiumApp({
        session: activeSession,
        executorOptions: { listRows: rows, count: 1 },
      })

      const response = await app.request('/api/premium/interviewer/slots')

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.json()).resolves.toEqual({
        slots: [
          {
            id: fixedSlotId,
            interviewerId: sessionUserId,
            interviewType: 'coding',
            startTime: validStartTime,
            endTime: validEndTime,
            status: 'available',
            createdAt: fixedNow,
            updatedAt: fixedNow,
          },
        ],
        pagination: { limit: 25, offset: 0, hasMore: false },
        policy: { leadTimeMinutes: 60, horizonDays: 90, priceCredits: 1 },
      })
    })

    it('applies the status filter query parameter', async function run() {
      const app = createPremiumApp({ session: activeSession })

      const response = await app.request('/api/premium/interviewer/slots?status=claimed&limit=5&offset=10')

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.pagination).toEqual({ limit: 5, offset: 10, hasMore: false })
    })

    it('returns 400 for an out-of-range limit', async function run() {
      const app = createPremiumApp({ session: activeSession })

      const response = await app.request('/api/premium/interviewer/slots?limit=0')

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        error: 'Invalid request payload',
      })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 400 for a non-numeric offset', async function run() {
      const app = createPremiumApp({ session: activeSession })

      const response = await app.request('/api/premium/interviewer/slots?offset=abc')

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        error: 'Invalid request payload',
      })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 401 without an authenticated session', async function run() {
      const app = createPremiumApp({ session: null })

      const response = await app.request('/api/premium/interviewer/slots')

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'You must be authenticated to access this resource.' })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 403 for an inactive account', async function run() {
      const app = createPremiumApp({
        session: activeSession,
        executorOptions: {
          userRow: { deleted_at: '2026-04-01T00:00:00.000Z', companies: true },
        },
      })

      const response = await app.request('/api/premium/interviewer/slots')

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body).toEqual({ error: 'ACCOUNT_INACTIVE' })
      expect(body).not.toHaveProperty('details')
    })
  })

  describe('DELETE /api/premium/interviewer/slots/:id', function cancelRouteSuite() {
    it('returns 400 for a malformed slot id', async function run() {
      const app = createPremiumApp({ session: activeSession })

      const response = await app.request('/api/premium/interviewer/slots/not-a-uuid', {
        method: 'DELETE',
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid slot id.' })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 200 with success and no-store cache header', async function run() {
      const app = createPremiumApp({
        session: activeSession,
        executorOptions: { cancelResult: 'updated' },
      })

      const response = await app.request(`/api/premium/interviewer/slots/${fixedSlotId}`, {
        method: 'DELETE',
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.json()).resolves.toEqual({ success: true })
    })

    it('returns 404 for an unknown slot', async function run() {
      const app = createPremiumApp({
        session: activeSession,
        executorOptions: { cancelResult: 'empty', existingSlot: 'none' },
      })

      const response = await app.request(`/api/premium/interviewer/slots/${fixedSlotId}`, {
        method: 'DELETE',
      })

      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body).toEqual({ error: 'Premium slot was not found for the active session.' })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 409 for a claimed slot', async function run() {
      const app = createPremiumApp({
        session: activeSession,
        executorOptions: { cancelResult: 'empty', existingSlot: 'claimed' },
      })

      const response = await app.request(`/api/premium/interviewer/slots/${fixedSlotId}`, {
        method: 'DELETE',
      })

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body).toEqual({ error: 'A claimed premium slot cannot be cancelled.' })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 401 without an authenticated session', async function run() {
      const app = createPremiumApp({ session: null })

      const response = await app.request(`/api/premium/interviewer/slots/${fixedSlotId}`, {
        method: 'DELETE',
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'You must be authenticated to access this resource.' })
      expect(body).not.toHaveProperty('details')
    })
  })
})

type MockExecutorOptions = {
  userRow?: { deleted_at: string | null; companies: boolean } | null
  overlap?: boolean
  interviewConflict?: boolean
  cancelResult?: 'updated' | 'empty'
  existingSlot?: 'claimed' | 'cancelled' | 'none'
  listRows?: PremiumInterviewerSlotRow[]
  count?: number
}

function createPremiumApp(options: {
  session: PremiumSession | null
  executorOptions?: MockExecutorOptions
}) {
  const app = new Hono<{ Bindings: TestBindings }>()
  const executorOptions = options.executorOptions ?? {}
  const service = new PremiumAvailabilityService(
    new PremiumAvailabilityRepository(),
    defaultPremiumPolicyConfig,
    createMockQueryExecutor(executorOptions),
    function createId() {
      return fixedSlotId
    },
    function now() {
      return fixedNow
    },
  )

  registerPremiumAvailabilityController(app, {
    createService: function createService() {
      return service
    },
    resolveSession: function resolveSession() {
      return options.session
    },
  })

  return app
}

function createMockQueryExecutor(options: MockExecutorOptions) {
  return {
    async query<Row>(queryInput: SqlQuery): Promise<{ rows: Row[] }> {
      const text = queryInput.text

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
              interviewer_id: sessionUserId,
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
}
