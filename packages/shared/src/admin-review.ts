import { z } from 'zod'
import { employmentHistorySnapshotReadSchema } from './employment'
import { interviewerApplicationStatusSchema } from './interviewer-application'

export const adminApplicationStatusSchema = interviewerApplicationStatusSchema

export type AdminApplicationStatus = z.infer<typeof adminApplicationStatusSchema>

export const adminDecisionSchema = z.enum(['approved', 'rejected'])

export type AdminDecision = z.infer<typeof adminDecisionSchema>

export const defaultAdminListLimit = 25
export const maxAdminListLimit = 100

const adminApplicantSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  isAccountDeleted: z.boolean(),
})

const adminReviewerSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
})

// List item: intentionally omits employmentHistory and reviewedBy.
export const adminApplicationSummarySchema = z.object({
  applicationId: z.string().uuid(),
  applicant: adminApplicantSchema,
  status: adminApplicationStatusSchema,
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable(),
})

export type AdminApplicationSummary = z.infer<typeof adminApplicationSummarySchema>

// Detail reuses the Story 7.1 legacy-compatible snapshot read schema.
export const adminApplicationDetailSchema = z.object({
  applicationId: z.string().uuid(),
  applicant: adminApplicantSchema,
  employmentHistory: z.array(employmentHistorySnapshotReadSchema),
  status: adminApplicationStatusSchema,
  reviewedBy: adminReviewerSchema.nullable(),
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable(),
})

export type AdminApplicationDetail = z.infer<typeof adminApplicationDetailSchema>

const limitQuerySchema = z
  .string()
  .regex(/^\d+$/, 'Must be a non-negative integer')
  .transform(Number)
  .pipe(z.number().int().min(1).max(maxAdminListLimit))

const offsetQuerySchema = z
  .string()
  .regex(/^\d+$/, 'Must be a non-negative integer')
  .transform(Number)
  .pipe(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER))

// Query-string input: { status?, limit?, offset? } with defaults applied on parse.
export const adminListQuerySchema = z.object({
  status: adminApplicationStatusSchema.default('pending'),
  limit: limitQuerySchema.default(defaultAdminListLimit),
  offset: offsetQuerySchema.default(0),
})

export type AdminListQuery = z.infer<typeof adminListQuerySchema>

export const adminListResponseSchema = z.object({
  applications: z.array(adminApplicationSummarySchema),
  pagination: z.object({
    limit: z.number().int(),
    offset: z.number().int(),
    hasMore: z.boolean(),
  }),
})

export type AdminListResponse = z.infer<typeof adminListResponseSchema>

export const adminDetailResponseSchema = z.object({
  application: adminApplicationDetailSchema,
})

export type AdminDetailResponse = z.infer<typeof adminDetailResponseSchema>

export const adminDecisionBodySchema = z.object({ decision: adminDecisionSchema }).strict()

export type AdminDecisionBody = z.infer<typeof adminDecisionBodySchema>

export const adminApplicationIdParamSchema = z.string().uuid()
