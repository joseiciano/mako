import {
  aiChatParamsSchema,
  aiChatRequestSchema,
  aiChatResponseSchema,
  cancelInterviewParamsSchema,
  cancelInterviewResponseSchema,
  createInterviewRequestSchema,
  createInterviewResponseSchema,
  endInterviewParamsSchema,
  interviewDetailResponseSchema,
  interviewLifecycleResponseSchema,
  interviewListQuerySchema,
  interviewListResponseSchema,
  provisionInterviewParamsSchema,
  provisionInterviewResponseSchema,
  recordingConsentRequestSchema,
  recordingConsentResponseSchema,
  screenshotUploadRequestSchema,
  screenshotUploadResponseSchema,
  startInterviewParamsSchema,
} from '@mako/shared'
import type { Context, Hono } from 'hono'
import { AiChatUnavailableError } from './ai-chat-repository'
import { AiChatProviderError } from './ai-gateway-responder'
import { ArtifactValidationError } from '../interview-assets'
import { InterviewService } from './interview-service'
import { RecordingConsentService } from './recording-consent-service'
import { ScreenshotService } from './screenshot-service'
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
  createScreenshotService?: (
    context: { bindings: Bindings },
  ) => ScreenshotService | undefined
  createConsentService?: (
    context: { bindings: Bindings },
  ) => RecordingConsentService | undefined
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

  app.post('/api/interviews/:id/start', async function postStartInterviewHandler(c) {
    const interviewService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const parsedParams = startInterviewParamsSchema.parse({
        id: c.req.param('id'),
      })
      const startResponse = await interviewService.startInterview(
        session,
        parsedParams,
      )

      return c.json(interviewLifecycleResponseSchema.parse(startResponse), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.post('/api/interviews/:id/end', async function postEndInterviewHandler(c) {
    const interviewService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const parsedParams = endInterviewParamsSchema.parse({
        id: c.req.param('id'),
      })
      const endResponse = await interviewService.endInterview(
        session,
        parsedParams,
      )

      return c.json(interviewLifecycleResponseSchema.parse(endResponse), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.post('/api/interviews/:id/ai-chat', async function postAiChatHandler(c) {
    const session = await options.resolveSession(c)
    const jsonBody = await readRequestBody(c)

    if (jsonBody === null) {
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    let parsedParams: { id: string }
    try {
      parsedParams = aiChatParamsSchema.parse({
        id: c.req.param('id'),
      })
    } catch (error) {
      return toErrorResponse(c, error)
    }

    let parsedBody: ReturnType<typeof aiChatRequestSchema.parse>
    try {
      parsedBody = aiChatRequestSchema.parse(jsonBody)
    } catch (error) {
      return toErrorResponse(c, error)
    }

    try {
      const interviewService = options.createService({ bindings: c.env })
      const result = await interviewService.aiChat(session, {
        interview_id: parsedParams.id,
        message: parsedBody.message,
        canvas_snapshot: parsedBody.canvas_snapshot,
        guidance_mode: parsedBody.guidance_mode,
        chat_history: parsedBody.chat_history,
      })

      return c.json(aiChatResponseSchema.parse(result), 200)
    } catch (error) {
      if (isZodError(error)) {
        return c.json({ error: 'Unexpected interview error.' }, 500)
      }

      if (error instanceof AiChatProviderError) {
        return c.json({ error: error.message }, 502)
      }

      if (error instanceof AiChatUnavailableError) {
        return c.json({ error: error.message }, 503)
      }

      return toErrorResponse(c, error)
    }
  })

  app.post('/api/interviews/:id/recording-consent', async function postRecordingConsentHandler(c) {
    const session = await options.resolveSession(c)
    const jsonBody = await readRequestBody(c)

    if (jsonBody === null) {
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    let parsedParams: { id: string }
    try {
      parsedParams = cancelInterviewParamsSchema.parse({
        id: c.req.param('id'),
      })
    } catch (error) {
      return toErrorResponse(c, error)
    }

    let parsedBody: ReturnType<typeof recordingConsentRequestSchema.parse>
    try {
      parsedBody = recordingConsentRequestSchema.parse(jsonBody)
    } catch (error) {
      return toErrorResponse(c, error)
    }

    try {
      const consentService = options.createConsentService?.({ bindings: c.env })

      if (!consentService) {
        return c.json({ error: 'Recording consent is not configured.' }, 503)
      }

      const consentResponse = await consentService.setConsent(session, {
        interview_id: parsedParams.id,
        decision: parsedBody.decision,
        consent_copy_version: parsedBody.consent_copy_version,
      })

      return c.json(recordingConsentResponseSchema.parse(consentResponse), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.delete('/api/interviews/:id/recording-consent', async function deleteRecordingConsentHandler(c) {
    const session = await options.resolveSession(c)

    let parsedParams: { id: string }
    try {
      parsedParams = cancelInterviewParamsSchema.parse({
        id: c.req.param('id'),
      })
    } catch (error) {
      return toErrorResponse(c, error)
    }

    try {
      const consentService = options.createConsentService?.({ bindings: c.env })

      if (!consentService) {
        return c.json({ error: 'Recording consent is not configured.' }, 503)
      }

      const consentResponse = await consentService.revokeConsent(session, {
        interview_id: parsedParams.id,
      })

      return c.json(recordingConsentResponseSchema.parse(consentResponse), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.post('/api/interviews/:id/artifacts/screenshots', async function postScreenshotHandler(c) {
    const screenshotService = options.createScreenshotService?.({ bindings: c.env })

    if (!screenshotService) {
      return c.json({ error: 'Screenshot uploads are not configured.' }, 503)
    }

    const session = await options.resolveSession(c)

    if (session === null) {
      return c.json(
        { error: 'You must be authenticated to access this resource.' },
        401,
      )
    }

    // Read the raw request body once so Hono can derive the JSON metadata from
    // the same bytes without a second body read.
    const body = await c.req.arrayBuffer()

    let jsonBody: unknown
    try {
      jsonBody = JSON.parse(new TextDecoder().decode(body))
    } catch {
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    try {
      const parsedParams = { id: c.req.param('id') }
      const parsedBody = screenshotUploadRequestSchema.parse(jsonBody)
      const result = await screenshotService.uploadScreenshot(session, {
        interview_id: parsedParams.id,
        idempotency_key: parsedBody.idempotency_key,
        content_type: parsedBody.content_type,
        capture_timestamp: parsedBody.capture_timestamp,
        body,
      })

      return c.json(screenshotUploadResponseSchema.parse(result), 200)
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
