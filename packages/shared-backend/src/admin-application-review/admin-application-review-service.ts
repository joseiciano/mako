import {
  adminApplicationIdParamSchema,
  adminDecisionBodySchema,
  adminDetailResponseSchema,
  adminListQuerySchema,
  adminListResponseSchema,
  type AdminDetailResponse,
  type AdminListResponse,
} from '@mako/shared'
import type { AdminApplicationReviewRepository } from './admin-application-review-repository'
import {
  AdminReviewConflictError,
  AdminReviewForbiddenError,
  AdminReviewNotFoundError,
  AdminReviewValidationError,
  toAdminApplicationDetail,
  toAdminApplicationSummary,
  type AdminActor,
  type AdminDecisionResult,
  type AdminReviewLogger,
} from './types'

export const maxDecisionAttempts = 3
const retryableSqlStates = new Set(['40001', '40P01'])

export class AdminApplicationReviewService {
  constructor(
    private readonly repository: AdminApplicationReviewRepository,
    private readonly logger: AdminReviewLogger,
  ) {}

  async listApplications(rawQuery: unknown): Promise<AdminListResponse> {
    const query = parseRequestInput(adminListQuerySchema, rawQuery)
    const rows = await this.repository.listByStatus(query)
    const hasMore = rows.length > query.limit

    return adminListResponseSchema.parse({
      applications: rows.slice(0, query.limit).map(toAdminApplicationSummary),
      pagination: { limit: query.limit, offset: query.offset, hasMore },
    })
  }

  async getApplication(rawId: unknown): Promise<AdminDetailResponse> {
    const applicationId = parseRequestInput(adminApplicationIdParamSchema, rawId)
    const row = await this.repository.getDetail(applicationId)

    if (!row) {
      throw new AdminReviewNotFoundError()
    }

    return adminDetailResponseSchema.parse({ application: toAdminApplicationDetail(row) })
  }

  async decide(
    admin: AdminActor,
    rawId: unknown,
    rawBody: unknown,
  ): Promise<AdminDetailResponse> {
    const applicationId = parseRequestInput(adminApplicationIdParamSchema, rawId)
    const { decision } = parseRequestInput(adminDecisionBodySchema, rawBody)
    // Audit context: ids and decision only. Never employment history or email.
    const logContext = { applicationId, adminId: admin.userId, decision }

    this.logger.info('admin.application.decision.requested', logContext)

    try {
      const existing = await this.repository.getDetail(applicationId)

      if (!existing) {
        throw new AdminReviewNotFoundError()
      }

      if (existing.user_id === admin.userId) {
        throw new AdminReviewForbiddenError()
      }

      const result = await this.decideWithRetry({
        applicationId,
        adminId: admin.userId,
        decision,
      })

      if (result.outcome === 'not_found') {
        throw new AdminReviewNotFoundError()
      }

      if (result.outcome === 'conflict') {
        throw new AdminReviewConflictError(
          result.reason === 'applicant_deleted'
            ? 'Cannot approve an application for a deleted applicant.'
            : 'Application is no longer pending.',
        )
      }

      this.logger.info('admin.application.decision.succeeded', logContext)

      return adminDetailResponseSchema.parse({
        application: toAdminApplicationDetail(result.application),
      })
    } catch (error) {
      if (error instanceof AdminReviewConflictError) {
        this.logger.info('admin.application.decision.conflicted', {
          ...logContext,
          reason: error.message,
        })
      } else {
        this.logger.error('admin.application.decision.failed', {
          ...logContext,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorCode: getSqlState(error),
        })
      }

      throw error
    }
  }

  private async decideWithRetry(input: {
    applicationId: string
    adminId: string
    decision: 'approved' | 'rejected'
  }): Promise<AdminDecisionResult> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.repository.decide(input)
      } catch (error) {
        const sqlState = getSqlState(error)

        if (sqlState === null || !retryableSqlStates.has(sqlState)) {
          throw error
        }

        if (attempt >= maxDecisionAttempts) {
          this.logger.error('admin.application.decision.retries_exhausted', {
            applicationId: input.applicationId,
            adminId: input.adminId,
            decision: input.decision,
            attempts: attempt,
            errorCode: sqlState,
          })
          throw new AdminReviewConflictError(
            'Application decision conflicted with a concurrent change. Please retry.',
          )
        }

        this.logger.info('admin.application.decision.retry', {
          applicationId: input.applicationId,
          adminId: input.adminId,
          decision: input.decision,
          attempt,
          errorCode: sqlState,
        })
      }
    }
  }
}

// @mako/shared resolves a different zod copy than this package, so instanceof
// checks fail; match by name. Only request-input parses go through this helper.
function parseRequestInput<Output>(
  schema: { parse: (input: unknown) => Output },
  input: unknown,
): Output {
  try {
    return schema.parse(input)
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'ZodError'
    ) {
      throw new AdminReviewValidationError((error as { issues: unknown[] }).issues)
    }

    throw error
  }
}

function getSqlState(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown }
    return typeof code === 'string' ? code : null
  }

  return null
}
