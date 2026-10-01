import {
  aiChatParamsSchema,
  aiChatRequestSchema,
  aiChatResponseSchema,
  artifactAvailabilityResponseSchema,
  cancelInterviewParamsSchema,
  cancelInterviewResponseSchema,
  createInterviewRequestSchema,
  createInterviewResponseSchema,
  endInterviewParamsSchema,
  interviewDetailResponseSchema,
  interviewFeedbackStatusResponseSchema,
  interviewLifecycleResponseSchema,
  interviewListQuerySchema,
  interviewListResponseSchema,
  interviewIdParamsSchema,
  provisionInterviewParamsSchema,
  provisionInterviewResponseSchema,
  recordingConsentRequestSchema,
  recordingConsentResponseSchema,
  screenshotUploadResponseSchema,
  startInterviewParamsSchema,
} from '@mako/shared'
import { z } from 'zod'
import type { Context, Hono } from 'hono'
import { AiChatUnavailableError } from './ai-chat-repository'
import { AiChatProviderError } from './ai-gateway-responder'
import {
  ArtifactReadService,
  ArtifactRangeNotSatisfiable,
  type ArtifactStreamResult,
} from './artifact-read-service'
import {
  ArtifactValidationError,
  DEFAULT_ARTIFACT_STORAGE_CONFIG,
} from '../interview-assets'
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
  createArtifactReadService?: (
    context: { bindings: Bindings },
  ) => ArtifactReadService | undefined
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

  app.get('/api/interviews/:id/feedback-status', async function getInterviewFeedbackStatusHandler(c) {
    const interviewService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const parsedParams = interviewIdParamsSchema.parse({
        id: c.req.param('id'),
      })
      const feedbackStatus = await interviewService.getFeedbackStatus(session, {
        id: parsedParams.id,
      })

      return c.json(interviewFeedbackStatusResponseSchema.parse(feedbackStatus), 200)
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

    if (session === null) {
      return c.json(
        { error: 'You must be authenticated to access this resource.' },
        401,
      )
    }

    const jsonBody = await readRequestBody(c)

    if (jsonBody === null) {
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    let parsedParams: { id: string }
    try {
      parsedParams = interviewIdParamsSchema.parse({
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
      parsedParams = interviewIdParamsSchema.parse({
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
    const session = await options.resolveSession(c)

    if (session === null) {
      return c.json(
        { error: 'You must be authenticated to access this resource.' },
        401,
      )
    }

    const screenshotService = options.createScreenshotService?.({ bindings: c.env })

    if (!screenshotService) {
      return c.json({ error: 'Screenshot uploads are not configured.' }, 503)
    }

    const contentLength = parseContentLength(c.req.header('content-length'))
    if (contentLength !== null && contentLength > MAX_SCREENSHOT_REQUEST_BYTES) {
      return c.json({ error: 'Request body exceeds maximum allowed size.' }, 413)
    }

    const contentType = c.req.header('content-type')
    if (contentType !== 'image/png') {
      return c.json({ error: 'Content-Type must be image/png.' }, 415)
    }

    const body = await c.req.arrayBuffer()

    if (body.byteLength > MAX_SCREENSHOT_REQUEST_BYTES) {
      return c.json({ error: 'Request body exceeds maximum allowed size.' }, 413)
    }

    try {
      const parsedParams = interviewIdParamsSchema.parse({
        id: c.req.param('id'),
      })

      const idempotencyKey = c.req.header('x-idempotency-key')
      const captureTimestamp = c.req.header('x-capture-timestamp')

      if (!idempotencyKey) {
        return c.json({ error: 'X-Idempotency-Key header is required.' }, 400)
      }

      if (!captureTimestamp) {
        return c.json({ error: 'X-Capture-Timestamp header is required.' }, 400)
      }

      const parsedIdempotencyKey = z.string().uuid().parse(idempotencyKey)
      const parsedCaptureTimestamp = z.string().datetime({ offset: true }).parse(captureTimestamp)

      if (!isPngSignature(body)) {
        throw new ArtifactValidationError('Screenshot data must be a valid PNG image.')
      }

      const result = await screenshotService.uploadScreenshot(session, {
        interview_id: parsedParams.id,
        idempotency_key: parsedIdempotencyKey,
        content_type: 'image/png',
        capture_timestamp: parsedCaptureTimestamp,
        body,
      })

      return c.json(screenshotUploadResponseSchema.parse(result), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })
  app.get('/api/interviews/:id/artifacts/recording', async function getRecordingHandler(c) {
    const session = await options.resolveSession(c)

    if (session === null) {
      return c.json(
        { error: 'You must be authenticated to access this resource.' },
        401,
      )
    }

    const artifactReadService = options.createArtifactReadService?.({ bindings: c.env })

    if (!artifactReadService) {
      return c.json({ error: 'Artifact reads are not configured.' }, 503)
    }

    try {
      const parsedParams = interviewIdParamsSchema.parse({
        id: c.req.param('id'),
      })

      return toArtifactResponse(
        c,
        await artifactReadService.streamRecording(session, parsedParams.id, {
          rangeHeader: c.req.header('range'),
          ifNoneMatch: c.req.header('if-none-match'),
          ifRange: c.req.header('if-range'),
        }),
      )
    } catch (error) {
      return toArtifactErrorResponse(c, error)
    }
  })

  app.get('/api/interviews/:id/artifacts/screenshots/:captureId', async function getScreenshotHandler(c) {
    const session = await options.resolveSession(c)

    if (session === null) {
      return c.json(
        { error: 'You must be authenticated to access this resource.' },
        401,
      )
    }

    const artifactReadService = options.createArtifactReadService?.({ bindings: c.env })

    if (!artifactReadService) {
      return c.json({ error: 'Artifact reads are not configured.' }, 503)
    }

    let parsedParams: { id: string }
    try {
      parsedParams = interviewIdParamsSchema.parse({
        id: c.req.param('id'),
      })
    } catch (error) {
      return toErrorResponse(c, error)
    }

    let captureId: string
    try {
      captureId = z.string().uuid().parse(c.req.param('captureId'))
    } catch (error) {
      return toErrorResponse(c, error)
    }

    try {
      return toArtifactResponse(
        c,
        await artifactReadService.streamScreenshot(session, parsedParams.id, captureId, {
          rangeHeader: c.req.header('range'),
          ifNoneMatch: c.req.header('if-none-match'),
          ifRange: c.req.header('if-range'),
        }),
      )
    } catch (error) {
      return toArtifactErrorResponse(c, error)
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

  if (error instanceof ArtifactValidationError) {
    return context.json({ error: error.message }, 400)
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

const ARTIFACT_FILE_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'image/png': 'png',
}

function artifactFilename(contentType: string): string {
  const extension = ARTIFACT_FILE_EXTENSIONS[contentType] ?? 'bin'
  return `artifact.${extension}`
}

function toArtifactResponse(
  context: Context,
  result: ArtifactStreamResult,
) {
  if (result.outcome === 'unavailable') {
    return context.json(
      artifactAvailabilityResponseSchema.parse({ availability: result.availability }),
      409,
    )
  }

  if (result.outcome === 'not_modified') {
    return new Response(null, {
      status: 304,
      headers: result.etag === null ? undefined : { etag: result.etag },
    })
  }

  const headers = new Headers()
  headers.set('content-type', result.contentType)
  headers.set('content-length', String(result.contentLength))
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'private, no-store')
  headers.set('x-content-type-options', 'nosniff')
  headers.set(
    'content-disposition',
    `inline; filename="${artifactFilename(result.contentType)}"`,
  )

  if (result.etag !== null) {
    headers.set('etag', result.etag)
  }

  if (result.contentRange !== null) {
    headers.set('content-range', result.contentRange)
  }

  return new Response(result.body, { status: result.status, headers })
}

function toArtifactErrorResponse(context: Context, error: unknown) {
  if (error instanceof ArtifactRangeNotSatisfiable) {
    return new Response(null, {
      status: 416,
      headers: { 'content-range': error.contentRange },
    })
  }

  return toErrorResponse(context, error)
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

const MAX_SCREENSHOT_REQUEST_BYTES = DEFAULT_ARTIFACT_STORAGE_CONFIG.maxScreenshotBytes

const PNG_MAGIC_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

function isPngSignature(data: ArrayBuffer): boolean {
  if (data.byteLength < 8) {
    return false
  }

  const view = new Uint8Array(data, 0, 8)
  for (let i = 0; i < 8; i += 1) {
    if (view[i] !== PNG_MAGIC_BYTES[i]) {
      return false
    }
  }

  return true
}

function parseContentLength(header: string | undefined): number | null {
  if (header === undefined) {
    return null
  }

  const value = Number(header)

  if (!Number.isFinite(value) || value < 0) {
    return null
  }

  return value
}
