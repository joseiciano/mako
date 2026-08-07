import { z } from 'zod'

const timestampSchema = z
  .union([z.string().datetime({ offset: true }), z.date()])
  .transform(function toIsoTimestamp(value) {
    return value instanceof Date ? value.toISOString() : value
  })

const nullableTimestampSchema = timestampSchema.nullable()

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
