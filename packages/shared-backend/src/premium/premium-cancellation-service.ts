import { createSqlQuery, type SqlQueryExecutor } from '../index'
import { buildInterviewCancelledEvent } from '../notification-queue-event-contract'
import {
  PremiumConflictError,
  PremiumForbiddenError,
  PremiumNotFoundError,
} from './premium-errors'
import {
  PremiumCancellationRepository,
  type PremiumCancellationInterviewRow,
  type PremiumCancellationInterviewSnapshotRow,
} from './premium-cancellation-repository'
import { isSerializationConflict, rollbackTransactionSafely } from './premium-utils'

export type CancellationSource = 'scheduler' | 'interviewer'

export type PremiumCancellationServiceLogger = {
  info(event: string, context: Record<string, unknown>): void | Promise<void>
  error(event: string, context: Record<string, unknown>): void | Promise<void>
}

const noOpPremiumCancellationLogger: PremiumCancellationServiceLogger = {
  info: function logInfo() {},
  error: function logError() {},
}

export type CancelPremiumInterviewResult =
  | { outcome: 'cancelled' }
  | { outcome: 'already_cancelled' }
  | { outcome: 'invalid_status' }

type CancelUpcomingInterviewsResult = {
  outcome: 'cancelled'
  count: number
}

type PersistOutboxEvent = (event: unknown) => Promise<void>

type PremiumIdFactory = () => string
type PremiumNowFactory = () => string

const defaultCreateId: PremiumIdFactory = function createRandomId() {
  return crypto.randomUUID()
}

const defaultNow: PremiumNowFactory = function createNow() {
  return new Date().toISOString()
}

