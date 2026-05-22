import { createSqlQuery, type SqlQuery } from '../index'
import { buildInterviewAliases } from '../interview'
import type { NotificationOutboxEventRow } from '../notifications/notification-types'
import {
  parseMatcherCandidateRow,
  matcherCreatedInterviewSchema,
  parseMatcherLockedRequestRow,
  parseMatcherLockedSlotRow,
  type MatcherCandidateRow,
  type MatcherLockedRequestRow,
  type MatcherLockedSlotRow,
  type MatcherCreatedInterview,
  type MatcherPairAttempt,
  type MatchAttemptWriteDiagnostics,
  type MatchAttemptWriteSkipReason,
  type MatchAttemptWriteResult,
} from './types'

export type MatcherQueryResult<Row> = {
  rows: Row[]
}

export type MatcherQueryExecutor = {
  query<Row>(query: SqlQuery): Promise<MatcherQueryResult<Row>>
}

export type MatcherRepositoryLogger = {
  info(event: string, context: Record<string, unknown>): void | Promise<void>
  warn(event: string, context: Record<string, unknown>): void | Promise<void>
  error(event: string, context: Record<string, unknown>): void | Promise<void>
}

type MatchAttemptWriteResultWithoutDiagnostics =
  | {
      status: 'created'
      interviewId: string
      interview: MatcherCreatedInterview
    }
  | {
      status: 'skipped'
      reason: MatchAttemptWriteSkipReason
    }

type MatcherRepositoryDependencies = {
  createId?: () => string
  now?: () => string
  logger?: MatcherRepositoryLogger
  maxTransactionRetries?: number
  persistOutboxEvent?: (event: NotificationOutboxEventRow) => Promise<void>
}

export class MatcherRepository {
  private readonly createId: () => string

  private readonly now: () => string

  private readonly logger: MatcherRepositoryLogger

  private readonly maxTransactionRetries: number

  private readonly dependencies: MatcherRepositoryDependencies

  constructor(
    private readonly queryExecutor: MatcherQueryExecutor,
    dependencies: MatcherRepositoryDependencies = {},
  ) {
    this.dependencies = dependencies
    this.createId = dependencies.createId ?? createDefaultId
    this.now = dependencies.now ?? createDefaultNow
    this.logger = dependencies.logger ?? noOpMatcherRepositoryLogger
    this.maxTransactionRetries = Math.max(0, dependencies.maxTransactionRetries ?? 2)
  }

  async listCandidateRows(): Promise<MatcherCandidateRow[]> {
    const query = createSqlQuery(`
      SELECT
        requests.id AS request_id,
        requests.user_id AS request_user_id,
        requests.created_at AS request_created_at,
        requests.interview_type,
        slots.id AS slot_id,
        slots.start_time AS slot_start_time,
        slots.end_time AS slot_end_time
      FROM availability_slots AS slots
      INNER JOIN availability_requests AS requests
        ON requests.id = slots.request_id
      WHERE slots.status = 'available'
        AND requests.status = 'active'
        AND requests.current_matches < requests.max_matches
        AND slots.start_time > NOW()
      ORDER BY
        requests.created_at ASC,
        requests.id ASC,
        slots.start_time ASC,
        slots.id ASC;
    `)

    const result = await this.queryExecutor.query<MatcherCandidateRow>(query)

    return result.rows.map(function parseCandidateRow(row) {
      return parseMatcherCandidateRow(row)
    })
  }

