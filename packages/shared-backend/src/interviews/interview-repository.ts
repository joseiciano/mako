import { bookingChannelSelect } from '../premium/booking-channel-sql'
import type {
  Interview,
  InterviewCancellationReason,
  InterviewDetail,
  InterviewListItem,
} from '@mako/shared'
import { createSqlQuery, type SqlQuery, type SqlQueryExecutor, type QueryResult } from '../index'
import type { NotificationQueueEvent } from '../notification-queue-event-contract'
import { CreditRepository } from '../credit/credit-repository'
import {
  cancelInterviewRecordInputSchema,
  getParticipantInterviewByIdInputSchema,
  InterviewPolicyConflictError,
  lifecycleInterviewRecordInputSchema,
  listParticipantInterviewsInputSchema,
  authenticatedInterviewUserIdSchema,
  createInterviewRecordInputSchema,
  interviewAccountPolicySchema,
  parseInterview,
  parseInterviewDetail,
  parseInterviewListItem,
  provisionInterviewRecordInputSchema,
  type CancelInterviewRecordInput,
  type CancelInterviewRecordResult,
  type CreateInterviewRecordInput,
  type GetParticipantInterviewByIdInput,
  type InterviewAccountPolicy,
  type LifecycleInterviewRecordInput,
  type LifecycleInterviewRecordResult,
  type ListParticipantInterviewsInput,
  type ParsedListParticipantInterviewsInput,
  type ProvisionInterviewRecordInput,
  type ProvisionInterviewRecordResult,
} from './types'
import { TierPolicyService, InsufficientCreditsError } from '../tier-policy'
import {
  computeInterviewEndTime,
  findInterviewOverlap,
  findPremiumSlotOverlap,
} from '../premium/premium-overlap-helper'


export interface InterviewRepositoryDataSource {
  getAccountPolicy(userId: string): Promise<InterviewAccountPolicy | null>
  createDirectInterview(input: CreateInterviewRecordInput, outboxEvent?: NotificationQueueEvent): Promise<Interview>
  getInterviewById?(id: string): Promise<Interview | null>
  getInterviewFeedbackState?(id: string): Promise<InterviewFeedbackState | null>
  getParticipantInterviewById?(
    input: GetParticipantInterviewByIdInput,
  ): Promise<InterviewDetail | null>
  listParticipantInterviews?(
    input: ListParticipantInterviewsInput,
  ): Promise<InterviewListItem[]>
  cancelInterview?(
    input: CancelInterviewRecordInput,
  ): Promise<CancelInterviewRecordResult>
  provisionInterview?(
    input: ProvisionInterviewRecordInput,
  ): Promise<ProvisionInterviewRecordResult>
  transitionInterviewLifecycle?(
    input: LifecycleInterviewRecordInput,
    outboxEvent?: NotificationQueueEvent,
  ): Promise<LifecycleInterviewRecordResult>
}

export type InterviewFeedbackState = {
  id: string
  status: Interview['status']
  recording_status: InterviewDetail['recording_status']
  feedback_status: InterviewDetail['feedback_status']
  feedback_unavailable_reason: InterviewDetail['feedback_unavailable_reason']
  screenshots_finalized_at: InterviewDetail['screenshots_finalized_at']
  type: Interview['type']
  mode: Interview['mode']
  tier: Interview['tier']
  scheduler_alias: Interview['scheduler_alias']
}

export type InMemoryInterviewAccountRecord = {
  userId: string
  credits: number
  freeStandardInterviews: number
  freeAiInterviews: number
}

type InterviewRepositoryDependencies = {
  dataSource?: InterviewRepositoryDataSource
  queryExecutor?: SqlQueryExecutor
  persistOutboxEvent?: (event: NotificationQueueEvent) => Promise<void>
}

type InterviewRepositoryConstructorInput =
  | InterviewRepositoryDataSource
  | SqlQueryExecutor
  | InterviewRepositoryDependencies

type ProvisionInterviewCredentialFactoryInput = {
  interview: Interview
}

type ProvisionInterviewCredentialFactory = (
  input: ProvisionInterviewCredentialFactoryInput,
) => Promise<{
  realtime_session_id: string
  excalidraw_room_id: string
  excalidraw_key: string
}>

type ProvisionInterviewWithCredentialFactoryInput = Pick<
  ProvisionInterviewRecordInput,
  'interview_id' | 'participant_user_id' | 'updated_at'
>

export class InterviewRepository {
  private readonly dependencies: InterviewRepositoryDependencies

  constructor(input: InterviewRepositoryConstructorInput) {
    if (isDataSource(input)) {
      this.dependencies = { dataSource: input }
      return
    }

    if (isQueryExecutor(input)) {
      this.dependencies = { queryExecutor: input }
      return
    }

    this.dependencies = input
  }

  async getAccountPolicy(userId: string): Promise<InterviewAccountPolicy | null> {
    const authenticatedUserId = authenticatedInterviewUserIdSchema.parse(userId)
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.getAccountPolicy(authenticatedUserId)
    }

    const result = await this.getQueryExecutor().query<InterviewAccountPolicy>(
      createSqlQuery(
        `
          SELECT credits, free_standard_interviews, free_ai_interviews
          FROM "user"
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1;
        `,
        [authenticatedUserId],
      ),
    )

    const [row] = result.rows

    if (!row) {
      return null
    }

