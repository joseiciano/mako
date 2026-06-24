import type {
  CancelInterviewParams,
  CancelInterviewResponse,
  CreateInterviewRequest,
  CreateInterviewResponse,
  Interview,
  InterviewDetailResponse,
  InterviewListQuery,
  InterviewListResponse,
  ProvisionInterviewParams,
  ProvisionInterviewResponse,
} from '@mako/shared'
import { buildInterviewAliases } from '../interview'
import { InterviewRepository } from './interview-repository'
import {
  buildInterviewCancelledEvent,
  buildInterviewCreatedEvent,
  type InterviewCreatedEvent,
  type InterviewPostCommitEventPublisher,
} from './interview-post-commit-event'
import {
  NotificationService,
  NotificationDispatchService,
  type NotificationTransport,
} from '../notifications'
import {
  InterviewBusinessRuleError,
  InterviewConflictError,
  InterviewNotFoundError,
  InterviewPolicyConflictError,
  InterviewUnauthorizedError,
  authenticatedInterviewUserIdSchema,
  toCancelInterviewResponse,
  toCreateInterviewResponse,
  toInterviewDetailResponse,
  toInterviewListResponse,
  toProvisionInterviewResponse,
  type InterviewPolicyConfig,
  type InterviewSession,
  type ResolvedInterviewCreatePolicy,
} from './types'

export type InterviewServiceLogger = {
  error(event: string, context: Record<string, unknown>): void | Promise<void>
  info(event: string, context: Record<string, unknown>): void | Promise<void>
}

export class InterviewService {
  constructor(
    private readonly interviewRepository: InterviewRepository,
    private readonly interviewPolicyConfig: InterviewPolicyConfig = {
      freeAiInterviewTier: 'standard',
      creditAiInterviewTier: 'premium',
    },
    private readonly createId: () => string = defaultCreateId,
    private readonly now: () => string = defaultNow,
    private readonly postCommitEventPublisher?: InterviewPostCommitEventPublisher,
    private readonly logger: InterviewServiceLogger = noOpInterviewServiceLogger,
    private readonly notificationService?: NotificationService,
    private readonly notificationDispatchService?: NotificationDispatchService,
    private readonly notificationTransport?: NotificationTransport,
  ) {}

  async createInterview(
    session: InterviewSession | null,
    input: CreateInterviewRequest,
  ): Promise<CreateInterviewResponse> {
    const userSession = this.requireSession(session)
    const schedulerId = authenticatedInterviewUserIdSchema.parse(userSession.userId)

    const scheduledAt = input.scheduled_at === 'now' ? this.now() : input.scheduled_at
    const timestamp = this.now()
    const aliases = buildInterviewAliases('ai_led')
    const interviewId = this.createId()

    const { interview: createdInterview, outboxEvent } = await this.createAiLedInterview({
      schedulerId,
      type: input.type,
      scheduledAt,
      id: interviewId,
      aliases,
      timestamp,
    })

    if (this.notificationDispatchService && this.notificationTransport) {
      try {
        await this.notificationDispatchService.dispatchOutboxEventByIdempotencyKey(
          outboxEvent.idempotency_key,
          this.notificationTransport,
        )
      } catch (error) {
        await this.logSafely('error', 'interview.post_commit_dispatch_failure', {
          operation: 'create',
          interview_id: createdInterview.id,
          error_message: toErrorMessage(error),
        })
      }
    } else if (this.postCommitEventPublisher) {
      try {
        await this.postCommitEventPublisher.publish(outboxEvent)
      } catch (error) {
        await this.logSafely('error', 'interview.post_commit_publish_failure', {
          operation: 'create',
          interview_id: createdInterview.id,
          error_message: toErrorMessage(error),
        })
      }
    }

    return toCreateInterviewResponse(createdInterview)
  }

  async listInterviews(
    session: InterviewSession | null,
    input: InterviewListQuery,
  ): Promise<InterviewListResponse> {
    const userSession = this.requireSession(session)
    const participantUserId = authenticatedInterviewUserIdSchema.parse(
      userSession.userId,
    )
    const interviews = await this.interviewRepository.listParticipantInterviews({
      participant_user_id: participantUserId,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    })

    return toInterviewListResponse(interviews)
  }

