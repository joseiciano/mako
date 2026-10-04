import type { AdminApplicationReviewRepository } from './admin-application-review-repository'
import type {
  AdminApplicationDetailRow,
  AdminApplicationSummaryRow,
  AdminDecisionInput,
  AdminDecisionResult,
  AdminReviewLogger,
} from './types'

export const adminId = '99999999-9999-4999-8999-999999999999'
export const applicantId = '11111111-1111-4111-8111-111111111111'
export const applicationId = '22222222-2222-4222-8222-222222222222'
export const secondApplicationId = '33333333-3333-4333-8333-333333333333'

export function buildDetailRow(
  overrides: Partial<AdminApplicationDetailRow> = {},
): AdminApplicationDetailRow {
  return {
    id: applicationId,
    user_id: applicantId,
    email: 'applicant@example.com',
    status: 'pending',
    created_at: '2026-08-07T00:00:00.000Z',
    reviewed_at: null,
    applicant_name: 'Ada Applicant',
    applicant_is_deleted: false,
    employment_history: [
      {
        sourceCompanyId: '44444444-4444-4444-8444-444444444444',
        company: 'acme',
        role: 'Engineer',
        start: '2020-01-01',
        end: null,
      },
    ],
    reviewed_by: null,
    reviewer_name: null,
    reviewer_email: null,
    ...overrides,
  }
}

export type FakeRepositoryState = {
  rows: AdminApplicationDetailRow[]
  eligibleUserIds: Set<string>
  decideCalls: AdminDecisionInput[]
  decideImpl?: (input: AdminDecisionInput) => Promise<AdminDecisionResult>
}

/** In-memory repository mirroring the guarded-decision semantics. */
export function createFakeRepository(rows: AdminApplicationDetailRow[]): {
  repository: AdminApplicationReviewRepository
  state: FakeRepositoryState
} {
  const state: FakeRepositoryState = {
    rows,
    eligibleUserIds: new Set(),
    decideCalls: [],
  }

  const repository = {
    async listByStatus(input) {
      return state.rows
        .filter((row) => row.status === input.status)
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .slice(input.offset, input.offset + input.limit + 1)
        .map(
          (row): AdminApplicationSummaryRow => ({
            id: row.id,
            user_id: row.user_id,
            email: row.email,
            status: row.status,
            created_at: row.created_at,
            reviewed_at: row.reviewed_at,
            applicant_name: row.applicant_name,
            applicant_is_deleted: row.applicant_is_deleted,
          }),
        )
    },
    async getDetail(id) {
      return state.rows.find((row) => row.id === id) ?? null
    },
    async decide(input) {
      state.decideCalls.push(input)

      if (state.decideImpl) {
        return state.decideImpl(input)
      }

      const row = state.rows.find((candidate) => candidate.id === input.applicationId)

      if (!row) {
        return { outcome: 'not_found' }
      }

      if (row.status !== 'pending') {
        return { outcome: 'conflict', reason: 'not_pending' }
      }

      if (input.decision === 'approved') {
        if (row.applicant_is_deleted) {
          return { outcome: 'conflict', reason: 'applicant_deleted' }
        }

        state.eligibleUserIds.add(row.user_id)
      }

      row.status = input.decision
      row.reviewed_by = input.adminId
      row.reviewed_at = '2026-08-08T00:00:00.000Z'
      row.reviewer_name = 'Admin'
      row.reviewer_email = 'admin@example.com'

      return { outcome: 'decided', application: structuredClone(row) }
    },
  } as AdminApplicationReviewRepository

  return { repository, state }
}

export function createRecordingLogger(): {
  logger: AdminReviewLogger
  events: { level: 'info' | 'error'; event: string; context: Record<string, unknown> }[]
} {
  const events: { level: 'info' | 'error'; event: string; context: Record<string, unknown> }[] = []

  return {
    events,
    logger: {
      info(event, context) {
        events.push({ level: 'info', event, context })
      },
      error(event, context) {
        events.push({ level: 'error', event, context })
      },
    },
  }
}
