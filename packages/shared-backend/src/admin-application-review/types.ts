import type {
  AdminApplicationDetail,
  AdminApplicationStatus,
  AdminApplicationSummary,
  AdminDecision,
} from '@mako/shared'
import { z } from 'zod'
import { persistedEmploymentSnapshotEntrySchema } from '../database/foundation-schemas'

export type AdminActor = {
  userId: string
}

export class AdminReviewNotFoundError extends Error {
  constructor(message = 'Interviewer application not found.') {
    super(message)
    this.name = 'AdminReviewNotFoundError'
  }
}

export class AdminReviewForbiddenError extends Error {
  constructor(message = 'Admins cannot review their own application.') {
    super(message)
    this.name = 'AdminReviewForbiddenError'
  }
}

export class AdminReviewConflictError extends Error {
  constructor(message = 'Application is no longer pending.') {
    super(message)
    this.name = 'AdminReviewConflictError'
  }
}

export type AdminReviewLogger = {
  info(event: string, context: Record<string, unknown>): void
  error(event: string, context: Record<string, unknown>): void
}

const timestampValueSchema = z
  .union([z.string(), z.date()])
  .transform(function toIso(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
  })

const applicationStatusSchema = z.enum(['pending', 'approved', 'rejected'])

// Joined summary row for the review list.
export const adminApplicationSummaryRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  email: z.string(),
  status: applicationStatusSchema,
  created_at: timestampValueSchema,
  reviewed_at: timestampValueSchema.nullable(),
  applicant_name: z.string(),
  applicant_is_deleted: z.boolean(),
})

export type AdminApplicationSummaryRow = z.infer<typeof adminApplicationSummaryRowSchema>

// Joined detail row: summary columns + employment snapshot + reviewer identity.
export const adminApplicationDetailRowSchema = adminApplicationSummaryRowSchema.extend({
  employment_history: z.array(persistedEmploymentSnapshotEntrySchema),
  reviewed_by: z.string().uuid().nullable(),
  reviewer_name: z.string().nullable(),
  reviewer_email: z.string().nullable(),
})

export type AdminApplicationDetailRow = z.infer<typeof adminApplicationDetailRowSchema>

export type AdminDecisionInput = {
  applicationId: string
  adminId: string
  decision: AdminDecision
}

export type AdminDecisionResult =
  | { outcome: 'decided'; application: AdminApplicationDetailRow }
  | { outcome: 'not_found' }
  | { outcome: 'conflict'; reason: 'not_pending' | 'applicant_deleted' }

export type AdminListRowsInput = {
  status: AdminApplicationStatus
  limit: number
  offset: number
}

export function toAdminApplicationSummary(rowInput: unknown): AdminApplicationSummary {
  const row = adminApplicationSummaryRowSchema.parse(rowInput)

  return {
    applicationId: row.id,
    applicant: {
      userId: row.user_id,
      name: row.applicant_name,
      email: row.email,
      isAccountDeleted: row.applicant_is_deleted,
    },
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }
}

export function toAdminApplicationDetail(rowInput: unknown): AdminApplicationDetail {
  const row = adminApplicationDetailRowSchema.parse(rowInput)

  return {
    applicationId: row.id,
    applicant: {
      userId: row.user_id,
      name: row.applicant_name,
      email: row.email,
      isAccountDeleted: row.applicant_is_deleted,
    },
    employmentHistory: row.employment_history.map(function mapEntry(entry) {
      return {
        sourceCompanyId: entry.sourceCompanyId,
        company: entry.company,
        role: entry.role,
        start: entry.start,
        end: entry.end,
      }
    }),
    status: row.status,
    reviewedBy:
      row.reviewed_by === null
        ? null
        : {
            userId: row.reviewed_by,
            name: row.reviewer_name ?? '',
            email: row.reviewer_email ?? '',
          },
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }
}