    return interviewAccountPolicySchema.parse(row)
  }

  async createDirectInterview(
    input: CreateInterviewRecordInput,
    outboxEvent?: NotificationQueueEvent,
    tierPolicyService?: TierPolicyService,
  ): Promise<Interview> {
    const parsedInput = createInterviewRecordInputSchema.parse(input)
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.createDirectInterview(parsedInput, outboxEvent)
    }

    const queryExecutor = this.getQueryExecutor()
    const creditRepository = new CreditRepository(queryExecutor)

    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const lockResult = await queryExecutor.query<InterviewAccountPolicy>(
        createSqlQuery(
          `
            SELECT credits, free_standard_interviews, free_ai_interviews
            FROM "user"
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE;
          `,
          [parsedInput.scheduler_id],
        ),
      )

      if (!hasRows(lockResult)) {
        throw new InterviewPolicyConflictError('Account state is unavailable.')
      }

      // Cross-channel overlap protocol: reject overlapping interviews or premium slots
      const overlapEndTime = computeInterviewEndTime(parsedInput.scheduled_at)
      const interviewOverlap = await findInterviewOverlap(
        queryExecutor,
        parsedInput.scheduler_id,
        parsedInput.scheduled_at,
        overlapEndTime,
      )
      if (interviewOverlap) {
        throw new InterviewPolicyConflictError(
          'The requested time conflicts with an existing scheduled interview.',
        )
      }
      const premiumSlotOverlap = await findPremiumSlotOverlap(
        queryExecutor,
        parsedInput.scheduler_id,
        parsedInput.scheduled_at,
        overlapEndTime,
      )
      if (premiumSlotOverlap) {
        throw new InterviewPolicyConflictError(
          'The requested time conflicts with an existing premium availability slot.',
        )
      }

      // Re-resolve policy inside the locked transaction if tierPolicyService provided
      if (tierPolicyService) {
        const [lockedAccount] = lockResult.rows
        const resolved = tierPolicyService.resolveAiInterviewCreatePolicy({
          free_ai_interviews: lockedAccount.free_ai_interviews,
          credits: lockedAccount.credits,
        })
        parsedInput.tier = resolved.tier
        parsedInput.policy_consumption = resolved.consumption
        // Sync outbox event tier to match resolution
        if (outboxEvent && 'interview' in outboxEvent) {
          ;(outboxEvent.interview as Record<string, unknown>).tier = resolved.tier
        }
      }

      if (parsedInput.policy_consumption === 'free_ai_interview') {
        const reservationResult = await queryExecutor.query<{ id: string }>(
          createSqlQuery(
            `
              UPDATE "user"
              SET free_ai_interviews = free_ai_interviews - 1,
                  "updatedAt" = NOW()
              WHERE id = $1
                AND deleted_at IS NULL
                AND free_ai_interviews > 0
              RETURNING id;
            `,
            [parsedInput.scheduler_id],
          ),
        )

        if (!hasRows(reservationResult)) {
          throw new InterviewPolicyConflictError()
        }
      }

      if (parsedInput.policy_consumption === 'credit') {
        const decrementResult = await creditRepository.decrementCredits(
          queryExecutor,
          parsedInput.scheduler_id,
          1,
        )

        if (decrementResult.rowCount === 0) {
          throw new InterviewPolicyConflictError()
        }
      }

      const insertResult = await queryExecutor.query<Interview>(
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
              booking_channel,
              tier,
              status,
              scheduled_at,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING
              id,
              scheduler_id,
              scheduler_alias,
              interviewer_id,
              interviewer_alias,
              type,
              mode,
              booking_channel,
              tier,
              status,
              scheduled_at,
              realtime_session_id,
              excalidraw_room_id,
              excalidraw_key,
              recording_url,
              screenshot_urls,
              feedback,
              recording_status,
              transcript,
              feedback_status,
              feedback_unavailable_reason,
              feedback_error_code,
              feedback_prompt_version,
              feedback_generated_at,
              started_at,
              expires_at,
              warning_at,
              created_at,
              updated_at;
          `,
          [
            parsedInput.id,
            parsedInput.scheduler_id,
            parsedInput.scheduler_alias,
            parsedInput.interviewer_id,
            parsedInput.interviewer_alias,
            parsedInput.type,
            parsedInput.mode,
            'ai_direct',
            parsedInput.tier,
            parsedInput.status,
            parsedInput.scheduled_at,
            parsedInput.created_at,
            parsedInput.updated_at,
          ],
        ),
      )

      const [createdInterview] = insertResult.rows

      if (!createdInterview) {
        throw new Error('Failed to insert interview record.')
      }

      if (outboxEvent && this.dependencies.persistOutboxEvent) {
        await this.dependencies.persistOutboxEvent(outboxEvent)
      }

      await queryExecutor.query(createSqlQuery('COMMIT;'))
      return mergeDetailProcessingState(
        parseInterview(createdInterview),
        createdInterview as InterviewWithDetailState,
      )
    } catch (error) {
      await rollbackTransactionSafely(queryExecutor)
      throw error
    }
  }

  async listParticipantInterviews(
    input: ListParticipantInterviewsInput,
  ): Promise<InterviewListItem[]> {
    const parsedInput = listParticipantInterviewsInputSchema.parse(input)
    const dataSource = this.dependencies.dataSource

    if (typeof dataSource?.listParticipantInterviews === 'function') {
      return dataSource.listParticipantInterviews(parsedInput)
    }

    const result = await this.getQueryExecutor().query<InterviewListItem>(
      buildListParticipantInterviewsQuery(parsedInput),
    )

    return result.rows.map(function parseInterviewRow(row) {
      return parseInterviewListItem(row)
    })
  }

  async getInterviewById(id: string): Promise<Interview | null> {
    const dataSource = this.dependencies.dataSource

    if (dataSource && 'getInterviewById' in dataSource) {
      return (dataSource as InterviewRepositoryDataSource & { getInterviewById(id: string): Promise<Interview | null> }).getInterviewById(id)
    }

    const result = await this.getQueryExecutor().query<Interview>(
      createSqlQuery(
        `
          SELECT
            id,
            scheduler_id,
            scheduler_alias,
            interviewer_id,
            interviewer_alias,
            type,
            mode,
            ${bookingChannelSelect},
            tier,
            status,
            scheduled_at,
            realtime_session_id,
            excalidraw_room_id,
            excalidraw_key,
            recording_url,
            screenshot_urls,
            feedback,
            started_at,
            expires_at,
            warning_at,
            created_at,
            updated_at
          FROM interviews
          WHERE id = $1
          LIMIT 1;
        `,
        [id],
      ),
    )

    const [row] = result.rows
    return row ? parseInterview(row) : null
  }

  async getInterviewFeedbackState(id: string): Promise<InterviewFeedbackState | null> {
    const dataSource = this.dependencies.dataSource

    if (dataSource && 'getInterviewFeedbackState' in dataSource) {
      return dataSource.getInterviewFeedbackState!(id)
    }

    const result = await this.getQueryExecutor().query<InterviewFeedbackState>(
      createSqlQuery(
        `
          SELECT
            id,
            status,
            recording_status,
            feedback_status,
            feedback_unavailable_reason,
            screenshots_finalized_at,
            type,
            mode,
            tier,
            scheduler_alias
          FROM interviews
          WHERE id = $1
          LIMIT 1;
        `,
        [id],
      ),
    )

    const [row] = result.rows
    return row ?? null
  }

  async getParticipantInterviewById(
    input: GetParticipantInterviewByIdInput,
  ): Promise<InterviewDetail | null> {
    const parsedInput = getParticipantInterviewByIdInputSchema.parse(input)
    const dataSource = this.dependencies.dataSource

    if (typeof dataSource?.getParticipantInterviewById === 'function') {
      return dataSource.getParticipantInterviewById(parsedInput)
    }

    const result = await this.getQueryExecutor().query<InterviewDetail>(
      createSqlQuery(
        `
          SELECT
            id,
            scheduler_id,
            scheduler_alias,
            interviewer_id,
            interviewer_alias,
            type,
            mode,
            ${bookingChannelSelect},
            tier,
            status,
            scheduled_at,
            recording_url,
            screenshot_urls,
            feedback,
            recording_status,
            transcript,
            feedback_status,
            feedback_unavailable_reason,
            feedback_error_code,
            feedback_prompt_version,
            feedback_generated_at,
            screenshots_finalized_at,
            started_at,
            expires_at,
            warning_at,
            created_at,
            updated_at
          FROM interviews
          WHERE id = $1
            AND (scheduler_id = $2 OR interviewer_id = $2)
          LIMIT 1;
        `,
        [parsedInput.interview_id, parsedInput.participant_user_id],
      ),
    )

    const [row] = result.rows
    return row ? parseInterviewDetail(row) : null
  }

  async cancelInterview(
    input: CancelInterviewRecordInput,
    outboxEvent?: NotificationQueueEvent,
  ): Promise<CancelInterviewRecordResult> {
    const parsedInput = cancelInterviewRecordInputSchema.parse(input)
    const dataSource = this.dependencies.dataSource

    if (typeof dataSource?.cancelInterview === 'function') {
      const result = await dataSource.cancelInterview(parsedInput)
      if (result.outcome === 'cancelled' && outboxEvent && this.dependencies.persistOutboxEvent) {
        await this.dependencies.persistOutboxEvent(outboxEvent)
      }
      return result
    }

    const queryExecutor = this.getQueryExecutor()
    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const lookupResult = await queryExecutor.query<Interview>(
        createSqlQuery(
          `
            SELECT
              id,
              scheduler_id,
              scheduler_alias,
              interviewer_id,
              interviewer_alias,
              type,
              mode,
              ${bookingChannelSelect},
              tier,
              status,
              scheduled_at,
              realtime_session_id,
              excalidraw_room_id,
              excalidraw_key,
              recording_url,
              screenshot_urls,
              feedback,
              recording_status,
              transcript,
              feedback_status,
              feedback_unavailable_reason,
              feedback_error_code,
              feedback_prompt_version,
              feedback_generated_at,
              started_at,
              expires_at,
              warning_at,
              created_at,
              updated_at
            FROM interviews
            WHERE id = $1
              AND (scheduler_id = $2 OR interviewer_id = $2)
            LIMIT 1
            FOR UPDATE;
          `,
          [parsedInput.interview_id, parsedInput.participant_user_id],
        ),
      )

      const [existingInterview] = lookupResult.rows

      if (!existingInterview) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return { outcome: 'not_found' }
      }

      const parsedInterview = parseInterview(existingInterview)

      if (parsedInterview.status === 'cancelled') {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'already_cancelled',
          interview: parsedInterview,
        }
      }

      if (parsedInterview.status !== 'scheduled') {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'invalid_status',
          interview: parsedInterview,
        }
      }

      const updateResult = await queryExecutor.query<Interview>(
        createSqlQuery(
          `
            UPDATE interviews
            SET status = 'cancelled',
                updated_at = $2
            WHERE id = $1
            RETURNING
              id,
              scheduler_id,
              scheduler_alias,
              interviewer_id,
              interviewer_alias,
              type,
              mode,
              ${bookingChannelSelect},
              tier,
              status,
              scheduled_at,
              realtime_session_id,
              excalidraw_room_id,
              excalidraw_key,
              recording_url,
              screenshot_urls,
              feedback,
              recording_status,
              transcript,
              feedback_status,
              feedback_unavailable_reason,
              feedback_error_code,
              feedback_prompt_version,
              feedback_generated_at,
              started_at,
              expires_at,
              warning_at,
              created_at,
              updated_at;
          `,
          [parsedInput.interview_id, parsedInput.updated_at],
        ),
      )

      const [cancelledInterview] = updateResult.rows

      if (!cancelledInterview) {
        throw new Error('Failed to cancel interview record.')
      }

      if (outboxEvent && this.dependencies.persistOutboxEvent) {
        await this.dependencies.persistOutboxEvent(outboxEvent)
      }

      await queryExecutor.query(createSqlQuery('COMMIT;'))

      return {
        outcome: 'cancelled',
        interview: mergeDetailProcessingState(
          parseInterview(cancelledInterview),
          cancelledInterview as InterviewWithDetailState,
        ),
      }
    } catch (error) {
      await rollbackTransactionSafely(queryExecutor)
      throw error
    }
  }

  async transitionInterviewLifecycle(
    input: LifecycleInterviewRecordInput,
    outboxEvent?: NotificationQueueEvent,
  ): Promise<LifecycleInterviewRecordResult> {
    const parsedInput = lifecycleInterviewRecordInputSchema.parse(input)
    const dataSource = this.dependencies.dataSource

    if (typeof dataSource?.transitionInterviewLifecycle === 'function') {
      const result = await dataSource.transitionInterviewLifecycle(parsedInput, outboxEvent)
      if (result.outcome === 'completed' && outboxEvent && this.dependencies.persistOutboxEvent) {
        await this.dependencies.persistOutboxEvent(outboxEvent)
      }
      return result
    }

    const queryExecutor = this.getQueryExecutor()
    const maxAttempts = 3

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await queryExecutor.query(createSqlQuery('BEGIN;'))

        if (parsedInput.action === 'start') {
          const updateResult = await queryExecutor.query<Interview>(
            createSqlQuery(
              `
                UPDATE interviews
                SET status = 'ongoing',
                    started_at = COALESCE($3, started_at),
                    expires_at = COALESCE($4, expires_at),
                    warning_at = COALESCE($5, warning_at),
                    updated_at = $2
                WHERE id = $1
                  AND (scheduler_id = $6 OR interviewer_id = $6)
                  AND status = 'scheduled'
                RETURNING
                  id,
                  scheduler_id,
                  scheduler_alias,
                  interviewer_id,
                  interviewer_alias,
                  type,
                  mode,
                  ${bookingChannelSelect},
                  tier,
                  status,
                  scheduled_at,
                  realtime_session_id,
                  excalidraw_room_id,
                  excalidraw_key,
                  recording_url,
                  screenshot_urls,
                  feedback,
                  recording_status,
                  transcript,
                  feedback_status,
                  feedback_unavailable_reason,
                  feedback_error_code,
                  feedback_prompt_version,
                  feedback_generated_at,
                  started_at,
                  expires_at,
                  warning_at,
                  created_at,
                  updated_at;
              `,
              [
                parsedInput.interview_id,
                parsedInput.updated_at,
                parsedInput.started_at ?? null,
                parsedInput.expires_at ?? null,
                parsedInput.warning_at ?? null,
                parsedInput.participant_user_id,
              ],
            ),
          )

          if (hasRows(updateResult)) {
            await queryExecutor.query(createSqlQuery('COMMIT;'))
            return {
              outcome: 'started',
              interview: mergeDetailProcessingState(
                parseInterview(updateResult.rows[0]),
                updateResult.rows[0] as InterviewWithDetailState,
              ),
            }
          }

          // Atomic guard returned no row — classify via safe SELECT (no FOR UPDATE)
          const fallbackResult = await queryExecutor.query<Interview>(
            createSqlQuery(
              `
                SELECT
                  id,
                  scheduler_id,
                  scheduler_alias,
                  interviewer_id,
                  interviewer_alias,
                  type,
                  mode,
                  ${bookingChannelSelect},
                  tier,
                  status,
                  scheduled_at,
                  realtime_session_id,
                  excalidraw_room_id,
                  excalidraw_key,
                  recording_url,
                  screenshot_urls,
                  feedback,
                  recording_status,
                  transcript,
                  feedback_status,
                  feedback_unavailable_reason,
                  feedback_error_code,
                  feedback_prompt_version,
                  feedback_generated_at,
                  started_at,
                  expires_at,
                  warning_at,
                  created_at,
                  updated_at
                FROM interviews
                WHERE id = $1
                  AND (scheduler_id = $2 OR interviewer_id = $2)
                LIMIT 1;
              `,
              [parsedInput.interview_id, parsedInput.participant_user_id],
            ),
          )

          const [existingInterview] = fallbackResult.rows

          if (!existingInterview) {
            await queryExecutor.query(createSqlQuery('COMMIT;'))
            return { outcome: 'not_found' }
          }

          const parsedInterview = mergeDetailProcessingState(
            parseInterview(existingInterview),
            existingInterview as InterviewWithDetailState,
          )

          if (parsedInterview.status === 'ongoing') {
            await queryExecutor.query(createSqlQuery('COMMIT;'))
            return {
              outcome: 'already_ongoing',
              interview: parsedInterview,
            }
          }

          await queryExecutor.query(createSqlQuery('COMMIT;'))
          return {
            outcome: 'invalid_status',
            interview: parsedInterview,
          }
        }

        // action === 'end'
        const updateResult = await queryExecutor.query<Interview>(
          createSqlQuery(
            `
              WITH consent_check AS (
                SELECT (
                  SELECT COUNT(*) = CASE WHEN i.interviewer_id IS NULL THEN 1 ELSE 2 END
                  FROM interview_recording_consents rc
                  WHERE rc.interview_id = i.id
                    AND rc.decision = 'consented'
                    AND rc.revoked_at IS NULL
                    AND rc.user_id IN (i.scheduler_id, i.interviewer_id)
                ) AS all_consented
                FROM interviews i
                WHERE i.id = $1
              )
              UPDATE interviews
              SET status = 'completed',
                  feedback_status = CASE
                    WHEN (SELECT all_consented FROM consent_check)
                    THEN 'pending'
                    ELSE 'not_started'
                  END,
                  feedback_unavailable_reason = CASE
                    WHEN (SELECT all_consented FROM consent_check)
                    THEN NULL
                    ELSE 'no_consent'
                  END,
                  screenshots_finalized_at = COALESCE(screenshots_finalized_at, NOW()),
                  updated_at = $2
              WHERE id = $1
                AND (scheduler_id = $3 OR interviewer_id = $3)
                AND status = 'ongoing'
                AND ($4::timestamptz IS NULL OR started_at = $4::timestamptz)
              RETURNING
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
                realtime_session_id,
                excalidraw_room_id,
                excalidraw_key,
                recording_url,
                screenshot_urls,
                feedback,
                recording_status,
                transcript,
                feedback_status,
                feedback_unavailable_reason,
                feedback_error_code,
                feedback_prompt_version,
                feedback_generated_at,
                screenshots_finalized_at,
                started_at,
                expires_at,
                warning_at,
                created_at,
                updated_at;
            `,
            [
              parsedInput.interview_id,
              parsedInput.updated_at,
              parsedInput.participant_user_id,
              parsedInput.started_at_precondition ?? null,
            ],
          ),
        )

        if (hasRows(updateResult)) {
          await queryExecutor.query(createSqlQuery('COMMIT;'))
          return {
            outcome: 'completed',
            interview: mergeDetailProcessingState(
              parseInterview(updateResult.rows[0]),
              updateResult.rows[0] as InterviewWithDetailState,
            ),
          }
        }

        // Atomic guard returned no row — classify via safe SELECT (no FOR UPDATE)
        const fallbackResult = await queryExecutor.query<Interview>(
          createSqlQuery(
            `
              SELECT
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
                realtime_session_id,
                excalidraw_room_id,
                excalidraw_key,
                recording_url,
                screenshot_urls,
                feedback,
                recording_status,
                transcript,
                feedback_status,
                feedback_unavailable_reason,
                feedback_error_code,
                feedback_prompt_version,
                feedback_generated_at,
                screenshots_finalized_at,
                started_at,
                expires_at,
                warning_at,
                created_at,
                updated_at
              FROM interviews
              WHERE id = $1
                AND (scheduler_id = $2 OR interviewer_id = $2)
              LIMIT 1;
            `,
            [parsedInput.interview_id, parsedInput.participant_user_id],
          ),
        )

        const [existingInterview] = fallbackResult.rows

        if (!existingInterview) {
          await queryExecutor.query(createSqlQuery('COMMIT;'))
          return { outcome: 'not_found' }
        }

        const parsedInterview = mergeDetailProcessingState(
          parseInterview(existingInterview),
          existingInterview as InterviewWithDetailState,
        )

        if (parsedInterview.status === 'completed') {
          await queryExecutor.query(createSqlQuery('COMMIT;'))
          return {
            outcome: 'already_completed',
            interview: parsedInterview,
          }
        }

        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'invalid_status',
          interview: parsedInterview,
        }
      } catch (error) {
        await rollbackTransactionSafely(queryExecutor)

        if (attempt < maxAttempts - 1 && isRetryableTransactionError(error)) {
          continue
        }

        throw error
      }
    }

    throw new Error('Unexpected lifecycle transition state.')
  }

  async provisionInterview(
    input: ProvisionInterviewRecordInput,
  ): Promise<ProvisionInterviewRecordResult> {
    const parsedInput = provisionInterviewRecordInputSchema.parse(input)
    return this.provisionInterviewWithParsedInput(parsedInput)
  }

  async provisionInterviewWithCredentialFactory(
    input: ProvisionInterviewWithCredentialFactoryInput,
    createCredentials: ProvisionInterviewCredentialFactory,
  ): Promise<ProvisionInterviewRecordResult> {
    const parsedInput = provisionInterviewRecordInputSchema.pick({
      interview_id: true,
      participant_user_id: true,
      updated_at: true,
    }).parse(input)

    const dataSource = this.dependencies.dataSource
    if (typeof dataSource?.provisionInterview === 'function') {
      return this.provisionInterviewWithParsedInput(parsedInput, createCredentials)
    }

    if (createCredentials) {
      const precheck = await this.checkProvisionPreconditions(parsedInput)
      if (precheck.outcome === 'early') {
        return precheck.result
      }
      const credentials = await createCredentials({ interview: precheck.interview })
      return this.provisionInterviewWithParsedInput({
        ...parsedInput,
        ...credentials,
      })
    }

    return this.provisionInterviewWithParsedInput(parsedInput)
  }

  private async provisionInterviewWithParsedInput(
    parsedInput: ProvisionInterviewRecordInput | ProvisionInterviewWithCredentialFactoryInput,
    createCredentials?: ProvisionInterviewCredentialFactory,
  ): Promise<ProvisionInterviewRecordResult> {
    const dataSource = this.dependencies.dataSource

    if (typeof dataSource?.provisionInterview === 'function') {
      if (createCredentials) {
        const existingInterview = await this.getInterviewById(parsedInput.interview_id)
        if (!existingInterview) {
          return { outcome: 'not_found' }
        }
        if (!isProvisionableInterviewStatus(existingInterview.status)) {
          return {
            outcome: 'invalid_status',
            interview: existingInterview,
          }
        }
        if (hasProvisioningCredentials(existingInterview)) {
          return {
            outcome: 'already_provisioned',
            interview: existingInterview,
          }
        }
        const credentials = await createCredentials({ interview: existingInterview })
        return dataSource.provisionInterview({
          ...parsedInput,
          ...credentials,
        })
      }
      if (hasProvisionInterviewRecordCredentials(parsedInput)) {
        return dataSource.provisionInterview(parsedInput)
      }

      throw new Error('Provision interview credentials are required.')
    }

    const queryExecutor = this.getQueryExecutor()
    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const lookupResult = await queryExecutor.query<Interview>(
        createSqlQuery(
          `
            SELECT
              id,
              scheduler_id,
              scheduler_alias,
              interviewer_id,
              interviewer_alias,
              type,
              mode,
              ${bookingChannelSelect},
              tier,
              status,
              scheduled_at,
              realtime_session_id,
              excalidraw_room_id,
              excalidraw_key,
              recording_url,
              screenshot_urls,
              feedback,
              recording_status,
              transcript,
              feedback_status,
              feedback_unavailable_reason,
              feedback_error_code,
              feedback_prompt_version,
              feedback_generated_at,
              started_at,
              expires_at,
              warning_at,
              created_at,
              updated_at
            FROM interviews
            WHERE id = $1
              AND (scheduler_id = $2 OR interviewer_id = $2)
            LIMIT 1
            FOR UPDATE;
          `,
          [parsedInput.interview_id, parsedInput.participant_user_id],
        ),
      )

      const [existingInterview] = lookupResult.rows

      if (!existingInterview) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return { outcome: 'not_found' }
      }

      const parsedInterview = parseInterview(existingInterview)

      if (!isProvisionableInterviewStatus(parsedInterview.status)) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'invalid_status',
          interview: parsedInterview,
        }
      }

      const alreadyProvisioned = hasProvisioningCredentials(parsedInterview)

      if (alreadyProvisioned) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'already_provisioned',
          interview: parsedInterview,
        }
      }

      const credentials = createCredentials
        ? await createCredentials({ interview: parsedInterview })
        : toProvisioningCredentials(provisionInterviewRecordInputSchema.parse(parsedInput))

      const updateResult = await queryExecutor.query<Interview>(
        createSqlQuery(
          `
            UPDATE interviews
            SET realtime_session_id = COALESCE(realtime_session_id, $3),
                excalidraw_room_id = COALESCE(excalidraw_room_id, $4),
                excalidraw_key = COALESCE(excalidraw_key, $5),
                updated_at = $6
            WHERE id = $1
              AND (scheduler_id = $2 OR interviewer_id = $2)
            RETURNING
              id,
              scheduler_id,
              scheduler_alias,
              interviewer_id,
              interviewer_alias,
              type,
              mode,
              ${bookingChannelSelect},
              tier,
              status,
              scheduled_at,
              realtime_session_id,
              excalidraw_room_id,
              excalidraw_key,
              recording_url,
              screenshot_urls,
              feedback,
              recording_status,
              transcript,
              feedback_status,
              feedback_unavailable_reason,
              feedback_error_code,
              feedback_prompt_version,
              feedback_generated_at,
              started_at,
              expires_at,
              warning_at,
              created_at,
              updated_at;
          `,
          [
            parsedInput.interview_id,
            parsedInput.participant_user_id,
            credentials.realtime_session_id,
            credentials.excalidraw_room_id,
            credentials.excalidraw_key,
            parsedInput.updated_at,
          ],
        ),
      )

      const [provisionedInterview] = updateResult.rows

      if (!provisionedInterview) {
        throw new Error('Failed to provision interview record.')
      }

      await queryExecutor.query(createSqlQuery('COMMIT;'))

      return {
        outcome: 'provisioned',
        interview: mergeDetailProcessingState(
          parseInterview(provisionedInterview),
          provisionedInterview as InterviewWithDetailState,
        ),
      }
    } catch (error) {
      await rollbackTransactionSafely(queryExecutor)
      throw error
    }
  }

  private async checkProvisionPreconditions(
    parsedInput: ProvisionInterviewWithCredentialFactoryInput,
  ): Promise<
    | { outcome: 'ok'; interview: Interview }
    | { outcome: 'early'; result: ProvisionInterviewRecordResult }
  > {
    const queryExecutor = this.getQueryExecutor()
    const lookupResult = await queryExecutor.query<Interview>(
      createSqlQuery(
        `
          SELECT
            id,
            scheduler_id,
            scheduler_alias,
            interviewer_id,
            interviewer_alias,
            type,
            mode,
            ${bookingChannelSelect},
            tier,
            status,
            scheduled_at,
            realtime_session_id,
            excalidraw_room_id,
            excalidraw_key,
            recording_url,
            screenshot_urls,
            feedback,
            recording_status,
            transcript,
            feedback_status,
            feedback_unavailable_reason,
            feedback_error_code,
            feedback_prompt_version,
            feedback_generated_at,
            started_at,
            expires_at,
            warning_at,
            created_at,
            updated_at
          FROM interviews
          WHERE id = $1
            AND (scheduler_id = $2 OR interviewer_id = $2)
          LIMIT 1;
        `,
        [parsedInput.interview_id, parsedInput.participant_user_id],
      ),
    )

    const [existingInterview] = lookupResult.rows

    if (!existingInterview) {
      return { outcome: 'early', result: { outcome: 'not_found' } }
    }

    const parsedInterview = parseInterview(existingInterview)

    if (!isProvisionableInterviewStatus(parsedInterview.status)) {
      return {
        outcome: 'early',
        result: {
          outcome: 'invalid_status',
          interview: parsedInterview,
        },
      }
    }

    if (hasProvisioningCredentials(parsedInterview)) {
      return {
        outcome: 'early',
        result: {
          outcome: 'already_provisioned',
          interview: parsedInterview,
        },
      }
    }

    return { outcome: 'ok', interview: parsedInterview }
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.dependencies.queryExecutor

    if (!queryExecutor) {
      throw new Error('Interview query executor is not configured')
    }

    return queryExecutor
  }
}

export type InterviewWithDetailState = Interview & InterviewDetail

export const defaultDetailProcessingState = {
  recording_status: 'not_started',
  transcript: null,
  feedback_status: 'not_started',
  feedback_unavailable_reason: null,
  feedback_error_code: null,
  feedback_prompt_version: null,
  feedback_generated_at: null,
  screenshots_finalized_at: null,
} as const satisfies Pick<
  InterviewWithDetailState,
  | 'recording_status'
  | 'transcript'
  | 'feedback_status'
  | 'feedback_unavailable_reason'
  | 'feedback_error_code'
  | 'feedback_prompt_version'
  | 'feedback_generated_at'
  | 'screenshots_finalized_at'
>

export function mergeDetailProcessingState(
  interview: Interview,
  previous?: InterviewWithDetailState | null,
): InterviewWithDetailState {
  const prior = previous ?? defaultDetailProcessingState

  return {
    ...interview,
    feedback: interview.feedback as InterviewWithDetailState['feedback'],
    recording_status: prior.recording_status,
    transcript: prior.transcript,
    feedback_status: prior.feedback_status,
    feedback_unavailable_reason: prior.feedback_unavailable_reason,
    feedback_error_code: prior.feedback_error_code,
    feedback_prompt_version: prior.feedback_prompt_version,
    feedback_generated_at: prior.feedback_generated_at,
    screenshots_finalized_at: prior.screenshots_finalized_at ?? null,
  }
}

export function createInMemoryInterviewDataSource(
  seedAccounts: readonly InMemoryInterviewAccountRecord[],
  seedInterviews: readonly Interview[] = [],
  seedCancellationReasons: ReadonlyMap<string, InterviewCancellationReason> =
    new Map(),
): InterviewRepositoryDataSource {
  const accountStateByUserId = new Map<
    string,
    { credits: number; freeStandardInterviews: number; freeAiInterviews: number }
  >()
  const interviewsById = new Map<string, InterviewWithDetailState>()
  const cancellationReasonByInterviewId = new Map<
    string,
    InterviewCancellationReason
  >(seedCancellationReasons)

  for (const account of seedAccounts) {
    accountStateByUserId.set(account.userId, {
      credits: account.credits,
      freeStandardInterviews: account.freeStandardInterviews,
      freeAiInterviews: account.freeAiInterviews,
    })
  }

  for (const interview of seedInterviews) {
    interviewsById.set(interview.id, structuredClone(interview) as InterviewWithDetailState)
  }

  return {
    async getAccountPolicy(userId: string): Promise<InterviewAccountPolicy | null> {
      const accountState = accountStateByUserId.get(userId)

      if (!accountState) {
        return null
      }

      return {
        credits: accountState.credits,
        free_standard_interviews: accountState.freeStandardInterviews,
        free_ai_interviews: accountState.freeAiInterviews,
      }
    },
    async createDirectInterview(
      input: CreateInterviewRecordInput,
      _outboxEvent?: NotificationQueueEvent,
    ): Promise<Interview> {
      const parsedInput = createInterviewRecordInputSchema.parse(input)
      const accountState = accountStateByUserId.get(parsedInput.scheduler_id)

      if (!accountState) {
        throw new InterviewPolicyConflictError('Account state is unavailable.')
      }

      if (parsedInput.policy_consumption === 'free_ai_interview') {
        if (accountState.freeAiInterviews <= 0) {
          throw new InterviewPolicyConflictError()
        }

        accountState.freeAiInterviews -= 1
      }

      if (parsedInput.policy_consumption === 'credit') {
        if (accountState.credits <= 0) {
          throw new InterviewPolicyConflictError()
        }

        accountState.credits -= 1
      }

      const interview = mergeDetailProcessingState(
        parseInterview({
          ...parsedInput,
          booking_channel: 'ai_direct',
          realtime_session_id: null,
          excalidraw_room_id: null,
          excalidraw_key: null,
          recording_url: null,
          screenshot_urls: null,
          feedback: null,
          started_at: null,
          expires_at: null,
          warning_at: null,
        }),
      )
      interviewsById.set(interview.id, structuredClone(interview))
      return structuredClone(interview)
    },
    async listParticipantInterviews(
      input: ListParticipantInterviewsInput,
    ): Promise<InterviewListItem[]> {
      const parsedInput = listParticipantInterviewsInputSchema.parse(input)

      return Array.from(interviewsById.values())
        .filter(function isParticipantInterview(interview) {
          return (
            interview.scheduler_id === parsedInput.participant_user_id ||
            interview.interviewer_id === parsedInput.participant_user_id
          )
        })
        .filter(function matchesStatus(interview) {
          return parsedInput.status === undefined
            ? true
            : interview.status === parsedInput.status
        })
        .sort(compareInterviewListOrder)
        .slice(parsedInput.offset, parsedInput.offset + parsedInput.limit)
        .map(function cloneInterview(interview) {
          return parseInterviewListItem({
            ...structuredClone(interview),
            cancellation_reason:
              cancellationReasonByInterviewId.get(interview.id) ?? null,
          })
        })
    },
    async getInterviewById(id: string): Promise<Interview | null> {
      const interview = interviewsById.get(id)
      return interview ? structuredClone(interview) : null
    },
    async getInterviewFeedbackState(id: string): Promise<InterviewFeedbackState | null> {
      const interview = interviewsById.get(id)
      if (!interview) {
        return null
      }
      return {
        id: interview.id,
        status: interview.status,
        recording_status: interview.recording_status,
        feedback_status: interview.feedback_status,
        feedback_unavailable_reason: interview.feedback_unavailable_reason,
        screenshots_finalized_at: interview.screenshots_finalized_at,
        type: interview.type,
        mode: interview.mode,
        tier: interview.tier,
        scheduler_alias: interview.scheduler_alias,
      }
    },
    async getParticipantInterviewById(
      input: GetParticipantInterviewByIdInput,
    ): Promise<InterviewDetail | null> {
      const parsedInput = getParticipantInterviewByIdInputSchema.parse(input)
      const interview = interviewsById.get(parsedInput.interview_id)

      if (
        !interview ||
        (interview.scheduler_id !== parsedInput.participant_user_id &&
          interview.interviewer_id !== parsedInput.participant_user_id)
      ) {
        return null
      }

      const detail = parseInterviewDetail({
        ...interview,
        realtime_session_id: undefined,
        excalidraw_room_id: undefined,
        excalidraw_key: undefined,
      })

      return structuredClone(detail)
    },
    async provisionInterview(
      input: ProvisionInterviewRecordInput,
    ): Promise<ProvisionInterviewRecordResult> {
      const parsedInput = provisionInterviewRecordInputSchema.parse(input)
      const existingInterview = interviewsById.get(parsedInput.interview_id)

      if (
        !existingInterview ||
        (existingInterview.scheduler_id !== parsedInput.participant_user_id &&
          existingInterview.interviewer_id !== parsedInput.participant_user_id)
      ) {
        return { outcome: 'not_found' }
      }

      if (!isProvisionableInterviewStatus(existingInterview.status)) {
        return {
          outcome: 'invalid_status',
          interview: structuredClone(existingInterview),
        }
      }

      if (hasProvisioningCredentials(existingInterview)) {
        return {
          outcome: 'already_provisioned',
          interview: structuredClone(existingInterview),
        }
      }

      const provisionedInterview = mergeDetailProcessingState(
        parseInterview({
          ...existingInterview,
          realtime_session_id:
            existingInterview.realtime_session_id ?? parsedInput.realtime_session_id,
          excalidraw_room_id:
            existingInterview.excalidraw_room_id ?? parsedInput.excalidraw_room_id,
          excalidraw_key: existingInterview.excalidraw_key ?? parsedInput.excalidraw_key,
          updated_at: parsedInput.updated_at,
        }),
        existingInterview,
      )

      interviewsById.set(provisionedInterview.id, structuredClone(provisionedInterview))

      return {
        outcome: 'provisioned',
        interview: structuredClone(provisionedInterview),
      }
    },
    async cancelInterview(
      input: CancelInterviewRecordInput,
    ): Promise<CancelInterviewRecordResult> {
      const parsedInput = cancelInterviewRecordInputSchema.parse(input)
      const existingInterview = interviewsById.get(parsedInput.interview_id)

      if (
        !existingInterview ||
        (existingInterview.scheduler_id !== parsedInput.participant_user_id &&
          existingInterview.interviewer_id !== parsedInput.participant_user_id)
      ) {
        return { outcome: 'not_found' }
      }

      if (existingInterview.status === 'cancelled') {
        return {
          outcome: 'already_cancelled',
          interview: structuredClone(existingInterview),
        }
      }

      if (existingInterview.status !== 'scheduled') {
        return {
          outcome: 'invalid_status',
          interview: structuredClone(existingInterview),
        }
      }

      const cancelledInterview = mergeDetailProcessingState(
        parseInterview({
          ...existingInterview,
          status: 'cancelled',
          updated_at: parsedInput.updated_at,
        }),
        existingInterview,
      )

      // Mirror the production premium refund ledger: an interviewer-initiated
      // cancellation of a verified_interviewer booking refunds the scheduler
      // and surfaces as `interviewer_cancelled` on the list response.
      if (
        existingInterview.booking_channel === 'verified_interviewer' &&
        existingInterview.interviewer_id === parsedInput.participant_user_id
      ) {
        cancellationReasonByInterviewId.set(
          cancelledInterview.id,
          'interviewer_cancelled',
        )
      }

      interviewsById.set(cancelledInterview.id, structuredClone(cancelledInterview))

      return {
        outcome: 'cancelled',
        interview: structuredClone(cancelledInterview),
      }
    },
    async transitionInterviewLifecycle(
      input: LifecycleInterviewRecordInput,
    ): Promise<LifecycleInterviewRecordResult> {
      const parsedInput = lifecycleInterviewRecordInputSchema.parse(input)
      const existingInterview = interviewsById.get(parsedInput.interview_id)

      if (
        !existingInterview ||
        (existingInterview.scheduler_id !== parsedInput.participant_user_id &&
          existingInterview.interviewer_id !== parsedInput.participant_user_id)
      ) {
        return { outcome: 'not_found' }
      }

      if (parsedInput.action === 'start') {
        if (existingInterview.status === 'ongoing') {
          return {
            outcome: 'already_ongoing',
            interview: structuredClone(existingInterview),
          }
        }

        if (existingInterview.status !== 'scheduled') {
          return {
            outcome: 'invalid_status',
            interview: structuredClone(existingInterview),
          }
        }

        const startedInterview = mergeDetailProcessingState(
          parseInterview({
            ...existingInterview,
            status: 'ongoing',
            started_at: parsedInput.started_at ?? existingInterview.started_at,
            expires_at: parsedInput.expires_at ?? existingInterview.expires_at,
            warning_at: parsedInput.warning_at ?? existingInterview.warning_at,
            updated_at: parsedInput.updated_at,
          }),
          existingInterview,
        )

        interviewsById.set(startedInterview.id, structuredClone(startedInterview))

        return {
          outcome: 'started',
          interview: structuredClone(startedInterview),
        }
      }

      // action === 'end'
      if (existingInterview.status === 'completed') {
        return {
          outcome: 'already_completed',
          interview: structuredClone(existingInterview),
        }
      }

      if (existingInterview.status !== 'ongoing') {
        return {
          outcome: 'invalid_status',
          interview: structuredClone(existingInterview),
        }
      }

      if (
        parsedInput.started_at_precondition &&
        existingInterview.started_at !== parsedInput.started_at_precondition
      ) {
        return {
          outcome: 'invalid_status',
          interview: structuredClone(existingInterview),
        }
      }

      // NOTE: This approximates consent using recording_status, diverging from
      // the SQL CTE that checks per-participant interview_recording_consents rows.
      // For peer-to-peer interviews, this may incorrectly mark feedback as
      // pending when only one participant has consented. Acceptable for test
      // scenarios; production uses the SQL path.
      const allConsented = existingInterview.recording_status !== 'not_started'

      const completedInterview = mergeDetailProcessingState(
        parseInterview({
          ...existingInterview,
          status: 'completed',
          updated_at: parsedInput.updated_at,
        }),
        {
          ...existingInterview,
          feedback_status: allConsented ? 'pending' : 'not_started',
          feedback_unavailable_reason: allConsented ? null : 'no_consent',
        },
      )

      interviewsById.set(completedInterview.id, structuredClone(completedInterview))

      return {
        outcome: 'completed',
        interview: structuredClone(completedInterview),
      }
    },
  }
}

function isDataSource(
  input: InterviewRepositoryConstructorInput,
): input is InterviewRepositoryDataSource {
  return (
    typeof input === 'object' &&
    input !== null &&
    'getAccountPolicy' in input &&
    typeof input.getAccountPolicy === 'function' &&
    'createDirectInterview' in input &&
    typeof input.createDirectInterview === 'function'
  )
}

function isQueryExecutor(
  input: InterviewRepositoryConstructorInput,
): input is SqlQueryExecutor {
  return (
    typeof input === 'object' &&
    input !== null &&
    'query' in input &&
    typeof input.query === 'function'
  )
}

function hasRows<Row>(queryResult: QueryResult<Row>): boolean {
  if (typeof queryResult.rowCount === 'number') {
    return queryResult.rowCount > 0
  }

  return queryResult.rows.length > 0
}

function compareInterviewListOrder(left: Interview, right: Interview): number {
  const leftTime = new Date(left.scheduled_at).getTime()
  const rightTime = new Date(right.scheduled_at).getTime()

  if (leftTime < rightTime) {
    return -1
  }

  if (leftTime > rightTime) {
    return 1
  }

  if (left.id < right.id) {
    return -1
  }

  if (left.id > right.id) {
    return 1
  }

  return 0
}

function hasProvisioningCredentials(interview: Interview): boolean {
  return Boolean(
    interview.realtime_session_id && interview.excalidraw_room_id && interview.excalidraw_key,
  )
}

function hasProvisionInterviewRecordCredentials(
  input: ProvisionInterviewRecordInput | ProvisionInterviewWithCredentialFactoryInput,
): input is ProvisionInterviewRecordInput {
  return (
    'realtime_session_id' in input &&
    'excalidraw_room_id' in input &&
    'excalidraw_key' in input
  )
}

function toProvisioningCredentials(input: ProvisionInterviewRecordInput): {
  realtime_session_id: string
  excalidraw_room_id: string
  excalidraw_key: string
} {
  return {
    realtime_session_id: input.realtime_session_id,
    excalidraw_room_id: input.excalidraw_room_id,
    excalidraw_key: input.excalidraw_key,
  }
}

function isProvisionableInterviewStatus(status: Interview['status']): boolean {
  return status === 'scheduled' || status === 'ongoing'
}

function buildListParticipantInterviewsQuery(
  input: ParsedListParticipantInterviewsInput,
): SqlQuery {
  const hasStatusFilter = input.status !== undefined
  const statusClause = hasStatusFilter ? 'AND status = $2' : ''
  const limitPlaceholder = hasStatusFilter ? '$3' : '$2'
  const offsetPlaceholder = hasStatusFilter ? '$4' : '$3'
  const values = hasStatusFilter
    ? [input.participant_user_id, input.status, input.limit, input.offset]
    : [input.participant_user_id, input.limit, input.offset]

  return createSqlQuery(
    `
      SELECT
        id,
        scheduler_id,
        scheduler_alias,
        interviewer_id,
        interviewer_alias,
        type,
        mode,
        booking_channel,
        tier,
        status,
        scheduled_at,
        created_at,
        updated_at,
        pr.reason AS cancellation_reason
      FROM (
        SELECT
          id,
          scheduler_id,
          scheduler_alias,
          interviewer_id,
          interviewer_alias,
          type,
          mode,
          ${bookingChannelSelect},
          tier,
          status,
          scheduled_at,
          created_at,
          updated_at
        FROM interviews
        WHERE scheduler_id = $1
          ${statusClause}
        UNION ALL
        SELECT
          id,
          scheduler_id,
          scheduler_alias,
          interviewer_id,
          interviewer_alias,
          type,
          mode,
          ${bookingChannelSelect},
          tier,
          status,
          scheduled_at,
          created_at,
          updated_at
        FROM interviews
        WHERE interviewer_id = $1
          ${statusClause}
      ) AS participant_interviews
      -- UNIQUE premium_booking_credit_refunds.interview_id (from
      -- 20260807160000_add_premium_scheduling_tables.sql) guarantees at most
      -- one join row per interview, so this LEFT JOIN cannot duplicate list
      -- rows and pagination remains correct over the UNION ALL.
      LEFT JOIN premium_booking_credit_refunds pr
        ON pr.interview_id = participant_interviews.id
      ORDER BY scheduled_at ASC, id ASC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder};
    `,
    values,
  )
}

async function rollbackTransactionSafely(
  queryExecutor: SqlQueryExecutor,
): Promise<void> {
  try {
    await queryExecutor.query(createSqlQuery('ROLLBACK;'))
  } catch {}
}

function isRetryableTransactionError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    const code = (error as { code: string }).code
    return code === '40001' || code === '40P01'
  }

  return false
}
