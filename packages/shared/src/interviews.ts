import { z } from 'zod'

export const interviewTypeSchema = z.enum([
  'system_design',
  'coding',
  'behavioral',
])

export const interviewModeSchema = z.enum(['peer_to_peer', 'ai_led'])

export const interviewTierSchema = z.enum(['standard', 'premium'])

export const interviewStatusSchema = z.enum([
  'scheduled',
  'ongoing',
  'completed',
  'cancelled',
])

export const interviewScheduledAtSchema = z.string().datetime({ offset: true })

export const defaultInterviewListLimit = 50

export const maxInterviewListLimit = 100

export const interviewCreateScheduledAtSchema = z.union([
  z.literal('now'),
  interviewScheduledAtSchema,
])

type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(function createJsonValueSchema() {
  return z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
})

export const interviewSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  scheduler_alias: z.string().min(1),
  interviewer_id: z.string().uuid().nullable(),
  interviewer_alias: z.string().min(1),
  type: interviewTypeSchema,
  mode: interviewModeSchema,
  tier: interviewTierSchema,
  status: interviewStatusSchema,
  scheduled_at: interviewScheduledAtSchema,
  realtime_session_id: z.string().nullable(),
  excalidraw_room_id: z.string().nullable(),
  excalidraw_key: z.string().nullable(),
  recording_url: z.string().nullable(),
  screenshot_urls: z.array(z.string()).nullable(),
  feedback: z.record(z.string(), jsonValueSchema).nullable(),
  started_at: z.string().datetime({ offset: true }).nullable(),
  expires_at: z.string().datetime({ offset: true }).nullable(),
  warning_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
})

export const interviewListItemSchema = interviewSchema.omit({
  realtime_session_id: true,
  excalidraw_room_id: true,
  excalidraw_key: true,
  recording_url: true,
  screenshot_urls: true,
  feedback: true,
  started_at: true,
  expires_at: true,
  warning_at: true,
})

// ============================================================================
// Processing State Schemas (referenced by interviewDetailSchema)
// ============================================================================

export const recordingStatusSchema = z.enum([
  'not_started',
  'pending',
  'recording',
  'processing',
  'ready',
  'failed',
])

export const feedbackStatusSchema = z.enum([
  'not_started',
  'pending',
  'processing',
  'ready',
  'failed',
])

export const feedbackUnavailableReasonSchema = z.enum([
  'no_consent',
  'unsupported_format',
  'no_recording',
])

export const feedbackErrorCodeSchema = z.enum([
  'assets_not_ready',
  'transcription_failed',
  'analysis_failed',
  'invalid_feedback',
  'internal_error',
])

export const interviewDetailSchema = interviewSchema.omit({
  realtime_session_id: true,
  excalidraw_room_id: true,
  excalidraw_key: true,
}).extend({
  recording_status: recordingStatusSchema,
  transcript: z.string().nullable(),
  feedback_status: feedbackStatusSchema,
  feedback_unavailable_reason: feedbackUnavailableReasonSchema.nullable(),
  feedback_error_code: feedbackErrorCodeSchema.nullable(),
  feedback_prompt_version: z.string().nullable(),
  feedback_generated_at: z.string().datetime({ offset: true }).nullable(),
})

export const interviewListResponseSchema = z.object({
  interviews: z.array(interviewListItemSchema),
})

export const interviewDetailResponseSchema = z.object({
  interview: interviewDetailSchema,
})

export const interviewListQuerySchema = z
  .object({
    status: interviewStatusSchema.optional(),
    limit: queryIntegerParameterSchema(
      z.coerce.number().int().positive().max(maxInterviewListLimit),
    ).default(defaultInterviewListLimit),
    offset: queryIntegerParameterSchema(
      z.coerce.number().int().nonnegative(),
    ).default(0),
  })
  .strict()

export const createInterviewRequestSchema = z
  .object({
    type: interviewTypeSchema,
    mode: z.literal('ai_led'),
    scheduled_at: interviewCreateScheduledAtSchema,
  })
  .strict()

export const createInterviewResponseSchema = z.object({
  interview: interviewDetailSchema,
})

export const cancelInterviewParamsSchema = z.object({
  id: z.string().uuid(),
})

export const cancelInterviewResponseSchema = z.object({
  success: z.boolean(),
})

export const startInterviewParamsSchema = z.object({
  id: z.string().uuid(),
})

export const endInterviewParamsSchema = z.object({
  id: z.string().uuid(),
})

export const interviewLifecycleResponseSchema = z.object({
  success: z.literal(true),
  interview: interviewDetailSchema,
})

export const aiChatParamsSchema = z.object({
  id: z.string().uuid(),
})

export const aiChatMaxSceneBytes = 16 * 1024
export const aiChatMaxHistoryMessages = 8
export const aiChatMaxHistoryContentLength = 750
export const aiChatMaxMessageLength = 2000

export const aiChatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(aiChatMaxHistoryContentLength),
})

export const aiChatRequestSchema = z
  .object({
    message: z.string().min(1).max(aiChatMaxMessageLength),
    canvas_snapshot: z.object({
      type: z.literal('excalidraw_scene'),
      scene: z
        .record(z.string(), jsonValueSchema)
        .refine(isSceneWithinByteLimit, {
          message: 'canvas snapshot must serialize within the 16KiB limit',
        }),
    }),
    guidance_mode: z.literal('review'),
    chat_history: z
      .array(aiChatHistoryMessageSchema)
      .max(aiChatMaxHistoryMessages)
      .optional(),
  })
  .strict()

export const aiChatResponseSchema = z.object({
  reply: z.string(),
  guidance_mode: z.literal('review'),
  prompt_version: z.string().min(1),
})

