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

export const interviewScheduledAtSchema = z.string().datetime()

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

export type Interview = z.infer<typeof interviewSchema>
export type InterviewListItem = z.infer<typeof interviewListItemSchema>
export type InterviewListResponse = z.infer<typeof interviewListResponseSchema>
export type CreateInterviewRequest = z.infer<typeof createInterviewRequestSchema>
export type CreateInterviewResponse = z.infer<typeof createInterviewResponseSchema>
