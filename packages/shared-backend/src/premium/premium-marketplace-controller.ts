import { isZodError } from './premium-utils'
import type { Context, Hono } from 'hono'
import type { PremiumMarketplaceService } from './premium-marketplace-service'

type ControllerBindings = Record<string, unknown>

export type RateLimiter = {
  limit(input: { key: string }): Promise<{ success: boolean }>
}

export type PremiumMarketplaceLogger = {
  info(event: string, context: Record<string, unknown>): void
}

export type PremiumMarketplaceControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: { bindings: Bindings }) => PremiumMarketplaceService
  rateLimiter?: (context: { bindings: Bindings }) => RateLimiter | undefined
  resolveClientIp?: (context: { bindings: Bindings }) => string | null
  logger?: PremiumMarketplaceLogger
}

export function registerPremiumMarketplaceController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: PremiumMarketplaceControllerOptions<Bindings>,
): void {
  app.get('/api/premium/marketplace', async function listMarketplaceSlotsHandler(c) {
    c.header('Cache-Control', 'no-store')

    if (options.rateLimiter) {
      const limiter = options.rateLimiter({ bindings: c.env })
      if (limiter) {
        const clientIp = options.resolveClientIp
          ? options.resolveClientIp({ bindings: c.env })
          : c.req.header('CF-Connecting-IP')
        const rateLimitKey = `premium:marketplace:${clientIp ?? 'unknown'}`
        try {
          const { success } = await limiter.limit({ key: rateLimitKey })
          if (!success) {
            await emitRateLimiterRejectionLog(options.logger, 'premium:marketplace', clientIp)
            return c.json({ error: 'RATE_LIMITED' }, 429)
          }
        } catch {
          await emitRateLimiterFallbackLog(options.logger, 'premium:marketplace', clientIp)
        }
      }
    }

    const service = options.createService({ bindings: c.env })

    const query = readMarketplaceListQuery(c)

    try {
      const result = await service.listAvailableSlots(query)
      return c.json(result, 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })
}

function readMarketplaceListQuery<Bindings extends ControllerBindings>(
  context: Context<{ Bindings: Bindings }>,
): Record<string, string | undefined> {
  return {
    limit: context.req.query('limit'),
    offset: context.req.query('offset'),
    interviewType: context.req.query('interviewType'),
  }
}

function toErrorResponse(context: Context, error: unknown) {
  if (isZodError(error)) {
    return context.json(
      {
        error: 'Invalid request payload',
      },
      400,
    )
  }

  return context.json({ error: 'Unexpected marketplace error.' }, 500)
}

async function emitRateLimiterRejectionLog(
  logger: PremiumMarketplaceLogger | undefined,
  routeKey: string,
  clientIp: string | null | undefined,
): Promise<void> {
  const outcome = 'rate_limited'
  const locationHash = await deriveLocationHash('premium-marketplace-controller', routeKey, outcome, clientIp)
  const safeContext = {
    routeKey,
    outcome,
    locationHash,
  }
  if (logger) {
    logger.info('premium.marketplace.rate_limited', safeContext)
  } else {
    console.info({ event: 'premium.marketplace.rate_limited', ...safeContext })
  }
}

async function emitRateLimiterFallbackLog(
  logger: PremiumMarketplaceLogger | undefined,
  routeKey: string,
  clientIp: string | null | undefined,
): Promise<void> {
  const outcome = 'binding_rejected'
  const locationHash = await deriveLocationHash('premium-marketplace-controller', routeKey, outcome, clientIp)
  const safeContext = {
    routeKey,
    outcome,
    locationHash,
  }
  if (logger) {
    logger.info('premium.marketplace.rate_limiter_fallback', safeContext)
  } else {
    console.info({ event: 'premium.marketplace.rate_limiter_fallback', ...safeContext })
  }
}

async function deriveLocationHash(
  sourceLocation: string,
  routeKey: string,
  outcome: string,
  clientIp: string | null | undefined,
): Promise<string> {
  const ip = clientIp ?? 'unknown'
  const data = `${sourceLocation}:${routeKey}:${outcome}:${ip}`
  const encoder = new TextEncoder()
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  const array = Array.from(new Uint8Array(buffer))
  return array.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}
