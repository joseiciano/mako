import {
  premiumInterviewerSlotSchema,
  premiumOwnerListQuerySchema,
  premiumOwnerListResponseSchema,
  premiumPolicyMetadataSchema,
  publishPremiumSlotInputSchema,
  type PremiumInterviewerSlot,
  type PremiumOwnerListResponse,
} from '@mako/shared'
import { createSqlQuery, type SqlQueryExecutor } from '../index'
import type { PremiumInterviewerSlotRow } from '../database/foundation-schemas'
import {
  PremiumConflictError,
  PremiumForbiddenError,
  PremiumNotFoundError,
  PremiumUnauthorizedError,
  PremiumValidationError,
  authenticatedPremiumUserIdSchema,
  premiumSlotIdSchema,
  type PremiumSession,
} from './premium-errors'
import {
  defaultPremiumPolicyConfig,
  premiumSlotPriceCredits,
  premiumSlotWindowMinutes,
  type PremiumPolicyConfig,
} from './premium-policy-config'
import {
  PremiumAvailabilityRepository,
  type ListSlotsByInterviewerFilters,
} from './premium-availability-repository'
import { isSerializationConflict, rollbackTransactionSafely } from './premium-utils'

type PremiumIdFactory = () => string
type PremiumNowFactory = () => string

export type PremiumAvailabilityServiceLogger = {
  info(event: string, context: Record<string, unknown>): void
}

const defaultCreateId: PremiumIdFactory = function createRandomId() {
  return crypto.randomUUID()
}

const defaultNow: PremiumNowFactory = function createNow() {
  return new Date().toISOString()
}

export class PremiumAvailabilityService {
  constructor(
    private readonly repository: PremiumAvailabilityRepository,
    private readonly policyConfig: PremiumPolicyConfig = defaultPremiumPolicyConfig,
    private readonly queryExecutor: SqlQueryExecutor,
    private readonly createId: PremiumIdFactory = defaultCreateId,
    private readonly now: PremiumNowFactory = defaultNow,
    private readonly logger: PremiumAvailabilityServiceLogger | undefined = undefined,
  ) {}

  async publishSlot(
    session: PremiumSession | null,
    input: unknown,
  ): Promise<{ slot: PremiumInterviewerSlot }> {
    const userSession = this.requireSession(session)
    const userId = authenticatedPremiumUserIdSchema.parse(userSession.userId)
    const parsedInput = publishPremiumSlotInputSchema.parse(input)

    const startTime = parsedInput.startTime
    const endTime = deriveEndTime(startTime)
    this.validateWindowBounds(startTime)

    const maxAttempts = 3

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      this.emitLog('premium.slot.publish_requested', {
        interviewerId: userId,
        interviewType: parsedInput.interviewType,
        startTime,
        endTime,
        outcome: 'requested',
      })

      try {
        await this.queryExecutor.query(createSqlQuery('BEGIN;'))
        const lockedUser = await this.repository.lockInterviewerUserRow(
          this.queryExecutor,
          userId,
        )

        if (!lockedUser || lockedUser.deleted_at !== null) {
          throw new PremiumForbiddenError()
        }

        if (lockedUser.companies !== true) {
          throw new PremiumForbiddenError(
            'Account is not eligible to publish premium availability slots.',
          )
        }

        const overlappingSlot = await this.repository.listOverlappingSlots(
          this.queryExecutor,
          userId,
          startTime,
          endTime,
        )

        if (overlappingSlot) {
          this.emitLog('premium.slot.publish_conflicted', {
            interviewerId: userId,
            interviewType: parsedInput.interviewType,
            startTime,
            endTime,
            outcome: 'overlap_rejected',
          })
          throw new PremiumConflictError()
        }

        const interviewConflict = await this.repository.listInterviewConflicts(
          this.queryExecutor,
          userId,
          startTime,
          endTime,
        )

        if (interviewConflict) {
          this.emitLog('premium.slot.publish_conflicted', {
            interviewerId: userId,
            interviewType: parsedInput.interviewType,
            startTime,
            endTime,
            outcome: 'interview_conflict_rejected',
          })
          throw new PremiumConflictError(
            'The premium slot window conflicts with an existing interview.',
          )
        }

        const timestamp = this.now()
        const createdRow = await this.repository.insertSlot(this.queryExecutor, {
          id: this.createId(),
          interviewerId: userId,
          interviewType: parsedInput.interviewType,
          startTime,
          endTime,
          createdAt: timestamp,
          updatedAt: timestamp,
        })

        await this.queryExecutor.query(createSqlQuery('COMMIT;'))

        this.emitLog('premium.slot.publish_succeeded', {
          slotId: createdRow.id,
          interviewerId: userId,
          interviewType: parsedInput.interviewType,
          startTime,
          endTime,
          outcome: 'published',
        })

        return { slot: toPremiumInterviewerSlot(createdRow) }
      } catch (error) {
        await rollbackTransactionSafely(this.queryExecutor)

        if (attempt < maxAttempts - 1 && isSerializationConflict(error)) {
          this.emitLog('premium.slot.publish_retry', {
            interviewerId: userId,
            attempt: attempt + 1,
            maxAttempts,
          })
          continue
        }

        if (isSerializationConflict(error)) {
          this.emitLog('premium.slot.publish_conflict_exhausted', {
            interviewerId: userId,
          })
          throw new PremiumConflictError(
            'Publish transaction conflicts exhausted after retries. Please retry.',
          )
        }

        throw error
      }
    }