export class PremiumCancellationService {
  constructor(
    private readonly repository: PremiumCancellationRepository,
    private readonly queryExecutor: SqlQueryExecutor,
    private readonly createId: PremiumIdFactory = defaultCreateId,
    private readonly now: PremiumNowFactory = defaultNow,
    private readonly logger: PremiumCancellationServiceLogger = noOpPremiumCancellationLogger,
  ) {}

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
      // Observability must never block cancellation.
    }
  }

  async cancelInterview(input: {
    interviewId: string
    source: CancellationSource
    initiatedByUserId: string
    persistOutboxEvent: PersistOutboxEvent
  }): Promise<CancelPremiumInterviewResult> {
    const { interviewId, source, initiatedByUserId, persistOutboxEvent } = input
    const maxAttempts = 3

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await this.queryExecutor.query(createSqlQuery('BEGIN;'))
        const result = await this.cancelInterviewAttempt({
          interviewId,
          source,
          initiatedByUserId,
          persistOutboxEvent,
        })
        await this.queryExecutor.query(createSqlQuery('COMMIT;'))
        return result
      } catch (error) {
        await rollbackTransactionSafely(this.queryExecutor)

        if (attempt < maxAttempts - 1 && (isSerializationConflict(error) || isParticipantChangedError(error))) {
          await this.logSafely('info', 'premium.cancellation_retry', {
            interview_id: interviewId,
            source,
            attempt: attempt + 1,
            max_attempts: maxAttempts,
          })
          continue
        }

        if (isSerializationConflict(error) || isParticipantChangedError(error)) {
          await this.logSafely('error', 'premium.cancellation_conflict_exhausted', {
            interview_id: interviewId,
            source,
          })
          throw new PremiumConflictError(
            'Cancellation transaction conflicts exhausted after retries. Please retry.',
          )
        }

        throw error
      }
    }

    throw new Error('Unexpected cancellation state.')
  }

  private async cancelInterviewAttempt(input: {
    interviewId: string
    source: CancellationSource
    initiatedByUserId: string
    persistOutboxEvent: PersistOutboxEvent
  }): Promise<CancelPremiumInterviewResult> {
    const { interviewId, source, initiatedByUserId, persistOutboxEvent } = input

    const initialInterview = await this.repository.getInterviewForCancel(
      this.queryExecutor,
      interviewId,
    )

    if (!initialInterview) {
      throw new PremiumNotFoundError()
    }

    if (initialInterview.status === 'cancelled') {
      return { outcome: 'already_cancelled' }
    }

    if (initialInterview.status !== 'scheduled') {
      return { outcome: 'invalid_status' }
    }

    if (source === 'interviewer' && initialInterview.interviewer_id !== initiatedByUserId) {
      throw new PremiumForbiddenError()
    }

    if (source === 'scheduler' && initialInterview.scheduler_id !== initiatedByUserId) {
      throw new PremiumForbiddenError()
    }

    const initialParticipantUserIds = [
      initialInterview.scheduler_id,
      initialInterview.interviewer_id,
    ]
      .filter(function isPresent(userId): userId is string {
        return userId !== null
      })
      .sort()

    await this.repository.lockUsersForUpdate(this.queryExecutor, initialParticipantUserIds)

    const lockedInterview = await this.repository.lockInterviewForUpdate(
      this.queryExecutor,
      interviewId,
    )

    if (!lockedInterview) {
      throw new PremiumNotFoundError()
    }

    if (lockedInterview.status === 'cancelled') {
      return { outcome: 'already_cancelled' }
    }

    if (lockedInterview.status !== 'scheduled') {
      return { outcome: 'invalid_status' }
    }

    const lockedParticipantUserIds = [
      lockedInterview.scheduler_id,
      lockedInterview.interviewer_id,
    ]
      .filter(function isPresent(userId): userId is string {
        return userId !== null
      })
      .sort()

    if (!arraysEqual(initialParticipantUserIds, lockedParticipantUserIds)) {
      throw new ParticipantChangedError()
    }

    if (source === 'interviewer' && lockedInterview.interviewer_id !== initiatedByUserId) {
      throw new PremiumForbiddenError()
    }

    if (source === 'scheduler' && lockedInterview.scheduler_id !== initiatedByUserId) {
      throw new PremiumForbiddenError()
    }

    const refundApplies =
      lockedInterview.booking_channel === 'verified_interviewer' && source === 'interviewer'

    const cancelledRow = await this.repository.cancelInterviewIfScheduled(
      this.queryExecutor,
      interviewId,
      this.now(),
    )

    if (!cancelledRow) {
      const reReadInterview = await this.repository.lockInterviewForUpdate(
        this.queryExecutor,
        interviewId,
      )
      const reReadStatus = reReadInterview?.status
      return {
        outcome:
          reReadStatus === 'cancelled' ? 'already_cancelled' : 'invalid_status',
      }
    }

    if (refundApplies) {
      const interviewerId = cancelledRow.interviewer_id

      try {
        if (interviewerId === null) {
          throw new Error(
            'Verified interviewer cancellation is missing interviewer identity.',
          )
        }

        const refundRow = await this.repository.insertRefundRow(this.queryExecutor, {
          id: this.createId(),
          interviewId: cancelledRow.id,
          schedulerId: cancelledRow.scheduler_id,
          reason: 'interviewer_cancelled',
          initiatedByUserId: interviewerId,
          createdAt: this.now(),
        })

        if (!refundRow) {
          throw new Error('Refund row already exists for this interview.')
        }

        const creditedScheduler = await this.repository.incrementSchedulerCredits(
          this.queryExecutor,
          cancelledRow.scheduler_id,
          this.now(),
        )

        if (!creditedScheduler) {
          throw new Error('Failed to increment scheduler credits.')
        }

        await this.logSafely('info', 'premium.booking_refund_succeeded', {
          interview_id: cancelledRow.id,
          scheduler_id: cancelledRow.scheduler_id,
          source,
          refund_reason: 'interviewer_cancelled',
        })
      } catch (error) {
        await this.logSafely('error', 'premium.booking_refund_failed', {
          interview_id: cancelledRow.id,
          scheduler_id: cancelledRow.scheduler_id,
          source,
          error_message: toErrorMessage(error),
        })
        throw error
      }
    }

    await persistOutboxEvent(
      buildInterviewCancelledEvent({
        interview: toCancelledInterviewEventInput(cancelledRow),
      }),
    )

    await this.logSafely('info', 'premium.cancellation_succeeded', {
      interview_id: cancelledRow.id,
      scheduler_id: cancelledRow.scheduler_id,
      source,
      booking_channel: cancelledRow.booking_channel,
    })

    return { outcome: 'cancelled' }
  }

  async cancelUpcomingInterviewsForUser(input: {
    userId: string
    persistOutboxEvent: PersistOutboxEvent
    softDeleteAccount?: (queryExecutor: SqlQueryExecutor) => Promise<void>
  }): Promise<CancelUpcomingInterviewsResult> {
    const maxAttempts = 3

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await this.queryExecutor.query(createSqlQuery('BEGIN;'))
        const result = await this.cancelUpcomingInterviewsAttempt(input)
        await this.queryExecutor.query(createSqlQuery('COMMIT;'))
        return result
      } catch (error) {
        await rollbackTransactionSafely(this.queryExecutor)

        if (attempt < maxAttempts - 1 && isParticipantUnionExpansionError(error)) {
          await this.logSafely('info', 'premium.cancellation_union_retry', {
            user_id: input.userId,
            attempt: attempt + 1,
            max_attempts: maxAttempts,
          })
          continue
        }

        if (isParticipantUnionExpansionError(error)) {
          await this.logSafely('error', 'premium.cancellation_union_conflict_exhausted', {
            user_id: input.userId,
          })
        }

        throw error
      }
    }

    throw new Error('Unexpected account cancellation state.')
  }

  private async cancelUpcomingInterviewsAttempt(input: {
    userId: string
    persistOutboxEvent: PersistOutboxEvent
    softDeleteAccount?: (queryExecutor: SqlQueryExecutor) => Promise<void>
  }): Promise<CancelUpcomingInterviewsResult> {
    const { userId, persistOutboxEvent, softDeleteAccount } = input

    const initialRows = await this.repository.listAllUpcomingInterviewsForUser(
      this.queryExecutor,
      userId,
    )
    const initialIds = new Set<string>(
      initialRows.map(function rowId(row) {
        return row.id
      }),
    )

    const participantUnion = new Set<string>([userId])
    for (const row of initialRows) {
      participantUnion.add(row.scheduler_id)
      if (row.interviewer_id !== null) {
        participantUnion.add(row.interviewer_id)
      }
    }
    const sortedParticipantUnion = Array.from(participantUnion).sort()

    await this.repository.lockUsersForUpdate(
      this.queryExecutor,
      sortedParticipantUnion,
    )

    const requeriedRows = await this.repository.listAllUpcomingInterviewsForUser(
      this.queryExecutor,
      userId,
    )

    const requeriedIds = requeriedRows.map(function rowId(row) {
      return row.id
    })

    const lockedRows = await this.repository.lockInterviewsForUpdate(
      this.queryExecutor,
      requeriedIds,
    )
    const lockedRowsById = new Map(
      lockedRows.map(function indexById(row) {
        return [row.id, row] as const
      }),
    )

    for (const requeriedId of requeriedIds) {
      if (!lockedRowsById.has(requeriedId)) {
        throw new Error(
          'A scheduled interview disappeared during account cancellation.',
        )
      }
    }

    for (const row of lockedRows) {
      if (!initialIds.has(row.id)) {
        throw new ParticipantUnionExpansionError(sortedParticipantUnion)
      }

      if (!participantUnion.has(row.scheduler_id)) {
        throw new ParticipantUnionExpansionError(sortedParticipantUnion)
      }

      if (row.interviewer_id !== null && !participantUnion.has(row.interviewer_id)) {
        throw new ParticipantUnionExpansionError(sortedParticipantUnion)
      }
    }

    const timestamp = this.now()
    let count = 0

    for (const row of lockedRows) {
      if (row.status !== 'scheduled') {
        continue
      }

      const source = determineDeletingUserSource(row, userId)

      if (source === null) {
        continue
      }

      const cancelledRow = await this.repository.cancelInterviewIfScheduled(
        this.queryExecutor,
        row.id,
        timestamp,
      )

      if (!cancelledRow) {
        continue
      }

      count += 1

      await persistOutboxEvent(
        buildInterviewCancelledEvent({
          interview: toCancelledInterviewEventInput(cancelledRow),
        }),
      )

      if (cancelledRow.booking_channel === 'verified_interviewer' && source === 'interviewer') {
        const refundRow = await this.repository.insertRefundRow(this.queryExecutor, {
          id: this.createId(),
          interviewId: cancelledRow.id,
          schedulerId: cancelledRow.scheduler_id,
          reason: 'interviewer_account_deleted',
          initiatedByUserId: userId,
          createdAt: timestamp,
        })

        if (!refundRow) {
          throw new Error('Refund row already exists for this interview.')
        }

        const creditedScheduler = await this.repository.incrementSchedulerCredits(
          this.queryExecutor,
          cancelledRow.scheduler_id,
          timestamp,
        )

        if (!creditedScheduler) {
          throw new Error('Failed to increment scheduler credits.')
        }
      }
    }

    if (softDeleteAccount) {
      await softDeleteAccount(this.queryExecutor)
    }

    return { outcome: 'cancelled', count }
  }
}

