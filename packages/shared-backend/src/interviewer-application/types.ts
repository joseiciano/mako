import type { InterviewerApplication, InterviewerApplicationStatus } from '@mako/shared'
import { z } from 'zod'
import { interviewerApplicationRowSchema } from '../database/foundation-schemas'

export type InterviewerApplicationSession = {
  userId: string
  email: string
}

// Error classes
export class InterviewerApplicationUnauthorizedError extends Error {
  constructor(message = 'You must be authenticated to access this resource.') {
    super(message)
    this.name = 'InterviewerApplicationUnauthorizedError'
  }
}

export class InterviewerApplicationForbiddenError extends Error {
  constructor(message = 'Account is inactive or deleted.') {
    super(message)
    this.name = 'InterviewerApplicationForbiddenError'
  }
}

export class InterviewerApplicationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InterviewerApplicationValidationError'
  }
}

export class InterviewerApplicationConflictError extends Error {
  constructor(message = 'An active interviewer application already exists.') {
    super(message)
    this.name = 'InterviewerApplicationConflictError'
  }
}

// UUID validation
export const authenticatedUserIdSchema = z.string().uuid()

// Employment record IDs from request
export const employmentRecordIdsSchema = z.array(z.string().uuid()).min(1).max(10)

// Snapshot entry built from locked user_companies rows (write schema: non-null sourceCompanyId)
export const snapshotEntryWriteSchema = z.object({
  sourceCompanyId: z.string().uuid(),
  company: z.string().min(1),
  role: z.string().min(1),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

export type SnapshotEntryWrite = z.infer<typeof snapshotEntryWriteSchema>

export function toInterviewerApplication(
  rowInput: unknown,
): InterviewerApplication {
  const row = interviewerApplicationRowSchema.parse(rowInput)

  return {
    applicationId: row.id,
    email: row.email,
    employmentHistory: row.employment_history.map(function mapSnapshotEntry(entry) {
      return {
        sourceCompanyId: entry.sourceCompanyId,
        company: entry.company,
        role: entry.role,
        start: entry.start,
        end: entry.end,
      }
    }),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type { InterviewerApplication, InterviewerApplicationStatus }
