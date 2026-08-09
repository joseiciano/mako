import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import {
  registerPremiumMarketplaceController,
  type RateLimiter,
} from './premium-marketplace-controller'
import type { PremiumMarketplaceResponse } from '@mako/shared'
import { PremiumMarketplaceRepository } from './premium-marketplace-repository'
import { PremiumMarketplaceService } from './premium-marketplace-service'
import { defaultPremiumPolicyConfig } from './premium-policy-config'
import type { SqlQuery } from '../index'

type TestBindings = Record<string, unknown>

const mockResponse: PremiumMarketplaceResponse = {
  slots: [
    {
      slotId: '11111111-1111-4111-8111-111111111111',
      interviewType: 'system_design',
      startTime: '2026-08-08T10:00:00.000Z',
      endTime: '2026-08-08T11:00:00.000Z',
      interviewer: {
        displayName: 'Jane Doe',
        image: null,
        isVerified: true,
      },
    },
  ],
  pagination: { limit: 25, offset: 0, hasMore: false },
  policy: { leadTimeMinutes: 60, horizonDays: 90, priceCredits: 1 },
}

function createMarketplaceApp(options: {
  service?: PremiumMarketplaceService
  rateLimiter?: RateLimiter
  rateLimiterFactory?: () => RateLimiter | undefined
  logger?: { info: (event: string, context: Record<string, unknown>) => void }
} = {}) {
  const app = new Hono<{ Bindings: TestBindings }>()

  registerPremiumMarketplaceController(app, {
    createService: function createService() {
      return options.service ?? createMockService()
    },
    rateLimiter: options.rateLimiterFactory
      ? options.rateLimiterFactory
      : options.rateLimiter
        ? function rateLimiterFactory() {
            return options.rateLimiter
          }
        : undefined,
    logger: options.logger,
  })

  return app
}

function createMockService(): PremiumMarketplaceService {
  return {
    listAvailableSlots: vi.fn(async function listAvailableSlots() {
      return mockResponse
    }),
  } as unknown as PremiumMarketplaceService
}

function createMockExecutor() {
  return {
    async query<Row>(queryInput: SqlQuery): Promise<{ rows: Row[]; rowCount?: number }> {
      const text = queryInput.text
      if (text.includes('COUNT(*)')) {
        return { rows: [{ count: '0' }] as Row[], rowCount: 1 }
      }
      return { rows: [] as Row[], rowCount: 0 }
    },
  }
}

