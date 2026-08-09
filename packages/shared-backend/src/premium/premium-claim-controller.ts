import { z } from 'zod'
import { isZodError } from './premium-utils'
import type { Context, Hono } from 'hono'
import type { SqlQueryExecutor } from '../index'
import type { PremiumClaimService } from './premium-claim-service'
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
  type PremiumSession,
} from './premium-errors'

type ControllerBindings = Record<string, unknown>

export type PremiumClaimControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: { bindings: Bindings }) => PremiumClaimService
  resolveSession: (
    context: Context<{ Bindings: Bindings }>,
  ) => Promise<PremiumSession | null> | PremiumSession | null
  createPersistOutboxEvent: (context: { bindings: Bindings }, queryExecutor: SqlQueryExecutor) => (event: unknown) => Promise<void>
}

const idempotencyKeySchema = z.string().uuid()
const slotIdSchema = z.string().uuid()

export function registerPremiumClaimController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: PremiumClaimControllerOptions<Bindings>,
): void {
  app.post('/api/premium/marketplace/slots/:id/claim', async function claimSlotHandler(c) {
    c.header('Cache-Control', 'private, no-store')
    const service = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    if (!session) {
      return c.json({ error: 'You must be authenticated to access this resource.' }, 401)
    }

    const rawSlotId = c.req.param('id')
    const parsedSlotId = slotIdSchema.safeParse(rawSlotId)
    if (!parsedSlotId.success) {
      return c.json({ error: 'Invalid slot id.' }, 400)
    }

    const idempotencyKey = c.req.header('Idempotency-Key')

    if (!idempotencyKey) {
      return c.json({ error: 'Idempotency-Key header is required.' }, 400)
    }

    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey)

    if (!parsedKey.success) {
      return c.json({ error: 'Idempotency-Key must be a valid UUID.' }, 400)
    }

    try {
      const persistOutboxEvent = options.createPersistOutboxEvent({ bindings: c.env }, service.getQueryExecutor())
      const result = await service.claimSlot({
        session,
        slotId: parsedSlotId.data,
        idempotencyKey: parsedKey.data,
        persistOutboxEvent,
      })

      return c.json({ interview: result.interview }, result.replayed ? 200 : 201)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })
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

  if (error instanceof PremiumUnauthorizedError) {
    return context.json({ error: error.message }, 401)
  }

  if (error instanceof PremiumSelfClaimError) {
    return context.json({ error: error.message }, 403)
  }

  if (error instanceof PremiumForbiddenError) {
    return context.json({ error: error.message }, 403)
  }

  if (error instanceof PremiumValidationError) {
    return context.json({ error: error.message }, 400)
  }

  if (error instanceof PremiumNotFoundError) {
    return context.json({ error: error.message }, 404)
  }

  if (error instanceof PremiumIdempotencyKeyConflictError) {
    return context.json({ error: error.message }, 409)
  }

  if (error instanceof PremiumSlotAlreadyClaimedError) {
    return context.json({ error: error.message }, 409)
  }

  if (error instanceof PremiumInterviewerIneligibleError) {
    return context.json({ error: error.message }, 409)
  }

  if (error instanceof PremiumSchedulingConflictError) {
    return context.json({ error: error.message }, 409)
  }

  if (error instanceof PremiumInsufficientCreditsError) {
    return context.json({ error: error.message }, 409)
  }

  if (error instanceof PremiumConflictError) {
    return context.json({ error: error.message }, 409)
  }

  if (error instanceof PremiumDataIntegrityError) {
    return context.json({ error: error.message }, 500)
  }

  return context.json({ error: 'Unexpected premium claim error.' }, 500)
}
