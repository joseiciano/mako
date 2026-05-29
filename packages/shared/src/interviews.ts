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
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const interviewListItemSchema = interviewSchema

export const interviewListResponseSchema = z.object({
  interviews: z.array(interviewListItemSchema),
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
