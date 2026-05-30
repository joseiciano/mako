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
  feedback: z.record(z.string(), z.unknown()).nullable(),
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
})

export const interviewListResponseSchema = z.object({
  interviews: z.array(interviewListItemSchema),
})

export const interviewDetailResponseSchema = z.object({
  interview: interviewSchema,
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
  interview: interviewSchema,
})

export const cancelInterviewParamsSchema = z.object({
  id: z.string().uuid(),
})

export const cancelInterviewResponseSchema = z.object({
  success: z.boolean(),
})

export type Interview = z.infer<typeof interviewSchema>
export type InterviewListItem = z.infer<typeof interviewListItemSchema>
export type InterviewListResponse = z.infer<typeof interviewListResponseSchema>
export type InterviewDetailResponse = z.infer<typeof interviewDetailResponseSchema>
export type InterviewListQuery = z.infer<typeof interviewListQuerySchema>
export type CreateInterviewRequest = z.infer<typeof createInterviewRequestSchema>
export type CreateInterviewResponse = z.infer<typeof createInterviewResponseSchema>
export type CancelInterviewParams = z.infer<typeof cancelInterviewParamsSchema>
export type CancelInterviewResponse = z.infer<typeof cancelInterviewResponseSchema>

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