  async getInterview(
    session: InterviewSession | null,
    input: { id: string },
  ): Promise<InterviewDetailResponse> {
    const userSession = this.requireSession(session)
    const participantUserId = authenticatedInterviewUserIdSchema.parse(
      userSession.userId,
    )

    const interview = await this.interviewRepository.getParticipantInterviewById({
      interview_id: input.id,
      participant_user_id: participantUserId,
    })

    if (!interview) {
      throw new InterviewNotFoundError(
        'Interview was not found for the active participant.',
      )
    }

    return toInterviewDetailResponse(interview)
  }

  async provisionInterview(
    session: InterviewSession | null,
    input: ProvisionInterviewParams,
  ): Promise<ProvisionInterviewResponse> {
    const userSession = this.requireSession(session)
    const participantUserId = authenticatedInterviewUserIdSchema.parse(userSession.userId)

    await this.logSafely('info', 'interview.provision_start', {
      interview_id: input.id,
      participant_user_id: participantUserId,
    })

    const candidateId = this.createId()
    const provisionResult = await this.interviewRepository.provisionInterview({
      interview_id: input.id,
      participant_user_id: participantUserId,
      realtime_session_id: `realtime_${candidateId}`,
      excalidraw_room_id: `excalidraw_room_${candidateId}`,
      excalidraw_key: `excalidraw_key_${candidateId}`,
      updated_at: this.now(),
    })

    switch (provisionResult.outcome) {
      case 'provisioned':
      case 'already_provisioned':
        await this.logSafely('info', 'interview.provision_success', {
          interview_id: input.id,
          outcome: provisionResult.outcome,
        })
        return toProvisionInterviewResponse(
          provisionResult.interview,
          `realtime_token_${this.createId()}`,
        )
      case 'invalid_status':
        await this.logSafely('info', 'interview.provision_failure', {
          interview_id: input.id,
          error_type: 'invalid_status',
        })
        throw new InterviewConflictError(
          'Only scheduled or ongoing interviews can be provisioned.',
        )
      case 'not_found':
        await this.logSafely('info', 'interview.provision_failure', {
          interview_id: input.id,
          error_type: 'not_found',
        })
        throw new InterviewNotFoundError(
          'Interview was not found for the active participant.',
        )
    }

    throw new Error('Unexpected interview provisioning outcome.')
  }

  async cancelInterview(
    session: InterviewSession | null,
    input: CancelInterviewParams,
  ): Promise<CancelInterviewResponse> {
    const userSession = this.requireSession(session)
    const participantUserId = authenticatedInterviewUserIdSchema.parse(
      userSession.userId,
    )

    const existingInterview = await this.interviewRepository.getParticipantInterviewById({
      interview_id: input.id,
      participant_user_id: participantUserId,
    })

    const outboxEvent =
      existingInterview && this.notificationService
        ? buildInterviewCancelledEvent({
            interview: { ...existingInterview, status: 'cancelled' },
          })
        : undefined

    const cancelResult = await this.interviewRepository.cancelInterview(
      {
        interview_id: input.id,
        participant_user_id: participantUserId,
        updated_at: this.now(),
      },
      outboxEvent,
    )

    switch (cancelResult.outcome) {
      case 'cancelled':
        if (this.notificationDispatchService && this.notificationTransport && outboxEvent) {
          try {
            await this.notificationDispatchService.dispatchOutboxEventByIdempotencyKey(
              outboxEvent.idempotency_key,
              this.notificationTransport,
            )
          } catch (error) {
            await this.logSafely('error', 'interview.post_commit_dispatch_failure', {
              operation: 'cancel',
              interview_id: cancelResult.interview.id,
              error_message: toErrorMessage(error),
            })
          }
        } else if (this.postCommitEventPublisher) {
          try {
            await this.postCommitEventPublisher.publish(
              buildInterviewCancelledEvent({
                interview: cancelResult.interview,
              }),
            )
          } catch (error) {
            await this.logSafely('error', 'interview.post_commit_publish_failure', {
              operation: 'cancel',
              interview_id: cancelResult.interview.id,
              error_message: toErrorMessage(error),
            })
          }
        }
        return toCancelInterviewResponse()
      case 'already_cancelled':
        return toCancelInterviewResponse()
      case 'invalid_status':
        throw new InterviewConflictError(
          'Only scheduled interviews can be cancelled.',
        )
      case 'not_found':
        throw new InterviewNotFoundError(
          'Interview was not found for the active participant.',
        )
    }

    throw new Error('Unexpected interview cancellation outcome.')
  }