  async executePairAttemptTransaction(
    pairAttempt: MatcherPairAttempt,
    buildOutboxEvent?: (interview: MatcherCreatedInterview) => NotificationOutboxEventRow,
  ): Promise<MatchAttemptWriteResult> {
    const diagnostics: MatchAttemptWriteDiagnostics = {
      transactionConflicts: 0,
      transactionRetries: 0,
    }

    for (
      let transactionAttempt = 1;
      transactionAttempt <= this.maxTransactionRetries + 1;
      transactionAttempt += 1
    ) {
      try {
        const result = await this.executePairAttemptTransactionOnce(pairAttempt, buildOutboxEvent)

        if (result.status === 'created') {
          return {
            status: 'created',
            interviewId: result.interviewId,
            interview: result.interview,
            diagnostics,
          }
        }

        return {
          status: 'skipped',
          reason: result.reason,
          diagnostics,
        }
      } catch (error) {
        const isTransactionConflict = isRetryableTransactionConflict(error)

        if (!isTransactionConflict) {
          await this.logSafely('error', 'matcher.transaction.failure', {
            attempt_key: pairAttempt.attempt_key,
            slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
            request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
            transaction_attempt: transactionAttempt,
            error_code: extractErrorCode(error),
            error_message: extractErrorMessage(error),
          })
          throw error
        }

        diagnostics.transactionConflicts += 1

        await this.logSafely('warn', 'matcher.transaction.conflict', {
          attempt_key: pairAttempt.attempt_key,
          slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
          request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
          transaction_attempt: transactionAttempt,
          max_transaction_attempts: this.maxTransactionRetries + 1,
          error_code: extractErrorCode(error),
          error_message: extractErrorMessage(error),
        })

        if (transactionAttempt <= this.maxTransactionRetries) {
          diagnostics.transactionRetries += 1

          await this.logSafely('info', 'matcher.transaction.retry', {
            attempt_key: pairAttempt.attempt_key,
            slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
            request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
            retry_number: diagnostics.transactionRetries,
            next_transaction_attempt: transactionAttempt + 1,
          })
          continue
        }

        await this.logSafely('warn', 'matcher.transaction.conflict_exhausted', {
          attempt_key: pairAttempt.attempt_key,
          slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
          request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
          transaction_attempt: transactionAttempt,
          max_transaction_attempts: this.maxTransactionRetries + 1,
        })

        return {
          status: 'skipped',
          reason: 'transaction_conflict',
          diagnostics,
        }
      }
    }

    throw new Error('unreachable matcher transaction retry state')
  }

