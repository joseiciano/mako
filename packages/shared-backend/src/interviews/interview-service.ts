import {
  aiChatResponseSchema,
  type AiChatHistoryMessage,
  type AiChatRequest,
  type AiChatResponse,
  type CancelInterviewParams,
  type CancelInterviewResponse,
  type CreateInterviewRequest,
  type CreateInterviewResponse,
  type EndInterviewParams,
  type Interview,
  type InterviewDetailResponse,
  type InterviewLifecycleResponse,
  type InterviewListQuery,
  type InterviewListResponse,
  type ProvisionInterviewParams,
  type ProvisionInterviewResponse,
  type StartInterviewParams,
} from '@mako/shared'
import { buildInterviewAliases } from '../interview'
import { AiChatRepository, AiChatUnavailableError } from './ai-chat-repository'
import { InterviewRepository } from './interview-repository'
import {
  buildInterviewCancelledEvent,
  buildInterviewCreatedEvent,
  type InterviewCreatedEvent,
  type InterviewPostCommitEventPublisher,
} from './interview-post-commit-event'
import {
  createDemoRealtimeProvider,
  type RealtimeProvider,
} from './realtime-provider'
import type { TimerOrchestrationPort, TimerStartParams } from './timer-orchestration'
import {
  NotificationService,
  NotificationDispatchService,
  type NotificationTransport,
} from '../notifications'
import {
  TierPolicyService,
  InsufficientCreditsError,
} from '../tier-policy'
import {
  InterviewBusinessRuleError,
  InterviewConflictError,
  InterviewNotFoundError,
  InterviewPolicyConflictError,
  InterviewUnauthorizedError,
  InterviewValidationError,
  authenticatedInterviewUserIdSchema,
  toCancelInterviewResponse,
  toCreateInterviewResponse,
  toInterviewDetailResponse,
  toInterviewLifecycleActionResponse,
  toInterviewListResponse,
  toProvisionInterviewResponse,
  type InterviewSession,
} from './types'

export type InterviewServiceLogger = {
  error(event: string, context: Record<string, unknown>): void | Promise<void>
  info(event: string, context: Record<string, unknown>): void | Promise<void>
}

