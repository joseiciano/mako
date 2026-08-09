import { z } from 'zod'
import { publishPremiumSlotInputSchema, premiumOwnerListQuerySchema } from '@mako/shared'
import { isZodError } from './premium-utils'
import type { Context, Hono } from 'hono'
import type { PremiumAvailabilityService } from './premium-availability-service'
import {
  PremiumConflictError,
  PremiumForbiddenError,
  PremiumNotFoundError,
  PremiumUnauthorizedError,
  PremiumValidationError,
  type PremiumSession,
} from './premium-errors'

type ControllerBindings = Record<string, unknown>

export type PremiumAvailabilityControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: { bindings: Bindings }) => PremiumAvailabilityService
  resolveSession: (
    context: Context<{ Bindings: Bindings }>,
  ) => Promise<PremiumSession | null> | PremiumSession | null
}

export function registerPremiumAvailabilityController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: PremiumAvailabilityControllerOptions<Bindings>,
): void {
  app.post('/api/premium/interviewer/slots', async function publishSlotHandler(c) {
    c.header('Cache-Control', 'private, no-store')
    const service = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    if (!session) {
      return c.json({ error: 'You must be authenticated to access this resource.' }, 401)
    }

    const jsonBody = await readRequestBody(c)

    if (jsonBody === null) {
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    const parsedBody = publishPremiumSlotInputSchema.safeParse(jsonBody)

    if (!parsedBody.success) {
      return c.json({ error: 'Invalid request payload' }, 400)
    }

    try {
      const result = await service.publishSlot(session, parsedBody.data)
      return c.json(result, 201)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.get('/api/premium/interviewer/slots', async function listSlotsHandler(c) {
    c.header('Cache-Control', 'private, no-store')
    const service = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    if (!session) {
      return c.json({ error: 'You must be authenticated to access this resource.' }, 401)
    }

    const query = readOwnerListQuery(c)
    const parsedQuery = premiumOwnerListQuerySchema.safeParse(query)

    if (!parsedQuery.success) {
      return c.json({ error: 'Invalid request payload' }, 400)
    }

    try {
      const result = await service.listSlots(session, parsedQuery.data)
      return c.json(result, 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.delete('/api/premium/interviewer/slots/:id', async function cancelSlotHandler(c) {
    c.header('Cache-Control', 'private, no-store')
    const service = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    if (!session) {
      return c.json({ error: 'You must be authenticated to access this resource.' }, 401)
    }

    const rawSlotId = c.req.param('id')
    const parsedSlotId = z.string().uuid().safeParse(rawSlotId)

    if (!parsedSlotId.success) {
      return c.json({ error: 'Invalid slot id.' }, 400)
    }

    try {
      const result = await service.cancelSlot(session, parsedSlotId.data)
      return c.json(result, 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })
}

function readOwnerListQuery<Bindings extends ControllerBindings>(
  context: Context<{ Bindings: Bindings }>,
): Record<string, string | undefined> {
  return {
    limit: context.req.query('limit'),
    offset: context.req.query('offset'),
    status: context.req.query('status'),
    interviewType: context.req.query('interviewType'),
  }
}

async function readRequestBody(context: Context): Promise<unknown | null> {
  try {
    return await context.req.json()
  } catch {
    return null
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

  if (error instanceof PremiumUnauthorizedError) {
    return context.json({ error: error.message }, 401)
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

  if (error instanceof PremiumConflictError) {
    return context.json({ error: error.message }, 409)
  }

  return context.json({ error: 'Unexpected premium availability error.' }, 500)
}
