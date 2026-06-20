import {
  cancelInterviewParamsSchema,
  cancelInterviewResponseSchema,
  createInterviewRequestSchema,
  createInterviewResponseSchema,
  interviewDetailResponseSchema,
  interviewListQuerySchema,
  interviewListResponseSchema,
  provisionInterviewParamsSchema,
  provisionInterviewResponseSchema,
} from '@mako/shared'
import type { Context, Hono } from 'hono'
import { InterviewService } from './interview-service'
import {
  InterviewBusinessRuleError,
  InterviewConflictError,
  InterviewNotFoundError,
  InterviewUnauthorizedError,
  InterviewValidationError,
  type InterviewSession,
} from './types'

type ControllerBindings = Record<string, unknown>

export type InterviewControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: { bindings: Bindings }) => InterviewService
  resolveSession: (
    context: Context<{ Bindings: Bindings }>,
  ) => Promise<InterviewSession | null> | InterviewSession | null
}

export function registerInterviewController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: InterviewControllerOptions<Bindings>,
): void {
  app.post('/api/interviews', async function postInterviewHandler(c) {
    const interviewService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)
    const jsonBody = await readRequestBody(c)

    if (jsonBody === null) {
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    try {
      assertNoUnsupportedDirectCreateFields(jsonBody)
      const parsedBody = createInterviewRequestSchema.parse(jsonBody)
      const createdInterview = await interviewService.createInterview(
        session,
        parsedBody,
      )

      return c.json(createInterviewResponseSchema.parse(createdInterview), 201)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.get('/api/interviews', async function getInterviewsHandler(c) {
    const interviewService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const parsedQuery = interviewListQuerySchema.parse(
        Object.fromEntries(new URL(c.req.url).searchParams.entries()),
      )
      const interviews = await interviewService.listInterviews(session, parsedQuery)

      return c.json(interviewListResponseSchema.parse(interviews), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.get('/api/interviews/:id', async function getInterviewHandler(c) {
    const interviewService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const interview = await interviewService.getInterview(session, {
        id: c.req.param('id'),
      })

      return c.json(interviewDetailResponseSchema.parse(interview), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.post('/api/interviews/:id/provision', async function postProvisionInterviewHandler(c) {
    const interviewService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const parsedParams = provisionInterviewParamsSchema.parse({
        id: c.req.param('id'),
      })
      const provisionResponse = await interviewService.provisionInterview(
        session,
        parsedParams,
      )

      return c.json(provisionInterviewResponseSchema.parse(provisionResponse), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.post('/api/interviews/:id/cancel', async function postCancelInterviewHandler(c) {
    const interviewService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const parsedParams = cancelInterviewParamsSchema.parse({
        id: c.req.param('id'),
      })
      const cancelResponse = await interviewService.cancelInterview(
        session,
        parsedParams,
      )

      return c.json(cancelInterviewResponseSchema.parse(cancelResponse), 200)
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

  if (error instanceof InterviewUnauthorizedError) {
    return context.json({ error: error.message }, 401)
  }

  if (error instanceof InterviewNotFoundError) {
    return context.json({ error: error.message }, 404)
  }

  if (error instanceof InterviewValidationError) {
    return context.json({ error: error.message }, 400)
  }

  if (error instanceof InterviewBusinessRuleError) {
    return context.json({ error: error.message }, 422)
  }

  if (error instanceof InterviewConflictError) {
    return context.json({ error: error.message }, 409)
  }

  return context.json({ error: 'Unexpected interview error.' }, 500)
}

function isZodError(error: unknown): error is { issues: unknown[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray(error.issues)
  )
}

function assertNoUnsupportedDirectCreateFields(input: unknown): void {
  if (!isRecord(input)) {
    return
  }

  if (Object.hasOwn(input, 'tier')) {
    throw new InterviewValidationError(
      '`tier` is resolved server-side and must not be provided.',
    )
  }

  if (Object.hasOwn(input, 'interviewer_id')) {
    throw new InterviewValidationError(
      '`interviewer_id` is not supported for direct interview creation.',
    )
  }

  if (input.mode === 'peer_to_peer') {
    throw new InterviewBusinessRuleError(
      'Direct peer-to-peer interview creation is not supported. Use the availability matcher flow.',
    )
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}
