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

export const interviewDetailSchema = interviewSchema.omit({
  realtime_session_id: true,
  excalidraw_room_id: true,
  excalidraw_key: true,
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
