import type { Interview } from '@mako/shared'
import { describe, expect, it } from 'vitest'
import type { InterviewNotificationEvent } from '../notifications'
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

  it('rejects create when notification publisher is not configured', async function run() {
    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource([
        {
          userId: activeSession.userId,
          credits: 1,
          freeAiInterviews: 0,
        },
      ]),
    )
    const service = new InterviewService(repository)

    await expect(
      service.createInterview(activeSession, {
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      }),
    ).rejects.toThrow('InterviewService notification publisher is not configured')
  })

  it('rejects cancel when notification publisher is not configured', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [
          {
            userId: activeSession.userId,
            credits: 0,
            freeAiInterviews: 0,
          },
        ],
        [
          createInterviewRecord({
            id: interviewId,
            scheduler_id: activeSession.userId,
          }),
        ],
      ),
    )
    const service = new InterviewService(repository)

    await expect(
      service.cancelInterview(activeSession, { id: interviewId }),
    ).rejects.toThrow('InterviewService notification publisher is not configured')
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

  it('emits interview.created event on successful AI-led create', async function run() {
    const publishedEvents: InterviewNotificationEvent[] = []
    const { service } = createInterviewService(
      {
        freeAiInterviews: 1,
        credits: 0,
      },
      undefined,
      [],
      function publishNotification(event) {
        publishedEvents.push(event)
      },
    )

    const response = await service.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    expect(publishedEvents).toHaveLength(1)
    const event = publishedEvents[0]
    expect(event.event_type).toBe('interview.created')
    expect(event.interview.id).toBe(response.interview.id)
    expect(event.interview.scheduler_id).toBe(activeSession.userId)
    expect(event.interview.interviewer_id).toBeNull()
    expect(event.participants.scheduler_user_id).toBe(
      response.interview.scheduler_id,
    )
    expect(event.participants.interviewer_user_id).toBe(
      response.interview.interviewer_id,
    )
    expect(event.occurred_at).toBe(response.interview.created_at)
  })

  it('emits interview.cancelled event on first cancel', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const publishedEvents: InterviewNotificationEvent[] = []
    const { service, repository } = createInterviewService(
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
      function publishNotification(event) {
        publishedEvents.push(event)
      },
    )

    await service.cancelInterview(activeSession, { id: interviewId })

    expect(publishedEvents).toHaveLength(1)
    const event = publishedEvents[0]
    expect(event.event_type).toBe('interview.cancelled')
    expect(event.interview.id).toBe(interviewId)
    expect(event.participants.scheduler_user_id).toBe(activeSession.userId)
    expect(event.participants.interviewer_user_id).toBeNull()

    const cancelledInterview = await repository.listParticipantInterviews({
      participant_user_id: activeSession.userId,
      status: 'cancelled',
      limit: 1,
      offset: 0,
    })
    expect(event.occurred_at).toBe(cancelledInterview[0].updated_at)
  })

  it('emits interview.cancelled event preserving peer-to-peer interviewer_id on first cancel', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const interviewerId = '77777777-7777-4777-8777-777777777777'
    const publishedEvents: InterviewNotificationEvent[] = []
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
          interviewer_id: interviewerId,
          mode: 'peer_to_peer',
        }),
      ],
      function publishNotification(event) {
        publishedEvents.push(event)
      },
    )

    await service.cancelInterview(activeSession, { id: interviewId })

    expect(publishedEvents).toHaveLength(1)
    const event = publishedEvents[0]
    expect(event.event_type).toBe('interview.cancelled')
    expect(event.interview.interviewer_id).toBe(interviewerId)
    expect(event.participants.interviewer_user_id).toBe(interviewerId)
    expect(event.interview.interviewer_id).toBe(
      event.participants.interviewer_user_id,
    )
  })

  it('does not emit a second event on repeated cancel', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const publishedEvents: InterviewNotificationEvent[] = []
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
      function publishNotification(event) {
        publishedEvents.push(event)
      },
    )

    await service.cancelInterview(activeSession, { id: interviewId })
    await service.cancelInterview(activeSession, { id: interviewId })

    expect(publishedEvents).toHaveLength(1)
  })

  it('does not emit event on cancel for invalid_status', async function run() {
    const publishedEvents: InterviewNotificationEvent[] = []
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
      function publishNotification(event) {
        publishedEvents.push(event)
      },
    )

    await expect(
      service.cancelInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewConflictError)

    expect(publishedEvents).toHaveLength(0)
  })

  it('does not emit event on cancel for not_found', async function run() {
    const publishedEvents: InterviewNotificationEvent[] = []
    const { service } = createInterviewService(
      {
        freeAiInterviews: 0,
        credits: 0,
      },
      undefined,
      [],
      function publishNotification(event) {
        publishedEvents.push(event)
      },
    )

    await expect(
      service.cancelInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)

    expect(publishedEvents).toHaveLength(0)
  })

  it('rejects when async publishNotification fails after commit', async function run() {
    const { service } = createInterviewService(
      {
        freeAiInterviews: 1,
        credits: 0,
      },
      undefined,
      [],
      function publishNotification() {
        return Promise.reject(new Error('Queue unreachable'))
      },
    )

    await expect(
      service.createInterview(activeSession, {
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      }),
    ).rejects.toThrow('Queue unreachable')
  })

  it('rejects when async publishNotification fails after cancel commit', async function run() {
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
      function publishNotification() {
        return Promise.reject(new Error('Queue unreachable'))
      },
    )

    await expect(
      service.cancelInterview(activeSession, { id: interviewId }),
    ).rejects.toThrow('Queue unreachable')
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
  publishNotification?: (event: InterviewNotificationEvent) => Promise<void> | void,
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
    // Story 4.3: replace no-op with real queue transport wiring
    publishNotification ?? function noOpPublishNotification() {},
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