// ============================================================================
// Feedback v1 Report Schema
// ============================================================================

export const feedbackDimensionSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(2000),
}).strict()

export const feedbackStrengthSchema = z.object({
  title: z.string().min(1).max(200),
  evidence: z.string().min(1).max(2000),
}).strict()

export const feedbackImprovementSchema = z.object({
  title: z.string().min(1).max(200),
  evidence: z.string().min(1).max(2000),
  action: z.string().min(1).max(2000),
}).strict()

export const interviewFeedbackV1Schema = z.object({
  schema_version: z.literal(1),
  overall_score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(4000),
  dimensions: z.object({
    communication: feedbackDimensionSchema,
    problem_solving: feedbackDimensionSchema,
    technical_depth: feedbackDimensionSchema,
  }).strict(),
  strengths: z.array(feedbackStrengthSchema).min(0).max(20),
  improvements: z.array(feedbackImprovementSchema).min(0).max(20),
}).strict()

// ============================================================================
// Processing and Report State Schemas
// ============================================================================

export const artifactKindSchema = z.enum([
  'playback_recording',
  'transcription_audio',
  'screenshot',
])

export const artifactAvailabilitySchema = z.enum([
  'not_created',
  'processing',
  'expired',
  'failed',
])

// Legacy freeform feedback field stays tolerant for DB rows
export const interviewFeedbackRowSchema = z.record(z.string(), jsonValueSchema).nullable()

// Strict versioned union for ready-persistence and client-detail boundaries
export const interviewFeedbackSchema = interviewFeedbackV1Schema.nullable()

// ============================================================================
// Feedback Status Response Schema (lightweight polling)
// ============================================================================

export const interviewFeedbackStatusResponseSchema = z.object({
  feedback_status: feedbackStatusSchema,
  feedback_unavailable_reason: feedbackUnavailableReasonSchema.nullable(),
  feedback_error_code: feedbackErrorCodeSchema.nullable(),
  schema_version: z.literal(1).nullable(),
  prompt_version: z.string().nullable(),
  updated_at: z.string().datetime({ offset: true }),
}).strict()

export const provisionInterviewParamsSchema = z.object({
  id: z.string().uuid(),
})

export const provisionInterviewResponseSchema = z.object({
  mode: interviewModeSchema,
  realtime: z.object({
    realtime_session_id: z.string().min(1),
    token: z.string().min(1),
  }),
  excalidraw: z.object({
    excalidraw_room_id: z.string().min(1),
    excalidraw_key: z.string().min(1),
  }),
})

export type InterviewType = z.infer<typeof interviewTypeSchema>
export type InterviewMode = z.infer<typeof interviewModeSchema>
export type InterviewTier = z.infer<typeof interviewTierSchema>
export type Interview = z.infer<typeof interviewSchema>
export type InterviewListItem = z.infer<typeof interviewListItemSchema>
export type InterviewListResponse = z.infer<typeof interviewListResponseSchema>
export type InterviewDetail = z.infer<typeof interviewDetailSchema>
export type InterviewDetailResponse = z.infer<typeof interviewDetailResponseSchema>
export type InterviewListQuery = z.infer<typeof interviewListQuerySchema>
export type CreateInterviewRequest = z.infer<typeof createInterviewRequestSchema>
export type CreateInterviewResponse = z.infer<typeof createInterviewResponseSchema>
export type CancelInterviewParams = z.infer<typeof cancelInterviewParamsSchema>
export type CancelInterviewResponse = z.infer<typeof cancelInterviewResponseSchema>
export type StartInterviewParams = z.infer<typeof startInterviewParamsSchema>
export type EndInterviewParams = z.infer<typeof endInterviewParamsSchema>
export type InterviewLifecycleResponse = z.infer<typeof interviewLifecycleResponseSchema>
export type ProvisionInterviewParams = z.infer<typeof provisionInterviewParamsSchema>
export type ProvisionInterviewResponse = z.infer<typeof provisionInterviewResponseSchema>
export type AiChatParams = z.infer<typeof aiChatParamsSchema>
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>
export type AiChatHistoryMessage = z.infer<typeof aiChatHistoryMessageSchema>
export type FeedbackDimension = z.infer<typeof feedbackDimensionSchema>
export type FeedbackStrength = z.infer<typeof feedbackStrengthSchema>
export type FeedbackImprovement = z.infer<typeof feedbackImprovementSchema>
export type InterviewFeedbackV1 = z.infer<typeof interviewFeedbackV1Schema>
export type RecordingStatus = z.infer<typeof recordingStatusSchema>
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>
export type FeedbackUnavailableReason = z.infer<typeof feedbackUnavailableReasonSchema>
export type FeedbackErrorCode = z.infer<typeof feedbackErrorCodeSchema>
export type ArtifactKind = z.infer<typeof artifactKindSchema>
export type ArtifactAvailability = z.infer<typeof artifactAvailabilitySchema>
export type InterviewFeedbackStatusResponse = z.infer<typeof interviewFeedbackStatusResponseSchema>

function isSceneWithinByteLimit(scene: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(scene)
  if (serialized === undefined) {
    return true
  }

  return new TextEncoder().encode(serialized).length <= aiChatMaxSceneBytes
}

function queryIntegerParameterSchema<TSchema extends z.ZodType<number>>(
  schema: TSchema,
) {
  return z.preprocess(
    function normalizeQueryIntegerInput(value) {
      if (value === undefined) {
        return undefined
      }

      if (typeof value === 'string' && value.trim() === '') {
        return Number.NaN
      }

      return value
    },
    schema.optional(),
  )
}
