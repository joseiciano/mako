import { createSqlQuery, type SqlQueryExecutor } from '../index'
import { CreditRepository } from '../credit/credit-repository'
import { buildInterviewPremiumBookedEvent } from '../notification-queue-event-contract'
import { buildInterviewAliases } from '../interview/alias-policy'
import { parseInterviewDetail, type InterviewDetail } from '../interviews/types'
import {
  PremiumClaimRepository,
  type ClaimInterviewRow,
  type LockedUserRow,
  type PremiumClaimRow,
  type PremiumSlotRow,
} from './premium-claim-repository'
import {
  PremiumConflictError,
  PremiumDataIntegrityError,
  PremiumForbiddenError,
  PremiumIdempotencyKeyConflictError,
  PremiumInsufficientCreditsError,
  PremiumInterviewerIneligibleError,
  PremiumNotFoundError,
  PremiumSchedulingConflictError,
  PremiumSelfClaimError,
  PremiumSlotAlreadyClaimedError,
  PremiumUnauthorizedError,
  type PremiumSession,
} from './premium-errors'
import {
  defaultPremiumPolicyConfig,
  type PremiumPolicyConfig,
} from './premium-policy-config'
import { isSerializationConflict, rollbackTransactionSafely } from './premium-utils'

type PremiumIdFactory = () => string
type PremiumNowFactory = () => string
type PersistOutboxEvent = (event: unknown) => Promise<void>

export type PremiumClaimServiceLogger = {
  info(event: string, context: Record<string, unknown>): void | Promise<void>
  error(event: string, context: Record<string, unknown>): void | Promise<void>
}

const noOpClaimLogger: PremiumClaimServiceLogger = {
  info: function logInfo() {},
  error: function logError() {},
}

const defaultCreateId: PremiumIdFactory = function createRandomId() {
  return crypto.randomUUID()
}

const defaultNow: PremiumNowFactory = function createNow() {
  return new Date().toISOString()
}

export type ClaimSlotResult = {
  interview: InterviewDetail
  replayed: boolean
}

export class PremiumClaimService {
  constructor(
    private readonly repository: PremiumClaimRepository,
    private readonly creditRepository: CreditRepository,
    private readonly policyConfig: PremiumPolicyConfig,
    private readonly queryExecutor: SqlQueryExecutor,
    private readonly createId: PremiumIdFactory = defaultCreateId,
    private readonly now: PremiumNowFactory = defaultNow,
    private readonly logger: PremiumClaimServiceLogger = noOpClaimLogger,
  ) {}

