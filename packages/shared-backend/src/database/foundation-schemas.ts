import { z } from 'zod'

export const timestampSchema = z
  .union([z.string().datetime({ offset: true }), z.date()])
  .transform(function toIsoTimestamp(value) {
    return value instanceof Date ? value.toISOString() : value
  })

export const nullableTimestampSchema = timestampSchema.nullable()

export const interviewTypeSchema = z.enum([
  'system_design',
  'coding',
  'behavioral',
])

export type InterviewType = z.infer<typeof interviewTypeSchema>

export const availabilityRequestStatusSchema = z.enum([
  'active',
  'fulfilled',
  'cancelled',
])

export type AvailabilityRequestStatus = z.infer<
  typeof availabilityRequestStatusSchema
>

export const availabilitySlotStatusSchema = z.enum([
  'available',
  'matched',
  'cancelled',
])

export type AvailabilitySlotStatus = z.infer<typeof availabilitySlotStatusSchema>

export const premiumInterviewerSlotStatusSchema = z.enum([
  'available',
  'claimed',
  'cancelled',
])

export type PremiumInterviewerSlotStatus = z.infer<
  typeof premiumInterviewerSlotStatusSchema
>

export const premiumInterviewerSlotRowSchema = z.object({
  id: z.string().uuid(),
  interviewer_id: z.string().uuid(),
  interview_type: interviewTypeSchema,
  start_time: timestampSchema,
  end_time: timestampSchema,
  status: premiumInterviewerSlotStatusSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export type PremiumInterviewerSlotRow = z.infer<
  typeof premiumInterviewerSlotRowSchema
>

export function parsePremiumInterviewerSlotRow(
  row: unknown,
): PremiumInterviewerSlotRow {
  return premiumInterviewerSlotRowSchema.parse(row)
}

export const premiumSlotClaimStatusSchema = z.object({
  idempotency_key: z.string().uuid(),
  slot_id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  interview_id: z.string().uuid(),
  created_at: timestampSchema,
})

export type PremiumSlotClaimRow = z.infer<typeof premiumSlotClaimStatusSchema>

export function parsePremiumSlotClaimRow(row: unknown): PremiumSlotClaimRow {
  return premiumSlotClaimStatusSchema.parse(row)
}

export const premiumClaimInterviewRowSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  scheduler_alias: z.string().min(1),
  interviewer_id: z.string().uuid(),
  interviewer_alias: z.string().min(1),
  type: interviewTypeSchema,
  mode: z.enum(['peer_to_peer', 'ai_led']),
  booking_channel: z.enum([
    'ai_direct',
    'standard_match',
    'verified_interviewer',
  ]),
  tier: z.enum(['standard', 'premium']),
  status: z.enum(['scheduled', 'ongoing', 'completed', 'cancelled']),
  scheduled_at: timestampSchema,
  realtime_session_id: z.string().nullable(),
  excalidraw_room_id: z.string().nullable(),
  excalidraw_key: z.string().nullable(),
  recording_url: z.string().nullable(),
  screenshot_urls: z.array(z.string()).nullable(),
  feedback: z.record(z.unknown()).nullable(),
  recording_status: z.string().nullable(),
  transcript: z.string().nullable(),
  feedback_status: z.string().nullable(),
  feedback_unavailable_reason: z.string().nullable(),
  feedback_error_code: z.string().nullable(),
  feedback_prompt_version: z.string().nullable(),
  feedback_generated_at: z.string().nullable(),
  started_at: z.string().nullable(),
  screenshots_finalized_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  warning_at: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export type PremiumClaimInterviewRow = z.infer<
  typeof premiumClaimInterviewRowSchema
>

export function parsePremiumClaimInterviewRow(
  row: unknown,
): PremiumClaimInterviewRow {
  return premiumClaimInterviewRowSchema.parse(row)
}

export const userRowSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  credits: z.number().int().nonnegative(),
  free_standard_interviews: z.number().int().nonnegative(),
  free_ai_interviews: z.number().int().nonnegative(),
  companies: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  deleted_at: nullableTimestampSchema,
})

export type UserRow = z.infer<typeof userRowSchema>

export const userCompanyRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  company: z
    .string()
    .min(1)
    .refine(function isLowercaseCompany(value) {
      return value === value.toLowerCase()
    }, 'company must be lowercase'),
  role: z.string().nullable(),
  joined: timestampSchema,
  ended_at: nullableTimestampSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  deleted_at: nullableTimestampSchema,
})

export type UserCompanyRow = z.infer<typeof userCompanyRowSchema>

export const interviewerApplicationStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
])

export type InterviewerApplicationStatus = z.infer<
  typeof interviewerApplicationStatusSchema
>

// Persisted employment snapshot entry (read/admin model): sourceCompanyId may be null for legacy
export const persistedEmploymentSnapshotEntrySchema = z.object({
  sourceCompanyId: z.string().uuid().nullable(),
  company: z.string().min(1),
  role: z.string().min(1),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date string'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date string').nullable(),
})

export type PersistedEmploymentSnapshotEntry = z.infer<
  typeof persistedEmploymentSnapshotEntrySchema
>

export const interviewerApplicationRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  email: z.string().email(),
  employment_history: z.array(persistedEmploymentSnapshotEntrySchema),
  status: interviewerApplicationStatusSchema,
  reviewed_by: z.string().uuid().nullable(),
  // Decision timestamp (Story 7.8): null while pending. Every SELECT must include it.
  reviewed_at: nullableTimestampSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export type InterviewerApplicationRow = z.infer<typeof interviewerApplicationRowSchema>

export function parseInterviewerApplicationRow(
  row: unknown,
): InterviewerApplicationRow {
  return interviewerApplicationRowSchema.parse(row)
}

export const availabilityRequestRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  max_matches: z.number().int().positive(),
  current_matches: z.number().int().nonnegative(),
  interview_type: interviewTypeSchema,
  status: availabilityRequestStatusSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export type AvailabilityRequestRow = z.infer<typeof availabilityRequestRowSchema>

export const availabilitySlotRowSchema = z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  start_time: timestampSchema,
  end_time: timestampSchema,
  status: availabilitySlotStatusSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export type AvailabilitySlotRow = z.infer<typeof availabilitySlotRowSchema>

export function parseUserRow(row: unknown): UserRow {
  return userRowSchema.parse(row)
}

export function parseUserCompanyRow(row: unknown): UserCompanyRow {
  return userCompanyRowSchema.parse(row)
}

export function parseAvailabilityRequestRow(
  row: unknown,
): AvailabilityRequestRow {
  return availabilityRequestRowSchema.parse(row)
}

export function parseAvailabilitySlotRow(row: unknown): AvailabilitySlotRow {
  return availabilitySlotRowSchema.parse(row)
}