  private async executePairAttemptTransactionOnce(
    pairAttempt: MatcherPairAttempt,
    buildOutboxEvent?: (interview: MatcherCreatedInterview) => NotificationOutboxEventRow,
  ): Promise<MatchAttemptWriteResultWithoutDiagnostics> {
    await this.queryExecutor.query(createSqlQuery('BEGIN;'))

    let interviewIdForFailureContext: string | undefined

    try {
      const lockedSlots = await this.lockSlotsForAttempt(pairAttempt)

      if (lockedSlots.length !== 2) {
        await this.queryExecutor.query(createSqlQuery('COMMIT;'))
        return { status: 'skipped', reason: 'slots_not_found' }
      }

      const lockedRequests = await this.lockRequestsForAttempt(pairAttempt)

      if (lockedRequests.length !== 2) {
        await this.queryExecutor.query(createSqlQuery('COMMIT;'))
        return { status: 'skipped', reason: 'requests_not_found' }
      }

      const eligibilityError = this.findEligibilityError(
        lockedSlots,
        lockedRequests,
      )

      if (eligibilityError) {
        await this.queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          status: 'skipped',
          reason: eligibilityError,
        }
      }

      const nowTimestamp = this.now()
      const interviewId = this.createId()
      interviewIdForFailureContext = interviewId
      const roleAssignment = assignDeterministicRoles(lockedRequests)
      const aliases = buildInterviewAliases('peer_to_peer')
      const scheduledAt = selectScheduledAtFromLockedSlots(lockedSlots)
      const createdInterview = matcherCreatedInterviewSchema.parse({
        id: interviewId,
        scheduler_id: roleAssignment.schedulerId,
        interviewer_id: roleAssignment.interviewerId,
        type: roleAssignment.interviewType,
        mode: 'peer_to_peer',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: scheduledAt,
      })

      await this.queryExecutor.query(
        createSqlQuery(
          `
            INSERT INTO interviews (
              id,
              scheduler_id,
              scheduler_alias,
              interviewer_id,
              interviewer_alias,
              type,
              mode,
              tier,
              status,
              scheduled_at,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'peer_to_peer', 'standard', 'scheduled', $7, $8, $8);
          `,
          [
            interviewId,
            createdInterview.scheduler_id,
            aliases.schedulerAlias,
            createdInterview.interviewer_id,
            aliases.interviewerAlias,
            createdInterview.type,
            createdInterview.scheduled_at,
            nowTimestamp,
          ],
        ),
      )

      await this.queryExecutor.query(
        createSqlQuery(
          `
            UPDATE availability_slots
            SET status = 'matched',
                updated_at = $2
            WHERE id = ANY($1::uuid[]);
          `,
          [
            lockedSlots.map(function mapSlotToId(slot) {
              return slot.id
            }),
            nowTimestamp,
          ],
        ),
      )

      await this.queryExecutor.query(
        createSqlQuery(
          `
            UPDATE availability_requests
            SET current_matches = current_matches + 1,
                updated_at = $2
            WHERE id = ANY($1::uuid[]);
          `,
          [
            lockedRequests.map(function mapRequestToId(request) {
              return request.id
            }),
            nowTimestamp,
          ],
        ),
      )

      if (buildOutboxEvent && this.dependencies.persistOutboxEvent) {
        const outboxEvent = buildOutboxEvent(createdInterview)
        await this.dependencies.persistOutboxEvent(outboxEvent)
      }

      await this.queryExecutor.query(createSqlQuery('COMMIT;'))

      return {
        status: 'created',
        interviewId,
        interview: createdInterview,
      }
    } catch (error) {
      const rollbackSucceeded = await this.rollbackTransactionSafely()

      if (!isRetryableTransactionConflict(error)) {
        await this.logSafely('error', 'matcher.transaction.rollback', {
          attempt_key: pairAttempt.attempt_key,
          slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
          request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
          interview_id: interviewIdForFailureContext,
          rollback_succeeded: rollbackSucceeded,
          error_code: extractErrorCode(error),
          error_message: extractErrorMessage(error),
        })
      }

      throw error
    }
  }

  private async logSafely(
    level: 'info' | 'warn' | 'error',
    event: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.logger[level](event, context)
    } catch {
      // no-op: observability must not break matcher reliability
    }
  }

  private async lockSlotsForAttempt(
    pairAttempt: MatcherPairAttempt,
  ): Promise<MatcherLockedSlotRow[]> {
    const slotIds = sortDistinctIds([
      pairAttempt.left.slot_id,
      pairAttempt.right.slot_id,
    ])

    const lockedSlots: MatcherLockedSlotRow[] = []

    for (const slotId of slotIds) {
      const result = await this.queryExecutor.query<MatcherLockedSlotRow>(
        createSqlQuery(
          `
            SELECT
              id,
              request_id,
              start_time,
              end_time,
              status
            FROM availability_slots
            WHERE id = $1
            FOR UPDATE;
          `,
          [slotId],
        ),
      )

      const [slotRow] = result.rows

      if (!slotRow) {
        continue
      }

      lockedSlots.push(parseMatcherLockedSlotRow(slotRow))
    }

    return lockedSlots
  }

  private async lockRequestsForAttempt(
    pairAttempt: MatcherPairAttempt,
  ): Promise<MatcherLockedRequestRow[]> {
    const requestIds = sortDistinctIds([
      pairAttempt.left.request_id,
      pairAttempt.right.request_id,
    ])

    const lockedRequests: MatcherLockedRequestRow[] = []

    for (const requestId of requestIds) {
      const result = await this.queryExecutor.query<MatcherLockedRequestRow>(
        createSqlQuery(
          `
            SELECT
              id,
              user_id,
              created_at,
              current_matches,
              max_matches,
              interview_type,
              status
            FROM availability_requests
            WHERE id = $1
            FOR UPDATE;
          `,
          [requestId],
        ),
      )

      const [requestRow] = result.rows

      if (!requestRow) {
        continue
      }

      lockedRequests.push(parseMatcherLockedRequestRow(requestRow))
    }

    return lockedRequests
  }

  private findEligibilityError(
    lockedSlots: readonly MatcherLockedSlotRow[],
    lockedRequests: readonly MatcherLockedRequestRow[],
  ): MatchAttemptWriteSkipReason | undefined {
    const hasUnavailableSlot = lockedSlots.some(function hasUnavailableStatus(slot) {
      return slot.status !== 'available'
    })

    if (hasUnavailableSlot) {
      return 'slot_not_available'
    }

    const hasInactiveRequest = lockedRequests.some(function hasInactiveStatus(request) {
      return request.status !== 'active'
    })

    if (hasInactiveRequest) {
      return 'request_not_active'
    }

    const hasQuotaReached = lockedRequests.some(function hasReachedQuota(request) {
      return request.current_matches >= request.max_matches
    })

    if (hasQuotaReached) {
      return 'request_quota_reached'
    }

    const [firstRequest, secondRequest] = lockedRequests

    if (!firstRequest || !secondRequest) {
      return 'requests_not_found'
    }

    if (firstRequest.user_id === secondRequest.user_id) {
      return 'users_not_distinct'
    }

    if (firstRequest.interview_type !== secondRequest.interview_type) {
      return 'interview_type_mismatch'
    }

    return undefined
  }

  private async rollbackTransactionSafely(): Promise<boolean> {
    try {
      await this.queryExecutor.query(createSqlQuery('ROLLBACK;'))
      return true
    } catch {
      // no-op: preserve original query error
      return false
    }
  }
}