  private async createAiLedInterview(input: {
    schedulerId: string
    type: CreateInterviewRequest['type']
    scheduledAt: string
    id?: string
    aliases?: ReturnType<typeof buildInterviewAliases>
    timestamp?: string
  }): Promise<{ interview: Interview; outboxEvent: InterviewCreatedEvent }> {
    let lastConflictError: InterviewPolicyConflictError | null = null

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const accountPolicy = await this.interviewRepository.getAccountPolicy(
        input.schedulerId,
      )

      if (!accountPolicy) {
        throw new InterviewNotFoundError()
      }

      const resolvedPolicy = resolveAiInterviewCreatePolicy(
        accountPolicy,
        this.interviewPolicyConfig,
      )

      const timestamp = input.timestamp ?? this.now()
      const aliases = input.aliases ?? buildInterviewAliases('ai_led')
      const interviewId = input.id ?? this.createId()
      const createdEvent = buildInterviewCreatedEvent(
        {
          interview: {
            id: interviewId,
            scheduler_id: input.schedulerId,
            interviewer_id: null,
            type: input.type,
            mode: 'ai_led',
            tier: resolvedPolicy.tier,
            status: 'scheduled',
            scheduled_at: input.scheduledAt,
          },
        },
        { createEventId: this.createId, now: this.now },
      )

      try {
        const interview = await this.interviewRepository.createDirectInterview(
          {
            id: interviewId,
            scheduler_id: input.schedulerId,
            scheduler_alias: aliases.schedulerAlias,
            interviewer_id: null,
            interviewer_alias: aliases.interviewerAlias,
            type: input.type,
            mode: 'ai_led',
            tier: resolvedPolicy.tier,
            status: 'scheduled',
            scheduled_at: input.scheduledAt,
            created_at: timestamp,
            updated_at: timestamp,
            policy_consumption: resolvedPolicy.consumption,
          },
          createdEvent,
        )

        return { interview, outboxEvent: createdEvent }
      } catch (error) {
        if (!(error instanceof InterviewPolicyConflictError)) {
          throw error
        }

        lastConflictError = error
      }
    }

    if (lastConflictError) {
      const refreshedPolicy = await this.interviewRepository.getAccountPolicy(
        input.schedulerId,
      )

      if (!refreshedPolicy) {
        throw new InterviewNotFoundError()
      }

      resolveAiInterviewCreatePolicy(refreshedPolicy, this.interviewPolicyConfig)
    }

    throw new InterviewBusinessRuleError(
      'AI-led interview creation requires remaining free AI interviews or credits.',
    )
  }

  private requireSession(session: InterviewSession | null): InterviewSession {
    if (!session) {
      throw new InterviewUnauthorizedError()
    }

    return session
  }

  private async logSafely(
    level: 'error' | 'info',
    event: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.logger[level](event, context)
    } catch {
      // no-op: logging must never block interview operations
    }
  }
}

export function resolveAiInterviewCreatePolicy(
  accountPolicy: {
    credits: number
    free_ai_interviews: number
  },
  policyConfig: InterviewPolicyConfig,
): ResolvedInterviewCreatePolicy {
  if (accountPolicy.free_ai_interviews > 0) {
    return {
      tier: policyConfig.freeAiInterviewTier,
      consumption: 'free_ai_interview',
    }
  }

  if (accountPolicy.credits > 0) {
    return {
      tier: policyConfig.creditAiInterviewTier,
      consumption: 'credit',
    }
  }

  throw new InterviewBusinessRuleError(
    'AI-led interview creation requires remaining free AI interviews or credits.',
  )
}

function defaultCreateId(): string {
  return crypto.randomUUID()
}

function defaultNow(): string {
  return new Date().toISOString()
}

const noOpInterviewServiceLogger: InterviewServiceLogger = {
  error: async function errorNoOp() {
    return undefined
  },
  info: async function infoNoOp() {
    return undefined
  },
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
