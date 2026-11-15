import type {
  AdminApplicationDetail,
  AdminApplicationStatus,
  AdminApplicationSummary,
  AdminDecision,
} from '@mako/shared'
import { z } from 'zod'
import {
  interviewerApplicationStatusSchema,
  nullableTimestampSchema,
  persistedEmploymentSnapshotEntrySchema,
  timestampSchema,
} from '../database/foundation-schemas'

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

/** Request input (id, body, query) failed validation. Only this maps to 400. */
export class AdminReviewValidationError extends Error {
  readonly issues: unknown[]

  constructor(issues: unknown[]) {
    super('Invalid request')
    this.name = 'AdminReviewValidationError'
    this.issues = issues
  }
}

export type AdminReviewLogger = {
  info(event: string, context: Record<string, unknown>): void
  error(event: string, context: Record<string, unknown>): void
}

// Joined summary row for the review list.
export const adminApplicationSummaryRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  email: z.string(),
  status: interviewerApplicationStatusSchema,
  created_at: timestampSchema,
  reviewed_at: nullableTimestampSchema,
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
    reviewedBy: toReviewer(row),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }
}

// A set reviewed_by with no joined reviewer is corrupt data: surface it (500), never blank it.
function toReviewer(row: AdminApplicationDetailRow): AdminApplicationDetail['reviewedBy'] {
  if (row.reviewed_by === null) {
    return null
  }

  if (row.reviewer_name === null || row.reviewer_email === null) {
    throw new Error('Interviewer application has reviewed_by set but the reviewer is missing.')
  }

  return {
    userId: row.reviewed_by,
    name: row.reviewer_name,
    email: row.reviewer_email,
  }
}
