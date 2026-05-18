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
import type {
  InterviewPostCommitEvent,
  InterviewPostCommitEventPublisher,
} from './interview-post-commit-event'

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

  it('allows interviewers to cancel scheduled interviews they are assigned to', async function run() {
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
          scheduler_id: '99999999-9999-4999-8999-999999999999',
          interviewer_id: activeSession.userId,
        }),
      ],
    )

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

  it('rejects cancel requests for completed interviews', async function run() {
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
          status: 'completed',
        }),
      ],
    )

    await expect(
      service.cancelInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
  })

  it('rejects cancel requests when the user is not authenticated', async function run() {
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
        }),
      ],
    )

    await expect(
      service.cancelInterview(null, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewUnauthorizedError)
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

  it('publishes one created event after successful direct interview create', async function run() {
    const publishedEvents: InterviewPostCommitEvent[] = []
    const { service } = createInterviewService(
      {
        freeAiInterviews: 1,
        credits: 0,
      },
      undefined,
      [],
      {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
    )

    await service.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0]).toMatchObject({
      event_type: 'interview.created',
    })
  })

  it('does not publish created event when create fails from auth problems', async function run() {
    const publishedEvents: InterviewPostCommitEvent[] = []
    const { service } = createInterviewService(
      {
        freeAiInterviews: 1,
        credits: 0,
      },
      undefined,
      [],
      {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
    )

    await expect(
      service.createInterview(null, {
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      }),
    ).rejects.toBeInstanceOf(InterviewUnauthorizedError)

    expect(publishedEvents).toHaveLength(0)
  })

  it('does not publish created event when create fails from business rules', async function run() {
    const publishedEvents: InterviewPostCommitEvent[] = []
    const { service } = createInterviewService(
      {
        freeAiInterviews: 0,
        credits: 0,
      },
      undefined,
      [],
      {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
    )

    await expect(
      service.createInterview(activeSession, {
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      }),
    ).rejects.toBeInstanceOf(InterviewBusinessRuleError)

    expect(publishedEvents).toHaveLength(0)
  })

  it('returns success when create succeeds but publish fails', async function run() {
    const loggedErrors: Array<{ event: string; context: Record<string, unknown> }> = []
    const { service } = createInterviewService(
      {
        freeAiInterviews: 1,
        credits: 0,
      },
      undefined,
      [],
      {
        async publish() {
          throw new Error('publish failed')
        },
      },
      {
        error(_event, context) {
          loggedErrors.push({ event: _event, context })
        },
      },
    )

    const response = await service.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    expect(response.interview).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      scheduler_id: activeSession.userId,
    })
    expect(loggedErrors).toHaveLength(1)
    expect(loggedErrors[0].event).toBe('interview.post_commit_publish_failure')
    expect(loggedErrors[0].context).toMatchObject({
      operation: 'create',
      interview_id: '22222222-2222-4222-8222-222222222222',
      error_message: 'publish failed',
    })
  })

  it('returns success when create succeeds but publish and logger both fail', async function run() {
    const { service } = createInterviewService(
      {
        freeAiInterviews: 1,
        credits: 0,
      },
      undefined,
      [],
      {
        async publish() {
          throw new Error('publish failed')
        },
      },
      {
        error() {
          throw new Error('logger failed')
        },
      },
    )

    const response = await service.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    expect(response.interview).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      scheduler_id: activeSession.userId,
    })
  })

  it('publishes one cancelled event when cancel outcome is cancelled', async function run() {
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
        async publish(event) {
          publishedEvents.push(event)
        },
      },
    )

    await service.cancelInterview(activeSession, { id: interviewId })

    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0]).toMatchObject({
      event_type: 'interview.cancelled',
    })
  })

  it('returns success when cancel succeeds but publish fails', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const loggedErrors: Array<{ event: string; context: Record<string, unknown> }> = []
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
        async publish() {
          throw new Error('publish failed')
        },
      },
      {
        error(_event, context) {
          loggedErrors.push({ event: _event, context })
        },
      },
    )

    const response = await service.cancelInterview(activeSession, {
      id: interviewId,
    })

    expect(response).toEqual({ success: true })
    expect(loggedErrors).toHaveLength(1)
    expect(loggedErrors[0].event).toBe('interview.post_commit_publish_failure')
    expect(loggedErrors[0].context).toMatchObject({
      operation: 'cancel',
      interview_id: interviewId,
      error_message: 'publish failed',
    })
  })

  it('returns success when cancel succeeds but publish and logger both fail', async function run() {
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
      {
        async publish() {
          throw new Error('publish failed')
        },
      },
      {
        error() {
          throw new Error('logger failed')
        },
      },
    )

    const response = await service.cancelInterview(activeSession, {
      id: interviewId,
    })

    expect(response).toEqual({ success: true })
  })

  it('does not publish cancelled event for already_cancelled outcome', async function run() {
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
          status: 'cancelled',
        }),
      ],
      {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
    )

    await service.cancelInterview(activeSession, { id: interviewId })

    expect(publishedEvents).toHaveLength(0)
  })

  it('does not publish cancelled event for invalid_status outcome', async function run() {
    const publishedEvents: InterviewPostCommitEvent[] = []
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
      {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
    )

    await expect(
      service.cancelInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewConflictError)

    expect(publishedEvents).toHaveLength(0)
  })

  it('does not publish cancelled event for not_found outcome', async function run() {
    const publishedEvents: InterviewPostCommitEvent[] = []
    const { service } = createInterviewService(
      {
        freeAiInterviews: 0,
        credits: 0,
      },
      undefined,
      [],
      {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
    )

    await expect(
      service.cancelInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)

    expect(publishedEvents).toHaveLength(0)
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
  postCommitEventPublisher?: InterviewPostCommitEventPublisher,
  logger?: { error(event: string, context: Record<string, unknown>): void | Promise<void> },
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
    postCommitEventPublisher,
    logger,
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