export class InterviewService {
  constructor(
    private readonly interviewRepository: InterviewRepository,
    private readonly tierPolicyService: TierPolicyService = new TierPolicyService(),
    private readonly createId: () => string = defaultCreateId,
    private readonly now: () => string = defaultNow,
    private readonly postCommitEventPublisher?: InterviewPostCommitEventPublisher,
    private readonly logger: InterviewServiceLogger = noOpInterviewServiceLogger,
    private readonly notificationService?: NotificationService,
    private readonly notificationDispatchService?: NotificationDispatchService,
    private readonly notificationTransport?: NotificationTransport,
    private readonly realtimeProvider: RealtimeProvider = createDemoRealtimeProvider(),
    private readonly timerOrchestration?: TimerOrchestrationPort,
    private readonly aiChatRepository?: AiChatRepository,
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
        this.logSafely('error', 'interview.post_commit_dispatch_failure', {
          operation: 'create',
          interview_id: createdInterview.id,
          error_message: toErrorMessage(error),
        })
      }
    } else if (this.postCommitEventPublisher) {
      try {
        await this.postCommitEventPublisher.publish(outboxEvent)
      } catch (error) {
        this.logSafely('error', 'interview.post_commit_publish_failure', {
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

    this.logSafely('info', 'interview.provision_start', {
      interview_id: input.id,
      participant_user_id: participantUserId,
    })

    let provisionResult
    try {
      provisionResult = await this.interviewRepository.provisionInterviewWithCredentialFactory({
        interview_id: input.id,
        participant_user_id: participantUserId,
        updated_at: this.now(),
      }, async () => {
        const realtimeCredentials = await this.realtimeProvider.createSession({
          interviewId: input.id,
        })

        return {
          realtime_session_id: realtimeCredentials.realtimeSessionId,
          excalidraw_room_id: realtimeCredentials.excalidrawRoomId,
          excalidraw_key: realtimeCredentials.excalidrawKey,
        }
      })
    } catch (error) {
      this.logSafely('error', 'interview.provision_failure', {
        interview_id: input.id,
        participant_user_id: participantUserId,
        error_type: 'unexpected_error',
      })
      throw error
    }

    switch (provisionResult.outcome) {
      case 'provisioned':
      case 'already_provisioned': {
        const realtimeSessionId = provisionResult.interview.realtime_session_id

        if (!realtimeSessionId) {
          throw new Error('Provisioned interview is missing realtime session ID.')
        }
        const participantToken = await this.realtimeProvider.createParticipantToken({
          realtimeSessionId,
          participantUserId,
          participantName: userSession.email || 'participant',
          participantEmail: userSession.email,
          interviewId: input.id,
        })

        this.logSafely('info', 'interview.provision_success', {
          interview_id: input.id,
          participant_user_id: participantUserId,
          outcome: provisionResult.outcome,
        })

        return toProvisionInterviewResponse(
          provisionResult.interview,
          participantToken.token,
        )
      }
      case 'invalid_status':
        this.logSafely('info', 'interview.provision_failure', {
          interview_id: input.id,
          participant_user_id: participantUserId,
          error_type: 'invalid_status',
        })
        throw new InterviewConflictError(
          'Only scheduled or ongoing interviews can be provisioned.',
        )
      case 'not_found':
        this.logSafely('info', 'interview.provision_failure', {
          interview_id: input.id,
          participant_user_id: participantUserId,
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
            this.logSafely('error', 'interview.post_commit_dispatch_failure', {
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
            this.logSafely('error', 'interview.post_commit_publish_failure', {
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

  async startInterview(
    session: InterviewSession | null,
    input: StartInterviewParams,
  ): Promise<InterviewLifecycleResponse> {
    const userSession = this.requireSession(session)
    const participantUserId = authenticatedInterviewUserIdSchema.parse(
      userSession.userId,
    )

    const startedAt = this.now()
    const expiresAt = computeTimerExpiration(startedAt, SESSION_DURATION_MS)
    const warningAt = computeTimerExpiration(startedAt, WARNING_OFFSET_MS)

    this.logSafely('info', 'start_requested', {
      interview_id: input.id,
      participant_user_id: participantUserId,
      action: 'start',
      started_at: startedAt,
      expires_at: expiresAt,
      warning_at: warningAt,
    })

    const transitionResult = await this.interviewRepository.transitionInterviewLifecycle({
      interview_id: input.id,
      participant_user_id: participantUserId,
      action: 'start',
      updated_at: startedAt,
      started_at: startedAt,
      expires_at: expiresAt,
      warning_at: warningAt,
    })

    switch (transitionResult.outcome) {
      case 'started':
        this.logSafely('info', 'start_succeeded', {
          interview_id: input.id,
          participant_user_id: participantUserId,
          action: 'start',
          outcome: 'started',
          started_at: startedAt,
          expires_at: expiresAt,
          warning_at: warningAt,
          status: transitionResult.interview.status,
        })
        await this.triggerTimerOrchestration({
          interview_id: input.id,
          started_at: startedAt,
          expires_at: expiresAt,
          warning_at: warningAt,
        })
        return toInterviewLifecycleActionResponse(transitionResult.interview)
      case 'already_ongoing': {
        this.logSafely('info', 'start_succeeded', {
          interview_id: input.id,
          participant_user_id: participantUserId,
          action: 'start',
          outcome: 'already_ongoing',
          started_at: transitionResult.interview.started_at,
          expires_at: transitionResult.interview.expires_at,
          warning_at: transitionResult.interview.warning_at,
          status: transitionResult.interview.status,
        })
        const persistedInterview = transitionResult.interview
        if (persistedInterview.started_at && persistedInterview.expires_at && persistedInterview.warning_at) {
          await this.triggerTimerOrchestration({
            interview_id: input.id,
            started_at: persistedInterview.started_at,
            expires_at: persistedInterview.expires_at,
            warning_at: persistedInterview.warning_at,
          })
        }
        return toInterviewLifecycleActionResponse(persistedInterview)
      }
      case 'invalid_status':
        throw new InterviewConflictError(
          'Only scheduled interviews can be started.',
        )
      case 'not_found':
        throw new InterviewNotFoundError(
          'Interview was not found for the active participant.',
        )
    }

    throw new Error('Unexpected interview start outcome.')
  }

  async endInterview(
    session: InterviewSession | null,
    input: EndInterviewParams,
  ): Promise<InterviewLifecycleResponse> {
    const userSession = this.requireSession(session)
    const participantUserId = authenticatedInterviewUserIdSchema.parse(
      userSession.userId,
    )

    this.logSafely('info', 'end_requested', {
      interview_id: input.id,
      participant_user_id: participantUserId,
      action: 'end',
    })

    const transitionResult = await this.interviewRepository.transitionInterviewLifecycle({
      interview_id: input.id,
      participant_user_id: participantUserId,
      action: 'end',
      updated_at: this.now(),
    })

    switch (transitionResult.outcome) {
      case 'completed':
        this.logSafely('info', 'end_succeeded', {
          interview_id: input.id,
          participant_user_id: participantUserId,
          action: 'end',
          outcome: 'completed',
          status: transitionResult.interview.status,
        })
        return toInterviewLifecycleActionResponse(transitionResult.interview)
      case 'already_completed':
        this.logSafely('info', 'end_succeeded', {
          interview_id: input.id,
          participant_user_id: participantUserId,
          action: 'end',
          outcome: 'already_completed',
          status: transitionResult.interview.status,
        })
        return toInterviewLifecycleActionResponse(transitionResult.interview)
      case 'invalid_status':
        throw new InterviewConflictError(
          'Only ongoing interviews can be ended.',
        )
      case 'not_found':
        throw new InterviewNotFoundError(
          'Interview was not found for the active participant.',
        )
    }

    throw new Error('Unexpected interview end outcome.')
  }

  async aiChat(
    session: InterviewSession | null,
    input: {
      interview_id: string
      message: AiChatRequest['message']
      canvas_snapshot: AiChatRequest['canvas_snapshot']
      guidance_mode: AiChatRequest['guidance_mode']
      chat_history?: AiChatHistoryMessage[]
    },
  ): Promise<AiChatResponse> {
    const userSession = this.requireSession(session)

    const participantUserId = authenticatedInterviewUserIdSchema.parse(
      userSession.userId,
    )

    const interview = await this.interviewRepository.getParticipantInterviewById({
      interview_id: input.interview_id,
      participant_user_id: participantUserId,
    })

    if (!interview) {
      throw new InterviewNotFoundError(
        'Interview was not found for the active participant.',
      )
    }

    if (interview.mode !== 'ai_led') {
      throw new InterviewBusinessRuleError(
        'AI chat is only available for AI-led interviews.',
      )
    }

    if (!this.aiChatRepository) {
      throw new AiChatUnavailableError()
    }

    const result = await this.aiChatRepository.generateReply({
      interview_id: input.interview_id,
      session,
      message: input.message,
      canvas_snapshot: input.canvas_snapshot,
      guidance_mode: input.guidance_mode,
      chat_history: input.chat_history,
    })

    return aiChatResponseSchema.parse(result)
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

      let resolvedPolicy
      try {
        resolvedPolicy = this.tierPolicyService.resolveAiInterviewCreatePolicy(
          accountPolicy,
        )
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          throw new InterviewBusinessRuleError(
            'AI-led interview creation requires remaining free AI interviews or credits.',
          )
        }
        throw error
      }

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
          this.tierPolicyService,
        )

        return { interview, outboxEvent: createdEvent }
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          throw new InterviewBusinessRuleError(
            'AI-led interview creation requires remaining free AI interviews or credits.',
          )
        }

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

      try {
        this.tierPolicyService.resolveAiInterviewCreatePolicy(refreshedPolicy)
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          throw new InterviewBusinessRuleError(
            'AI-led interview creation requires remaining free AI interviews or credits.',
          )
        }
        throw error
      }
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

  private logSafely(
    level: 'error' | 'info',
    event: string,
    context: Record<string, unknown>,
  ): void {
    try {
      Promise.resolve(this.logger[level](event, context)).catch(() => {
        // no-op: logging must never block interview operations
      })
    } catch {
      // no-op: synchronous logger errors must never block interview operations
    }
  }

  private async triggerTimerOrchestration(params: TimerStartParams): Promise<void> {
    if (!this.timerOrchestration) {
      return
    }

    try {
      await this.timerOrchestration.startTimer(params)
    } catch (error) {
      this.logSafely('error', 'interview.timer_orchestration_failure', {
        operation: 'start',
        interview_id: params.interview_id,
        error_message: toErrorMessage(error),
      })
    }
  }
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

const SESSION_DURATION_MS = 60 * 60 * 1000
const WARNING_OFFSET_MS = 55 * 60 * 1000

function computeTimerExpiration(startedAt: string, durationMs: number): string {
  return new Date(new Date(startedAt).getTime() + durationMs).toISOString()
}