const noOpMatcherRepositoryLogger: MatcherRepositoryLogger = {
  info: async function infoNoOp() {
    return undefined
  },
  warn: async function warnNoOp() {
    return undefined
  },
  error: async function errorNoOp() {
    return undefined
  },
}

type DeterministicRoleAssignment = {
  schedulerId: string
  interviewerId: string
  interviewType: MatcherLockedRequestRow['interview_type']
}

function isRetryableTransactionConflict(error: unknown): boolean {
  const errorCode = extractErrorCode(error)

  return errorCode === '40001' || errorCode === '40P01'
}

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const potentialCode = Reflect.get(error, 'code')

  return typeof potentialCode === 'string' ? potentialCode : undefined
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function assignDeterministicRoles(
  lockedRequests: readonly MatcherLockedRequestRow[],
): DeterministicRoleAssignment {
  const [firstRequest, secondRequest] = [...lockedRequests].sort(
    compareRequestsForRoleAssignment,
  )

  if (!firstRequest || !secondRequest) {
    throw new Error('Expected two locked requests for role assignment')
  }

  return {
    schedulerId: firstRequest.user_id,
    interviewerId: secondRequest.user_id,
    interviewType: firstRequest.interview_type,
  }
}

function compareRequestsForRoleAssignment(
  leftRequest: MatcherLockedRequestRow,
  rightRequest: MatcherLockedRequestRow,
): number {
  const createdAtComparison =
    Date.parse(leftRequest.created_at) - Date.parse(rightRequest.created_at)

  if (createdAtComparison !== 0) {
    return createdAtComparison
  }

  return leftRequest.id.localeCompare(rightRequest.id)
}

function selectScheduledAtFromLockedSlots(
  lockedSlots: readonly MatcherLockedSlotRow[],
): string {
  const [firstSlot, secondSlot] = lockedSlots

  if (!firstSlot || !secondSlot) {
    throw new Error('Expected two locked slots for schedule selection')
  }

  const firstStart = Date.parse(firstSlot.start_time)
  const secondStart = Date.parse(secondSlot.start_time)

  return firstStart >= secondStart ? firstSlot.start_time : secondSlot.start_time
}

function sortDistinctIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort(function compareIds(leftId, rightId) {
    return leftId.localeCompare(rightId)
  })
}

function createDefaultId(): string {
  return crypto.randomUUID()
}

function createDefaultNow(): string {
  return new Date().toISOString()
}
