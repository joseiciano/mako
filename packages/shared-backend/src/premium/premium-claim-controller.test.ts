import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerPremiumClaimController } from './premium-claim-controller'
import type { PremiumClaimService } from './premium-claim-service'
import type { PremiumSession } from './premium-errors'
import type { SqlQueryExecutor } from '../index'
import {
  PremiumConflictError,
  PremiumDataIntegrityError,
  PremiumForbiddenError,
  PremiumIdempotencyKeyConflictError,
  PremiumInsufficientCreditsError,
  PremiumInterviewerIneligibleError,
  PremiumNotFoundError,
  PremiumSchedulingConflictError,
  PremiumSelfClaimError,
  PremiumSlotAlreadyClaimedError,
  PremiumUnauthorizedError,
  PremiumValidationError,
} from './premium-errors'
import type { InterviewDetail } from '../interviews/types'

type TestBindings = Record<string, unknown>

const slotId = '11111111-1111-4111-8111-111111111111'
const schedulerId = '22222222-2222-4222-8222-222222222222'
const idempotencyKey = '66666666-6666-4666-8666-666666666666'

const activeSession: PremiumSession = {
  userId: schedulerId,
  email: 'scheduler@test.com',
}

const mockInterview: InterviewDetail = {
  id: '44444444-4444-4444-8444-444444444444',
  schedulerId,
  schedulerAlias: 'Candidate-Blue',
  interviewerId: '33333333-3333-4333-8333-333333333333',
  interviewerAlias: 'Interviewer-Red',
  type: 'system_design',
  mode: 'peer_to_peer',
  bookingChannel: 'verified_interviewer',
  tier: 'premium',
  status: 'scheduled',
  scheduledAt: '2026-08-07T22:00:00.000Z',
  realtimeSessionId: null,
  excalidrawRoomId: null,
  excalidrawKey: null,
  recordingUrl: null,
  screenshotUrls: null,
  feedback: null,
  recordingStatus: null,
  transcript: null,
  feedbackStatus: null,
  feedbackUnavailableReason: null,
  feedbackErrorCode: null,
  feedbackPromptVersion: null,
  feedbackGeneratedAt: null,
  startedAt: null,
  expiresAt: null,
  warningAt: null,
  createdAt: '2026-08-07T20:00:00.000Z',
  updatedAt: '2026-08-07T20:00:00.000Z',
} as unknown as InterviewDetail

function createClaimApp(options: {
  service?: PremiumClaimService
  session?: PremiumSession | null
} = {}) {
  const app = new Hono<{ Bindings: TestBindings }>()

  const mockExecutor: SqlQueryExecutor = {
    async query() {
      return { rows: [] }
    },
  }

  registerPremiumClaimController(app, {
    createService: function createService() {
      return (
        options.service ?? {
          claimSlot: vi.fn(async function claimSlot() {
            return { interview: mockInterview, replayed: false }
          }),
          getQueryExecutor: vi.fn(function getQueryExecutor() {
            return mockExecutor
          }),
        } as unknown as PremiumClaimService
      )
    },
    resolveSession: function resolveSession() {
      return options.session === undefined ? activeSession : options.session
    },
    createPersistOutboxEvent: function createPersistOutboxEvent() {
      return async function persistOutboxEvent() {}
    },
  })

  return app
}

function createFailingService(error: Error): PremiumClaimService {
  return {
    claimSlot: vi.fn(async function claimSlot() {
      throw error
    }),
    getQueryExecutor: vi.fn(function getQueryExecutor() {
      return { async query() { return { rows: [] } } } as SqlQueryExecutor
    }),
  } as unknown as PremiumClaimService
}

describe('PremiumClaimController', function suite() {
  describe('POST /api/premium/marketplace/slots/:id/claim', function claimRouteSuite() {
    it('returns 201 on a successful initial claim', async function run() {
      const app = createClaimApp()

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(201)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      const body = await response.json()
      expect(body.interview).toBeDefined()
    })

    it('returns 200 on a replayed claim', async function run() {
      const service: PremiumClaimService = {
        claimSlot: vi.fn(async function claimSlot() {
          return { interview: mockInterview, replayed: true }
        }),
        getQueryExecutor: vi.fn(),
      } as unknown as PremiumClaimService
      const app = createClaimApp({ service })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(200)
    })

    it('returns 401 without an authenticated session', async function run() {
      const app = createClaimApp({ session: null })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(401)
    })

    it('returns 400 when Idempotency-Key header is missing', async function run() {
      const app = createClaimApp()

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        { method: 'POST' },
      )

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Idempotency-Key header is required.' })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 400 when Idempotency-Key is not a valid UUID', async function run() {
      const app = createClaimApp()

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': 'not-a-uuid' },
        },
      )

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Idempotency-Key must be a valid UUID.' })
      expect(body).not.toHaveProperty('details')
    })

    it('returns 400 when route id is not a valid UUID and does not call service', async function run() {
      const service = {
        claimSlot: vi.fn(async function claimSlot() {
          return { interview: mockInterview, replayed: false }
        }),
        getQueryExecutor: vi.fn(function getQueryExecutor() {
          return { async query() { return { rows: [] } } } as SqlQueryExecutor
        }),
      } as unknown as PremiumClaimService

      const app = createClaimApp({ service })

      const response = await app.request(
        '/api/premium/marketplace/slots/not-a-uuid/claim',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid slot id.' })
      expect(body).not.toHaveProperty('details')
      expect(service.claimSlot).not.toHaveBeenCalled()
    })

    it('maps PremiumUnauthorizedError to 401', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumUnauthorizedError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumSelfClaimError to 403', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumSelfClaimError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumForbiddenError to 403', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumForbiddenError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumValidationError to 400', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumValidationError('Invalid input.')),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumNotFoundError to 404', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumNotFoundError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumIdempotencyKeyConflictError to 409', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumIdempotencyKeyConflictError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumSlotAlreadyClaimedError to 409', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumSlotAlreadyClaimedError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumInterviewerIneligibleError to 409', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumInterviewerIneligibleError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumSchedulingConflictError to 409 with PREMIUM_SCHEDULING_CONFLICT', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumSchedulingConflictError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body).toEqual({ error: 'PREMIUM_SCHEDULING_CONFLICT' })
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumInsufficientCreditsError to 409', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumInsufficientCreditsError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumConflictError to 409', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumConflictError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps PremiumDataIntegrityError to 500', async function run() {
      const app = createClaimApp({
        service: createFailingService(new PremiumDataIntegrityError()),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })

    it('maps unknown errors to 500', async function run() {
      const app = createClaimApp({
        service: createFailingService(new Error('Unexpected failure.')),
      })

      const response = await app.request(
        `/api/premium/marketplace/slots/${slotId}/claim`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).not.toHaveProperty('details')
    })
  })
})