describe('PremiumMarketplaceController', function suite() {
  it('returns 200 with slots and no-store cache header', async function run() {
    const app = createMarketplaceApp()

    const response = await app.request('/api/premium/marketplace')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body.slots).toHaveLength(1)
    expect(body.slots[0].interviewer.isVerified).toBe(true)
  })

  it('returns 200 with query parameters', async function run() {
    const service = createMockService()
    const app = createMarketplaceApp({ service })

    await app.request('/api/premium/marketplace?interviewType=system_design&limit=10&offset=5')

    expect(service.listAvailableSlots).toHaveBeenCalledWith({
      limit: '10',
      offset: '5',
      interviewType: 'system_design',
    })
  })

  it('returns 400 on invalid query parameters', async function run() {
    const executor = createMockExecutor()
    const service = new PremiumMarketplaceService(
      new PremiumMarketplaceRepository(),
      defaultPremiumPolicyConfig,
      executor,
    )
    const app = createMarketplaceApp({ service })

    const response = await app.request('/api/premium/marketplace?limit=abc')

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toEqual({ error: 'Invalid request payload' })
  })

  it('returns 429 when rate limit is exceeded and logs PII-safe event', async function run() {
    const logs: Array<{ event: string; context: Record<string, unknown> }> = []
    const logger = {
      info: function info(event: string, context: Record<string, unknown>) {
        logs.push({ event, context })
      },
    }
    const rateLimiter: RateLimiter = {
      limit: vi.fn(async function limit() {
        return { success: false }
      }),
    }
    const app = createMarketplaceApp({ rateLimiter, logger })

    const response = await app.request('/api/premium/marketplace', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    })

    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body).toEqual({ error: 'RATE_LIMITED' })
    expect(rateLimiter.limit).toHaveBeenCalledWith({
      key: 'premium:marketplace:1.2.3.4',
    })

    const log = logs.find(function findLog(l) {
      return l.event === 'premium.marketplace.rate_limited'
    })
    expect(log).toBeDefined()
    expect(log!.context).toHaveProperty('routeKey', 'premium:marketplace')
    expect(log!.context).toHaveProperty('outcome', 'rate_limited')
    expect(log!.context).toHaveProperty('locationHash')
    expect(typeof log!.context.locationHash).toBe('string')
    expect(JSON.stringify(log!.context)).not.toContain('1.2.3.4')
  })

  it('passes through when rate limit allows', async function run() {
    const rateLimiter: RateLimiter = {
      limit: vi.fn(async function limit() {
        return { success: true }
      }),
    }
    const app = createMarketplaceApp({ rateLimiter })

    const response = await app.request('/api/premium/marketplace')

    expect(response.status).toBe(200)
    expect(rateLimiter.limit).toHaveBeenCalledTimes(1)
  })

  it('uses unknown as key when CF-Connecting-IP is missing', async function run() {
    const rateLimiter: RateLimiter = {
      limit: vi.fn(async function limit() {
        return { success: true }
      }),
    }
    const app = createMarketplaceApp({ rateLimiter })

    await app.request('/api/premium/marketplace')

    expect(rateLimiter.limit).toHaveBeenCalledWith({
      key: 'premium:marketplace:unknown',
    })
  })

  it('passes through when rate limiter binding is missing', async function run() {
    const app = createMarketplaceApp({
      rateLimiterFactory: function missingBinding() {
        return undefined
      },
    })

    const response = await app.request('/api/premium/marketplace')

    expect(response.status).toBe(200)
  })

  it('passes through and logs PII-safe event when rate limiter throws', async function run() {
    const logs: Array<{ event: string; context: Record<string, unknown> }> = []
    const logger = {
      info: function info(event: string, context: Record<string, unknown>) {
        logs.push({ event, context })
      },
    }
    const rateLimiter: RateLimiter = {
      limit: vi.fn(async function limit() {
        throw new Error('binding rejected')
      }),
    }
    const app = createMarketplaceApp({ rateLimiter, logger })

    const response = await app.request('/api/premium/marketplace', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    })

    expect(response.status).toBe(200)
    const log = logs.find(function findLog(l) {
      return l.event === 'premium.marketplace.rate_limiter_fallback'
    })
    expect(log).toBeDefined()
    expect(log!.context).toHaveProperty('routeKey', 'premium:marketplace')
    expect(log!.context).toHaveProperty('outcome', 'binding_rejected')
    expect(log!.context).toHaveProperty('locationHash')
    expect(typeof log!.context.locationHash).toBe('string')
    expect(log!.context.locationHash).not.toContain('1.2.3.4')
    expect(JSON.stringify(log!.context)).not.toContain('1.2.3.4')
  })

  it('does not expose private fields in the response', async function run() {
    const app = createMarketplaceApp()

    const response = await app.request('/api/premium/marketplace')
    const body = await response.json()
    const slot = body.slots[0]

    expect(slot).not.toHaveProperty('interviewer_id')
    expect(slot).not.toHaveProperty('scheduler_id')
    expect(slot).not.toHaveProperty('email')
    expect(slot).not.toHaveProperty('application')
    expect(slot).not.toHaveProperty('employment')
    expect(slot).not.toHaveProperty('reviewer')
    expect(slot).not.toHaveProperty('company')
    expect(slot).not.toHaveProperty('role')
    expect(slot.interviewer).not.toHaveProperty('email')
    expect(slot.interviewer).not.toHaveProperty('id')
  })

  it('returns 404 for GET /api/premium/marketplace/slots', async function run() {
    const app = createMarketplaceApp()

    const response = await app.request('/api/premium/marketplace/slots')

    expect(response.status).toBe(404)
  })

  it('never logs raw CF-Connecting-IP in any rate limiter outcome', async function run() {
    const logs: Array<{ event: string; context: Record<string, unknown> }> = []
    const logger = {
      info: function info(event: string, context: Record<string, unknown>) {
        logs.push({ event, context })
      },
    }

    const rateLimiter1: RateLimiter = {
      limit: vi.fn(async function limit() {
        return { success: false }
      }),
    }
    const app1 = createMarketplaceApp({ rateLimiter: rateLimiter1, logger })
    await app1.request('/api/premium/marketplace', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    })

    const rateLimiter2: RateLimiter = {
      limit: vi.fn(async function limit() {
        throw new Error('binding rejected')
      }),
    }
    const app2 = createMarketplaceApp({ rateLimiter: rateLimiter2, logger })
    await app2.request('/api/premium/marketplace', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    })

    for (const log of logs) {
      expect(JSON.stringify(log.context)).not.toContain('1.2.3.4')
    }
  })

  it('emits a deterministic location hash that includes outcome in the rate limiter fallback log', async function run() {
    const logs: Array<{ event: string; context: Record<string, unknown> }> = []
    const logger = {
      info: function info(event: string, context: Record<string, unknown>) {
        logs.push({ event, context })
      },
    }
    const rateLimiter: RateLimiter = {
      limit: vi.fn(async function limit() {
        throw new Error('binding rejected')
      }),
    }
    const app = createMarketplaceApp({ rateLimiter, logger })

    await app.request('/api/premium/marketplace')
    await app.request('/api/premium/marketplace')

    const matchingLogs = logs.filter(function findLog(l) {
      return l.event === 'premium.marketplace.rate_limiter_fallback'
    })
    expect(matchingLogs).toHaveLength(2)
    const firstHash = matchingLogs[0]!.context.locationHash
    const secondHash = matchingLogs[1]!.context.locationHash
    expect(firstHash).toBe(secondHash)
    expect(typeof firstHash).toBe('string')
    expect((firstHash as string).length).toBeGreaterThan(0)
    expect(JSON.stringify(matchingLogs[0]!.context)).not.toContain('1.2.3.4')
  })
})