  async claimSlot(input: {
    session: PremiumSession | null
    slotId: string
    idempotencyKey: string
    persistOutboxEvent: PersistOutboxEvent
  }): Promise<ClaimSlotResult> {
    const { slotId, idempotencyKey, persistOutboxEvent } = input

    if (!input.session) {
      throw new PremiumUnauthorizedError()
    }

    const schedulerId = input.session.userId
    const maxAttempts = 3

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const result = await this.executeClaimTransaction({
          schedulerId,
          slotId,
          idempotencyKey,
          persistOutboxEvent,
          attempt,
        })

        return result
      } catch (error) {
        if (attempt < maxAttempts - 1 && isSerializationConflict(error)) {
          await this.logSafely('info', 'premium.claim_retry', {
            idempotency_key: idempotencyKey,
            slot_id: slotId,
            attempt: attempt + 1,
            max_attempts: maxAttempts,
          })
          continue
        }

        if (isSerializationConflict(error)) {
          await this.logSafely('error', 'premium.claim_conflict_exhausted', {
            idempotency_key: idempotencyKey,
            slot_id: slotId,
          })
          await this.logSafely('error', 'premium.claim_failed', {
            idempotency_key: idempotencyKey,
            slot_id: slotId,
            scheduler_id: schedulerId,
            retry_count: attempt,
            outcome: 'Claim transaction conflicts exhausted after retries. Please retry.',
          })
          throw new PremiumConflictError(
            'Claim transaction conflicts exhausted after retries. Please retry.',
          )
        }

        throw error
      }
    }

    throw new Error('Unexpected premium claim state.')
  }

  private async executeClaimTransaction(input: {
    schedulerId: string
    slotId: string
    idempotencyKey: string
    persistOutboxEvent: PersistOutboxEvent
    attempt: number
  }): Promise<ClaimSlotResult> {
    const { schedulerId, slotId, idempotencyKey, persistOutboxEvent, attempt } = input

    await this.logSafely('info', 'premium.claim_requested', {
      idempotency_key: idempotencyKey,
      slot_id: slotId,
      scheduler_id: schedulerId,
      retry_count: attempt,
    })

    await this.queryExecutor.query(createSqlQuery('BEGIN;'))

    let slotRowForLog: PremiumSlotRow | null = null
    let existingClaim: PremiumClaimRow | null = null
    let interviewIdForLog: string | undefined

    try {
      await this.repository.acquireIdempotencyLock(this.queryExecutor, idempotencyKey)

      existingClaim = await this.repository.findClaimByIdempotencyKey(
        this.queryExecutor,
        idempotencyKey,
      )

      if (existingClaim) {
        if (
          existingClaim.scheduler_id !== schedulerId ||
          existingClaim.slot_id !== slotId
        ) {
          throw new PremiumIdempotencyKeyConflictError()
        }

        const schedulerRow = await this.repository.lockSchedulerForUpdate(
          this.queryExecutor,
          schedulerId,
        )

        if (!schedulerRow || schedulerRow.deleted_at !== null) {
          throw new PremiumForbiddenError()
        }

        const existingInterview = await this.repository.getInterviewById(
          this.queryExecutor,
          existingClaim.interview_id,
        )

        if (!existingInterview) {
          throw new PremiumNotFoundError()
        }

        await this.queryExecutor.query(createSqlQuery('COMMIT;'))

        await this.logSafely('info', 'premium.claim_replayed', {
          idempotency_key: idempotencyKey,
          slot_id: slotId,
          interview_id: existingClaim.interview_id,
          scheduler_id: schedulerId,
        })

        return {
          interview: parseInterviewDetail(existingInterview),
          replayed: true,
        }
      }

      await this.repository.acquireSlotLock(this.queryExecutor, slotId)

      const slotRow = await this.repository.lockSlotForUpdate(
        this.queryExecutor,
        slotId,
      )

      if (!slotRow) {
        throw new PremiumNotFoundError()
      }

      slotRowForLog = slotRow

      const existingSlotClaim = await this.repository.findClaimBySlotId(
        this.queryExecutor,
        slotId,
      )

      if (existingSlotClaim) {
        throw new PremiumSlotAlreadyClaimedError()
      }

      if (slotRow.status === 'cancelled') {
        throw new PremiumNotFoundError()
      }

      if (slotRow.status === 'claimed') {
        throw new PremiumSlotAlreadyClaimedError()
      }

      if (slotRow.interviewer_id === schedulerId) {
        throw new PremiumSelfClaimError()
      }

      const userIds = [schedulerId, slotRow.interviewer_id].sort()
      const lockedUsers = await this.repository.lockUsersForUpdate(
        this.queryExecutor,
        userIds,
      )

      const schedulerUser = lockedUsers.find(function isScheduler(row) {
        return row.id === schedulerId
      })
      const interviewerUser = lockedUsers.find(function isInterviewer(row) {
        return row.id === slotRow.interviewer_id
      })

      if (!schedulerUser || schedulerUser.deleted_at !== null) {
        throw new PremiumForbiddenError()
      }

      if (!interviewerUser || interviewerUser.deleted_at !== null) {
        throw new PremiumInterviewerIneligibleError()
      }

      if (interviewerUser.companies !== true) {
        throw new PremiumInterviewerIneligibleError()
      }

      this.validateWindowBounds(slotRow.start_time)

      const schedulerConflict = await this.repository.findInterviewConflict(
        this.queryExecutor,
        schedulerId,
        slotRow.start_time,
        slotRow.end_time,
      )

      if (schedulerConflict) {
        throw new PremiumSchedulingConflictError()
      }

      const interviewerConflict = await this.repository.findInterviewConflict(
        this.queryExecutor,
        slotRow.interviewer_id,
        slotRow.start_time,
        slotRow.end_time,
      )

      if (interviewerConflict) {
        throw new PremiumSchedulingConflictError()
      }

      const schedulerSlotConflict = await this.repository.findPremiumSlotConflict(
        this.queryExecutor,
        schedulerId,
        slotRow.start_time,
        slotRow.end_time,
        slotId,
      )

      if (schedulerSlotConflict) {
        throw new PremiumSchedulingConflictError()
      }

      const interviewerSlotConflict = await this.repository.findPremiumSlotConflict(
        this.queryExecutor,
        slotRow.interviewer_id,
        slotRow.start_time,
        slotRow.end_time,
        slotId,
      )

      if (interviewerSlotConflict) {
        throw new PremiumSchedulingConflictError()
      }

      const deductionResult = await this.creditRepository.decrementCredits(
        this.queryExecutor,
        schedulerId,
        1,
      )

      if (deductionResult.rowCount === 0) {
        throw new PremiumInsufficientCreditsError()
      }

      const interviewId = this.createId()
      interviewIdForLog = interviewId
      const timestamp = this.now()
      const aliases = buildInterviewAliases('peer_to_peer')

      const createdInterview = await this.repository.insertClaimInterview(
        this.queryExecutor,
        {
          id: interviewId,
          schedulerId,
          schedulerAlias: aliases.schedulerAlias,
          interviewerId: slotRow.interviewer_id,
          interviewerAlias: aliases.interviewerAlias,
          type: slotRow.interview_type,
          mode: 'peer_to_peer',
          bookingChannel: 'verified_interviewer',
          tier: 'premium',
          status: 'scheduled',
          scheduledAt: slotRow.start_time,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      )

      const claimedSlot = await this.repository.claimSlot(
        this.queryExecutor,
        slotId,
        timestamp,
      )

      if (!claimedSlot) {
        throw new PremiumSlotAlreadyClaimedError()
      }

      await this.repository.insertClaim(this.queryExecutor, {
        idempotencyKey,
        slotId,
        schedulerId,
        interviewId,
        createdAt: timestamp,
      })

      await persistOutboxEvent(
        buildInterviewPremiumBookedEvent({
          interview: {
            id: interviewId,
            scheduler_id: schedulerId,
            interviewer_id: slotRow.interviewer_id,
            type: slotRow.interview_type,
            mode: 'peer_to_peer',
            booking_channel: 'verified_interviewer',
            tier: 'premium',
            status: 'scheduled',
            scheduled_at: slotRow.start_time,
          },
        }),
      )

      await this.queryExecutor.query(createSqlQuery('COMMIT;'))

      await this.logSafely('info', 'premium.claim_succeeded', {
        idempotency_key: idempotencyKey,
        slot_id: slotId,
        interview_id: interviewId,
        scheduler_id: schedulerId,
        interviewer_id: slotRow.interviewer_id,
      })

      return {
        interview: parseInterviewDetail(createdInterview),
        replayed: false,
      }
    } catch (error) {
      if (!isSerializationConflict(error)) {
        await this.logClaimError(error, {
          idempotencyKey,
          slotId,
          schedulerId,
          attempt,
          interviewerId: slotRowForLog?.interviewer_id,
          interviewId: interviewIdForLog ?? existingClaim?.interview_id,
        })
      }
      await rollbackTransactionSafely(this.queryExecutor)
      throw error
    }
  }

  getQueryExecutor(): SqlQueryExecutor {
    return this.queryExecutor
  }

  private validateWindowBounds(startTime: string): void {
    const startMs = new Date(startTime).getTime()
    const nowMs = new Date(this.now()).getTime()
    const leadTimeMs = this.policyConfig.leadTimeMinutes * 60 * 1000
    const horizonMs = this.policyConfig.horizonDays * 24 * 60 * 60 * 1000

    if (Number.isNaN(startMs)) {
      throw new PremiumDataIntegrityError('Slot start_time is not a valid timestamp.')
    }

    if (startMs < nowMs + leadTimeMs) {
      throw new PremiumSchedulingConflictError()
    }

    if (startMs > nowMs + horizonMs) {
      throw new PremiumSchedulingConflictError()
    }
  }

  private async logSafely(
    level: 'info' | 'error',
    event: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (level === 'info') {
        await this.logger.info(event, context)
      } else {
        await this.logger.error(event, context)
      }
    } catch {
      // Observability must never block the claim.
    }
  }

  private async logClaimError(
    error: unknown,
    context: {
      idempotencyKey: string
      slotId: string
      schedulerId: string
      attempt: number
      interviewerId?: string
      interviewId?: string
    },
  ): Promise<void> {
    const isBusinessConflict =
      error instanceof PremiumSlotAlreadyClaimedError ||
      error instanceof PremiumSchedulingConflictError ||
      error instanceof PremiumInterviewerIneligibleError ||
      error instanceof PremiumInsufficientCreditsError ||
      error instanceof PremiumIdempotencyKeyConflictError ||
      error instanceof PremiumSelfClaimError

    const logContext: Record<string, unknown> = {
      idempotency_key: context.idempotencyKey,
      slot_id: context.slotId,
      scheduler_id: context.schedulerId,
      retry_count: context.attempt,
      outcome: error instanceof Error ? error.message : 'Unknown error',
    }

    if (context.interviewerId) {
      logContext.interviewer_id = context.interviewerId
    }

    if (context.interviewId) {
      logContext.interview_id = context.interviewId
    }

    if (isBusinessConflict) {
      await this.logSafely('info', 'premium.claim_conflicted', logContext)
    } else {
      await this.logSafely('error', 'premium.claim_failed', logContext)
    }
  }
}
