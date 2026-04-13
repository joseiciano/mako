import type {
  CreateInterviewRequest,
  CreateInterviewResponse,
  Interview,
} from '@mako/shared'
import { buildInterviewAliases } from '../interview'
import { InterviewRepository } from './interview-repository'
import {
  InterviewBusinessRuleError,
  InterviewNotFoundError,
  InterviewPolicyConflictError,
  InterviewUnauthorizedError,
  authenticatedInterviewUserIdSchema,
  toCreateInterviewResponse,
  type InterviewPolicyConfig,
  type InterviewSession,
  type ResolvedInterviewCreatePolicy,
} from './types'

export class InterviewService {
  constructor(
    private readonly interviewRepository: InterviewRepository,
    private readonly interviewPolicyConfig: InterviewPolicyConfig = {
      freeAiInterviewTier: 'standard',
      creditAiInterviewTier: 'premium',
    },
    private readonly createId: () => string = defaultCreateId,
    private readonly now: () => string = defaultNow,
  ) {}

  async createInterview(
    session: InterviewSession | null,
    input: CreateInterviewRequest,
  ): Promise<CreateInterviewResponse> {
    const userSession = this.requireSession(session)
    const schedulerId = authenticatedInterviewUserIdSchema.parse(userSession.userId)

    const createdInterview = await this.createAiLedInterview({
      schedulerId,
      type: input.type,
      scheduledAt: input.scheduled_at === 'now' ? this.now() : input.scheduled_at,
    })

    return toCreateInterviewResponse(createdInterview)
  }

  private async createAiLedInterview(input: {
    schedulerId: string
    type: CreateInterviewRequest['type']
    scheduledAt: string
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

      const timestamp = this.now()
      const aliases = buildInterviewAliases('ai_led')

      try {
        return await this.interviewRepository.createDirectInterview({
          id: this.createId(),
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
        })
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
