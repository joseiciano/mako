import {
  createAvailabilityRequestSchema,
  createAvailabilityResponseSchema,
} from '@mako/shared'
import type { Context, Hono } from 'hono'
import { AvailabilityService } from './availability-service'
import {
  AvailabilityBusinessRuleError,
  AvailabilityUnauthorizedError,
  type AvailabilitySession,
} from './types'

type ControllerBindings = Record<string, unknown>

export type AvailabilityControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: { bindings: Bindings }) => AvailabilityService
  resolveSession: (
    context: Context<{ Bindings: Bindings }>,
  ) => Promise<AvailabilitySession | null> | AvailabilitySession | null
}

export function registerAvailabilityController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: AvailabilityControllerOptions<Bindings>,
): void {
  app.post('/api/availability', async function postAvailabilityHandler(c) {
    const availabilityService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    if (!session) {
      return c.json({ error: 'You must be authenticated to access this resource.' }, 401)
    }

    const jsonBody = await readRequestBody(c)

    if (jsonBody === null) {
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    try {
      const parsedBody = createAvailabilityRequestSchema.parse(jsonBody)
      const createdAvailability = await availabilityService.createAvailability(session, parsedBody)

      return c.json(createAvailabilityResponseSchema.parse(createdAvailability), 201)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })
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
        details: error.issues,
      },
      400,
    )
  }

  if (error instanceof AvailabilityUnauthorizedError) {
    return context.json({ error: error.message }, 401)
  }

  if (error instanceof AvailabilityBusinessRuleError) {
    return context.json({ error: error.message }, 422)
  }

  return context.json({ error: 'Unexpected availability error.' }, 500)
}

function isZodError(error: unknown): error is { issues: unknown[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ZodError' &&
    'issues' in error &&
    Array.isArray(error.issues)
  )
}