    throw new Error('Unexpected premium publish state.')
  }

  async listSlots(
    session: PremiumSession | null,
    query: unknown,
  ): Promise<PremiumOwnerListResponse> {
    const userSession = this.requireSession(session)
    const userId = authenticatedPremiumUserIdSchema.parse(userSession.userId)
    const parsedQuery = premiumOwnerListQuerySchema.parse(query)

    const user = await this.repository.getUserById(this.queryExecutor, userId)

    if (!user || user.deleted_at !== null) {
      throw new PremiumForbiddenError()
    }

    if (user.companies !== true) {
      throw new PremiumForbiddenError()
    }

    const filters: ListSlotsByInterviewerFilters = {
      interviewerId: userId,
      status: parsedQuery.status,
      interviewType: parsedQuery.interviewType,
      limit: parsedQuery.limit,
      offset: parsedQuery.offset,
    }

    const rows = await this.repository.listSlotsByInterviewer(this.queryExecutor, filters)
    const total = await this.repository.countSlotsByInterviewer(this.queryExecutor, filters)
    const hasMore = parsedQuery.offset + rows.length < total

    return premiumOwnerListResponseSchema.parse({
      slots: rows.map(function mapSlotRow(row) {
        return toPremiumInterviewerSlot(row)
      }),
      pagination: {
        limit: parsedQuery.limit,
        offset: parsedQuery.offset,
        hasMore,
      },
      policy: premiumPolicyMetadataSchema.parse({
        leadTimeMinutes: this.policyConfig.leadTimeMinutes,
        horizonDays: this.policyConfig.horizonDays,
        priceCredits: premiumSlotPriceCredits,
      }),
    })
  }

  async cancelSlot(
    session: PremiumSession | null,
    slotId: unknown,
  ): Promise<{ success: true }> {
    const userSession = this.requireSession(session)
    const userId = authenticatedPremiumUserIdSchema.parse(userSession.userId)
    const parsedSlotId = premiumSlotIdSchema.parse(slotId)

    const maxAttempts = 3

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await this.queryExecutor.query(createSqlQuery('BEGIN;'))
        const user = await this.repository.getUserById(this.queryExecutor, userId)

        if (!user || user.deleted_at !== null) {
          throw new PremiumForbiddenError()
        }

        if (user.companies !== true) {
          throw new PremiumForbiddenError()
        }

        const updatedRow = await this.repository.cancelSlotIfAvailable(
          this.queryExecutor,
          parsedSlotId,
          userId,
          this.now(),
        )

        if (!updatedRow) {
          const existingSlot = await this.repository.getSlotById(
            this.queryExecutor,
            parsedSlotId,
          )

          if (!existingSlot || existingSlot.interviewer_id !== userId) {
            throw new PremiumNotFoundError()
          }

          if (existingSlot.status === 'claimed') {
            this.emitLog('premium.slot.cancel_rejected', {
              slotId: parsedSlotId,
              interviewerId: userId,
              outcome: 'claimed_rejected',
            })
            throw new PremiumConflictError('A claimed premium slot cannot be cancelled.')
          }
        }

        await this.queryExecutor.query(createSqlQuery('COMMIT;'))

        this.emitLog('premium.slot.cancelled', {
          slotId: parsedSlotId,
          interviewerId: userId,
          outcome: 'cancelled',
        })

        return { success: true }
      } catch (error) {
        await rollbackTransactionSafely(this.queryExecutor)

        if (attempt < maxAttempts - 1 && isSerializationConflict(error)) {
          this.emitLog('premium.slot.cancel_retry', {
            slotId: parsedSlotId,
            interviewerId: userId,
            attempt: attempt + 1,
            maxAttempts,
          })
          continue
        }

        if (isSerializationConflict(error)) {
          this.emitLog('premium.slot.cancel_conflict_exhausted', {
            slotId: parsedSlotId,
            interviewerId: userId,
          })
          throw new PremiumConflictError(
            'Cancel transaction conflicts exhausted after retries. Please retry.',
          )
        }

        throw error
      }
    }

    throw new Error('Unexpected premium cancel state.')
  }

  private requireSession(session: PremiumSession | null): PremiumSession {
    if (!session) {
      throw new PremiumUnauthorizedError()
    }

    return session
  }

  private emitLog(event: string, context: Record<string, unknown>): void {
    if (this.logger) {
      this.logger.info(event, context)
    }
  }

  private validateWindowBounds(startTime: string): void {
    const startMs = new Date(startTime).getTime()
    const nowMs = new Date(this.now()).getTime()
    const leadTimeMs = this.policyConfig.leadTimeMinutes * 60 * 1000
    const horizonMs = this.policyConfig.horizonDays * 24 * 60 * 60 * 1000

    if (Number.isNaN(startMs)) {
      throw new PremiumValidationError('startTime must be a valid ISO-8601 timestamp.')
    }

    if (startMs < nowMs + leadTimeMs) {
      throw new PremiumValidationError(
        `startTime must be at least ${this.policyConfig.leadTimeMinutes} minutes in the future.`,
      )
    }

    if (startMs > nowMs + horizonMs) {
      throw new PremiumValidationError(
        `startTime must be within ${this.policyConfig.horizonDays} days of the current time.`,
      )
    }
  }
}

export function toPremiumInterviewerSlot(row: PremiumInterviewerSlotRow): PremiumInterviewerSlot {
  return premiumInterviewerSlotSchema.parse({
    id: row.id,
    interviewerId: row.interviewer_id,
    interviewType: row.interview_type,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function deriveEndTime(startTime: string): string {
  return new Date(new Date(startTime).getTime() + premiumSlotWindowMinutes * 60 * 1000).toISOString()
}
