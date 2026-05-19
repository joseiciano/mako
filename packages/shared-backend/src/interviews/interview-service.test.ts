import type { Interview } from '@mako/shared'
import { describe, expect, it } from 'vitest'
import {
  InterviewRepository,
  createInMemoryInterviewDataSource,
} from './interview-repository'
import {
  InterviewBusinessRuleError,
  InterviewConflictError,
  InterviewNotFoundError,
  InterviewUnauthorizedError,
  type InterviewSession,
} from './types'
import { InterviewService } from './interview-service'
import type { InterviewPostCommitEvent } from './interview-post-commit-event'

const activeSession: InterviewSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@mako.dev',
}

describe('InterviewService', function interviewServiceSuite() {
  it('requires authentication for direct interview create requests', async function run() {
    const { service } = createInterviewService({
      freeAiInterviews: 1,
      credits: 0,
    })

    await expect(
      service.createInterview(null, {
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      }),
    ).rejects.toBeInstanceOf(InterviewUnauthorizedError)
  })

  it('creates ai-led interviews from free quota when available', async function run() {
    const { service, repository } = createInterviewService({
      freeAiInterviews: 1,
      credits: 3,
    })

    const response = await service.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    expect(response.interview).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      scheduler_id: activeSession.userId,
      mode: 'ai_led',
      tier: 'standard',
      scheduled_at: '2026-04-13T10:00:00.000Z',
    })

    await expect(repository.getAccountPolicy(activeSession.userId)).resolves.toEqual({
      credits: 3,
      free_ai_interviews: 0,
    })
  })

  it('creates ai-led interviews from credits when free quota is exhausted', async function run() {
    const { service, repository } = createInterviewService({
      freeAiInterviews: 0,
      credits: 2,
    })

    const response = await service.createInterview(activeSession, {
      type: 'coding',
      mode: 'ai_led',
      scheduled_at: '2026-05-01T15:00:00.000Z',
    })

    expect(response.interview).toMatchObject({
      type: 'coding',
      tier: 'premium',
      scheduled_at: '2026-05-01T15:00:00.000Z',
    })

    await expect(repository.getAccountPolicy(activeSession.userId)).resolves.toEqual({
      credits: 1,
      free_ai_interviews: 0,
    })
  })

  it('rejects ai-led create requests when no free quota or credits remain', async function run() {
    const { service } = createInterviewService({
      freeAiInterviews: 0,
      credits: 0,
    })

    await expect(
      service.createInterview(activeSession, {
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      }),
    ).rejects.toBeInstanceOf(InterviewBusinessRuleError)
  })

  it('resolves effective tiers from injected policy config instead of hardcoding', async function run() {
    const { service } = createInterviewService(
      {
        freeAiInterviews: 0,
        credits: 1,
      },
      {
        freeAiInterviewTier: 'premium',
        creditAiInterviewTier: 'standard',
      },
    )

    const response = await service.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    expect(response.interview.tier).toBe('standard')
  })

  it('lists participant interviews with shared query defaults and filtering', async function run() {
    const { service } = createInterviewService(
      {
        freeAiInterviews: 0,
        credits: 0,
      },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          scheduled_at: '2026-04-14T10:00:00.000Z',
        }),
        createInterviewRecord({
          id: '22222222-2222-4222-8222-222222222222',
          interviewer_id: activeSession.userId,
          scheduled_at: '2026-04-13T10:00:00.000Z',
        }),
        createInterviewRecord({
          id: '44444444-4444-4444-8444-444444444444',
          scheduler_id: activeSession.userId,
          status: 'cancelled',
        }),
      ],
    )

    const response = await service.listInterviews(activeSession, {
      status: 'scheduled',
      limit: 1,
      offset: 0,
    })

    expect(response).toEqual({
      interviews: [
        expect.objectContaining({
          id: '22222222-2222-4222-8222-222222222222',
          interviewer_id: activeSession.userId,
        }),
      ],
    })
  })

  it('cancels scheduled interviews and treats repeated cancellation as idempotent success', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      {
        freeAiInterviews: 0,
        credits: 0,
      },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    )

    await expect(
      service.cancelInterview(activeSession, { id: interviewId }),
    ).resolves.toEqual({ success: true })
    await expect(
      service.cancelInterview(activeSession, { id: interviewId }),
    ).resolves.toEqual({ success: true })
  })

  it('rejects cancel requests for non-scheduled interviews', async function run() {
    const { service } = createInterviewService(
      {
        freeAiInterviews: 0,
        credits: 0,
      },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
    )

    await expect(
      service.cancelInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
  })

  it('rejects cancel requests when the participant cannot access the interview', async function run() {
    const { service } = createInterviewService(
      {
        freeAiInterviews: 0,
        credits: 0,
      },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: '99999999-9999-4999-8999-999999999999',
        }),
      ],
    )

    await expect(
      service.cancelInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)
  })

  it('emits interview.created after successful AI-led create when publisher is provided', async function run() {
    const publishedEvents: InterviewPostCommitEvent[] = []
    const { service } = createInterviewService(
      {
        freeAiInterviews: 1,
        credits: 0,
      },
      undefined,
      [],
      {
        publish: async function publish(event) {
          publishedEvents.push(event)
        },
      },
    )

    const response = await service.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0]).toMatchObject({
      event_type: 'interview.created',
      interview: {
        id: response.interview.id,
        scheduler_id: activeSession.userId,
        interviewer_id: null,
        mode: 'ai_led',
        tier: 'standard',
      },
      participants: {
        scheduler_user_id: activeSession.userId,
        interviewer_user_id: null,
      },
    })
    expect(publishedEvents[0]?.idempotency_key).toBe(
      `interview.created:${response.interview.id}`,
    )
  })

  it('does not emit interview.created when publisher is absent', async function run() {
    const { service } = createInterviewService({
      freeAiInterviews: 1,
      credits: 0,
    })

    await service.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    // No publisher was provided; no error should occur
    expect(true).toBe(true)
  })

  it('emits interview.cancelled only on first successful cancel', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const publishedEvents: InterviewPostCommitEvent[] = []
    const { service } = createInterviewService(
      {
        freeAiInterviews: 0,
        credits: 0,
      },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
      {
        publish: async function publish(event) {
          publishedEvents.push(event)
        },
      },
    )

    await service.cancelInterview(activeSession, { id: interviewId })
    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0]).toMatchObject({
      event_type: 'interview.cancelled',
      interview: {
        id: interviewId,
        status: 'cancelled',
      },
    })

    await service.cancelInterview(activeSession, { id: interviewId })
    expect(publishedEvents).toHaveLength(1)
  })

  it('does not emit interview.cancelled when publisher is absent', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      {
        freeAiInterviews: 0,
        credits: 0,
      },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    )

    await service.cancelInterview(activeSession, { id: interviewId })

    // No publisher was provided; no error should occur
    expect(true).toBe(true)
  })
})

function createInterviewService(
  accountState: {
    freeAiInterviews: number
    credits: number
  },
  policyConfig?: {
    freeAiInterviewTier: 'standard' | 'premium'
    creditAiInterviewTier: 'standard' | 'premium'
  },
  seedInterviews: readonly Interview[] = [],
  postCommitEventPublisher?: {
    publish(event: InterviewPostCommitEvent): Promise<void>
  },
) {
  const repository = new InterviewRepository(
    createInMemoryInterviewDataSource([
      {
        userId: activeSession.userId,
        credits: accountState.credits,
        freeAiInterviews: accountState.freeAiInterviews,
      },
    ], seedInterviews),
  )
  const service = new InterviewService(
    repository,
    policyConfig,
    function createId() {
      return '22222222-2222-4222-8222-222222222222'
    },
    function now() {
      return '2026-04-13T10:00:00.000Z'
    },
    postCommitEventPublisher ?? null,
  )

  return {
    repository,
    service,
  }
}

function createInterviewRecord(overrides: Partial<Interview> = {}): Interview {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-04-13T10:00:00.000Z',
    created_at: '2026-04-13T09:55:00.000Z',
    updated_at: '2026-04-13T09:55:00.000Z',
    ...overrides,
  }
}
