import type {
  CancelInterviewParams,
  CancelInterviewResponse,
  CreateInterviewRequest,
  CreateInterviewResponse,
  Interview,
  InterviewListQuery,
  InterviewListResponse,
} from '@mako/shared'
import { buildInterviewAliases } from '../interview'
import { InterviewRepository } from './interview-repository'
import {
  InterviewBusinessRuleError,
  InterviewConflictError,
  InterviewNotFoundError,
  InterviewPolicyConflictError,
  InterviewUnauthorizedError,
  authenticatedInterviewUserIdSchema,
  toCancelInterviewResponse,
  toCreateInterviewResponse,
  toInterviewListResponse,
  type InterviewPolicyConfig,
  type InterviewSession,
  type ResolvedInterviewCreatePolicy,
} from './types'
import {
  buildInterviewCancelledEvent,
  buildInterviewCreatedEvent,
  type InterviewPostCommitEventPublisher,
} from './interview-post-commit-event'

export class InterviewService {
  constructor(
    private readonly interviewRepository: InterviewRepository,
    private readonly interviewPolicyConfig: InterviewPolicyConfig = {
      freeAiInterviewTier: 'standard',
      creditAiInterviewTier: 'premium',
    },
    private readonly createId: () => string = defaultCreateId,
    private readonly now: () => string = defaultNow,
    private readonly postCommitEventPublisher: InterviewPostCommitEventPublisher | null = null,
  ) {}

  async createInterview(
    session: InterviewSession | null,
    input: CreateInterviewRequest,
  ): Promise<CreateInterviewResponse> {
    const userSession = this.requireSession(session)
    const schedulerId = authenticatedInterviewUserIdSchema.parse(userSession.userId)
    const timestamp = this.now()

    const createdInterview = await this.createAiLedInterview({
      schedulerId,
      type: input.type,
      scheduledAt: input.scheduled_at === 'now' ? timestamp : input.scheduled_at,
      timestamp,
    })

    await this.flushPostCommitEventsSafely()

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

  async cancelInterview(
    session: InterviewSession | null,
    input: CancelInterviewParams,
  ): Promise<CancelInterviewResponse> {
    const userSession = this.requireSession(session)
    const participantUserId = authenticatedInterviewUserIdSchema.parse(
      userSession.userId,
    )
    const cancelResult = await this.interviewRepository.cancelInterview({
      interview_id: input.id,
      participant_user_id: participantUserId,
      updated_at: this.now(),
    }, this.postCommitEventPublisher
      ? {
          buildPostCommitEvent: buildCancelledInterviewEvent,
        }
      : undefined)

    switch (cancelResult.outcome) {
      case 'cancelled': {
        await this.flushPostCommitEventsSafely()
        return toCancelInterviewResponse()
      }
      case 'already_cancelled':
        await this.flushPostCommitEventsSafely()
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
    timestamp: string
  }): Promise<Interview> {
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

      const aliases = buildInterviewAliases('ai_led')
      const createInterviewInput = {
        id: this.createId(),
        scheduler_id: input.schedulerId,
        scheduler_alias: aliases.schedulerAlias,
        interviewer_id: null,
        interviewer_alias: aliases.interviewerAlias,
        type: input.type,
        mode: 'ai_led' as const,
        tier: resolvedPolicy.tier,
        status: 'scheduled' as const,
        scheduled_at: input.scheduledAt,
        created_at: input.timestamp,
        updated_at: input.timestamp,
        policy_consumption: resolvedPolicy.consumption,
      }

      try {
        return await this.interviewRepository.createDirectInterview(
          createInterviewInput,
          this.postCommitEventPublisher
            ? {
                buildPostCommitEvent: function buildCreatedEvent(interview) {
                  return buildInterviewCreatedEvent({
                    interview: {
                      id: interview.id,
                      scheduler_id: interview.scheduler_id,
                      interviewer_id: interview.interviewer_id,
                      type: interview.type,
                      mode: interview.mode as 'ai_led',
                      tier: interview.tier,
                      status: interview.status as 'scheduled',
                      scheduled_at: interview.scheduled_at,
                    },
                  })
                },
              }
            : undefined,
        )
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

  private async flushPostCommitEventsSafely(): Promise<void> {
    if (!this.postCommitEventPublisher) {
      return
    }

    await this.interviewRepository.flushPostCommitEvents(this.postCommitEventPublisher, {
      now: this.now(),
    })
  }
}

function buildCancelledInterviewEvent(interview: Interview) {
  return buildInterviewCancelledEvent({
    interview: {
      id: interview.id,
      scheduler_id: interview.scheduler_id,
      interviewer_id: interview.interviewer_id,
      type: interview.type,
      mode: interview.mode,
      tier: interview.tier,
      status: interview.status as 'cancelled',
      scheduled_at: interview.scheduled_at,
    },
  })
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