class ParticipantChangedError extends Error {
  constructor() {
    super('Interview participants changed during cancellation.')
    this.name = 'ParticipantChangedError'
  }
}

class ParticipantUnionExpansionError extends Error {
  constructor(union: string[]) {
    super(
      `Interview participant set expanded beyond the snapshot union during account cancellation: ${union.join(', ')}`,
    )
    this.name = 'ParticipantUnionExpansionError'
  }
}

function determineDeletingUserSource(
  row: PremiumCancellationInterviewSnapshotRow,
  userId: string,
): CancellationSource | null {
  if (row.scheduler_id === userId) {
    return 'scheduler'
  }

  if (row.interviewer_id === userId) {
    return 'interviewer'
  }

  return null
}

function toCancelledInterviewEventInput(
  row: PremiumCancellationInterviewRow,
): {
  id: string
  scheduler_id: string
  interviewer_id: string | null
  type: PremiumCancellationInterviewRow['type']
  mode: PremiumCancellationInterviewRow['mode']
  tier: PremiumCancellationInterviewRow['tier']
  status: 'cancelled'
  scheduled_at: string
  booking_channel: PremiumCancellationInterviewRow['booking_channel']
} {
  return {
    id: row.id,
    scheduler_id: row.scheduler_id,
    interviewer_id: row.interviewer_id,
    type: row.type,
    mode: row.mode,
    tier: row.tier,
    status: 'cancelled',
    scheduled_at: row.scheduled_at,
    booking_channel: row.booking_channel,
  }
}

function isParticipantUnionExpansionError(error: unknown): boolean {
  return error instanceof ParticipantUnionExpansionError
}

function isParticipantChangedError(error: unknown): boolean {
  return error instanceof ParticipantChangedError
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
