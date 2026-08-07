import { z } from 'zod'

export const interviewerApplicationStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
])

export type InterviewerApplicationStatus = z.infer<
  typeof interviewerApplicationStatusSchema
>

// Date-only string schema (YYYY-MM-DD)
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date string')

// Employment snapshot entry in application response (read model): sourceCompanyId may be null for legacy
export const applicationEmploymentHistoryEntrySchema = z.object({
  sourceCompanyId: z.string().uuid().nullable(),
  company: z.string().min(1),
  role: z.string().min(1),
  start: dateOnlySchema,
  end: dateOnlySchema.nullable(),
})

export type ApplicationEmploymentHistoryEntry = z.infer<
  typeof applicationEmploymentHistoryEntrySchema
>

// Full application response shape
export const interviewerApplicationSchema = z.object({
  applicationId: z.string().uuid(),
  email: z.string().email(),
  employmentHistory: z.array(applicationEmploymentHistoryEntrySchema),
  status: interviewerApplicationStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type InterviewerApplication = z.infer<typeof interviewerApplicationSchema>

// Request: POST /api/interviewer/apply
export const interviewerApplicationRequestSchema = z
  .object({
    email: z.string().email(),
    employmentRecordIds: z.array(z.string().uuid()).min(1).max(10),
  })
  .strict()
  .refine(function uniqueIds(data) {
    return new Set(data.employmentRecordIds).size === data.employmentRecordIds.length
  }, 'employmentRecordIds must be unique')

export type InterviewerApplicationRequest = z.infer<
  typeof interviewerApplicationRequestSchema
>

// Response shapes
export const interviewerApplicationResponseSchema = z.object({
  application: interviewerApplicationSchema,
})

export type InterviewerApplicationResponse = z.infer<
  typeof interviewerApplicationResponseSchema
>

export const interviewerApplicationStatusResponseSchema = z.object({
  application: interviewerApplicationSchema.nullable(),
})

export type InterviewerApplicationStatusResponse = z.infer<
  typeof interviewerApplicationStatusResponseSchema
>
