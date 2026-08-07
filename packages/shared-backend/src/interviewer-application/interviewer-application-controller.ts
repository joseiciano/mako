import type { Context, Hono } from 'hono'
import { ZodError } from 'zod'
import { InterviewerApplicationService } from './interviewer-application-service'
import {
  InterviewerApplicationConflictError,
  InterviewerApplicationForbiddenError,
  InterviewerApplicationUnauthorizedError,
  InterviewerApplicationValidationError,
  type InterviewerApplicationSession,
} from './types'

type ControllerBindings = Record<string, unknown>

export type InterviewerApplicationControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: { bindings: Bindings }) => InterviewerApplicationService
  resolveSession: (
    context: Context<{ Bindings: Bindings }>,
  ) => Promise<InterviewerApplicationSession | null> | InterviewerApplicationSession | null
}

export function registerInterviewerApplicationController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: InterviewerApplicationControllerOptions<Bindings>,
): void {
  app.post('/api/interviewer/apply', async function applyHandler(c) {
    const service = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)
    const jsonBody = await readRequestBody(c)

    if (jsonBody === null) {
      c.header('Cache-Control', 'private, no-store')
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    try {
      const application = await service.submitApplication(session, jsonBody)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ application }, 201)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.get('/api/interviewer/status', async function statusHandler(c) {
    const service = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const application = await service.getApplicationStatus(session)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ application }, 200)
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
  context.header('Cache-Control', 'private, no-store')

  if (isZodError(error)) {
    return context.json(
      {
        error: 'Invalid request payload',
        details: error.issues,
      },
      400,
    )
  }

  if (error instanceof InterviewerApplicationUnauthorizedError) {
    return context.json({ error: error.message }, 401)
  }

  if (error instanceof InterviewerApplicationForbiddenError) {
    return context.json({ error: error.message }, 403)
  }

  if (error instanceof InterviewerApplicationValidationError) {
    return context.json({ error: error.message }, 400)
  }

  if (error instanceof InterviewerApplicationConflictError) {
    return context.json({ error: error.message }, 409)
  }

  return context.json({ error: 'Unexpected interviewer application error.' }, 500)
}

function isZodError(error: unknown): error is { issues: unknown[] } {
  // @mako/shared resolves a different zod copy (v4) than this package (v3),
  // so instanceof checks fail for errors thrown by shared schemas.
  return (
    error instanceof ZodError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'ZodError')
  )
}
