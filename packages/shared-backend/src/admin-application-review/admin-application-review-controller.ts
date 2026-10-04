import type { Context, Hono, MiddlewareHandler } from 'hono'
import { getAuthUserFromContext } from '../auth/auth-middleware'
import { AdminApplicationReviewService } from './admin-application-review-service'
import {
  AdminReviewConflictError,
  AdminReviewForbiddenError,
  AdminReviewNotFoundError,
} from './types'

type ControllerBindings = Record<string, unknown>

export type AdminApplicationReviewControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: { bindings: Bindings }) => AdminApplicationReviewService
  /** Admin guard (`requireAdmin`). Applied to every route registered here. */
  guard: MiddlewareHandler
}

export function registerAdminApplicationReviewController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: AdminApplicationReviewControllerOptions<Bindings>,
): void {
  // Every admin response (including guard and error responses) is private and uncacheable.
  app.use('/api/admin/*', async function noStoreMiddleware(c, next) {
    await next()
    c.header('Cache-Control', 'private, no-store')
  })

  app.get('/api/admin/applications', options.guard, async function listHandler(c) {
    try {
      const service = options.createService({ bindings: c.env as Bindings })
      return c.json(await service.listApplications(c.req.query()), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.get('/api/admin/applications/:id', options.guard, async function detailHandler(c) {
    try {
      const service = options.createService({ bindings: c.env as Bindings })
      return c.json(await service.getApplication(c.req.param('id')), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.patch('/api/admin/applications/:id', options.guard, async function decideHandler(c) {
    const admin = getAuthUserFromContext(c)

    if (!admin) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const body = await readJsonBody(c)

    try {
      const service = options.createService({ bindings: c.env as Bindings })
      const response = await service.decide({ userId: admin.id }, c.req.param('id'), body)
      return c.json(response, 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })
}

// An unparseable body is passed on as `undefined` so the shared schema rejects it with 400.
async function readJsonBody(context: Context): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    return undefined
  }
}

function toErrorResponse(context: Context, error: unknown) {
  if (isZodError(error)) {
    return context.json({ error: 'Invalid request', details: error.issues }, 400)
  }

  if (error instanceof AdminReviewNotFoundError) {
    return context.json({ error: error.message }, 404)
  }

  if (error instanceof AdminReviewForbiddenError) {
    return context.json({ error: error.message }, 403)
  }

  if (error instanceof AdminReviewConflictError) {
    return context.json({ error: error.message }, 409)
  }

  // Unavailability (503) vs programming errors (500) is classified by the app error handler.
  throw error
}

function isZodError(error: unknown): error is { issues: unknown[] } {
  // @mako/shared resolves a different zod copy (v4) than this package (v3),
  // so instanceof checks fail for errors thrown by shared schemas.
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'ZodError'
  )
}
