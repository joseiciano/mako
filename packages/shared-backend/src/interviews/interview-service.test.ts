import type { Interview } from '@mako/shared'
import { describe, expect, it, vi } from 'vitest'
import {
  InterviewRepository,
  createInMemoryInterviewDataSource,
} from './interview-repository'
import {
  InterviewBusinessRuleError,
  InterviewConflictError,
  InterviewNotFoundError,
  InterviewUnauthorizedError,
  parseInterview,
  type InterviewSession,
} from './types'
import { InterviewService, type InterviewServiceLogger } from './interview-service'
import { createDemoRealtimeProvider, type RealtimeProvider } from './realtime-provider'
import { createInMemoryTimerOrchestration, type TimerOrchestrationPort } from './timer-orchestration'
import { AiChatRepository, AiChatUnavailableError } from './ai-chat-repository'
import type { AiChatServicePort } from './types'
import type {
  InterviewPostCommitEvent,
  InterviewPostCommitEventPublisher,
} from './interview-post-commit-event'
import { TierPolicyService } from '../tier-policy'

const activeSession: InterviewSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@mako.dev',
}

const noOpTestLogger: InterviewServiceLogger = {
  error: async () => undefined,
  info: async () => undefined,
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
      free_standard_interviews: 1,
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
      free_standard_interviews: 1,
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

  it('returns interview detail without collaboration credentials for participants', async function run() {
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
          realtime_session_id: 'sess_abc123',
          excalidraw_room_id: 'room_def456',
          excalidraw_key: 'key_ghi789',
          recording_url: 'https://r2.example.com/recording.mp4',
        }),
      ],
    )

    const response = await service.getInterview(activeSession, {
      id: '33333333-3333-4333-8333-333333333333',
    })

    expect(response.interview).not.toHaveProperty('realtime_session_id')
    expect(response.interview).not.toHaveProperty('excalidraw_room_id')
    expect(response.interview).not.toHaveProperty('excalidraw_key')
    expect(response.interview.recording_url).toBe('https://r2.example.com/recording.mp4')
  })

  it('rejects get interview requests for non-participants', async function run() {
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
      service.getInterview(activeSession, { id: '33333333-3333-4333-8333-333333333333' }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)
  })

  it('rejects get interview requests without authentication', async function run() {
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
      service.getInterview(null, { id: '33333333-3333-4333-8333-333333333333' }),
    ).rejects.toBeInstanceOf(InterviewUnauthorizedError)
  })

  it('cancels scheduled interviews and treats repeated cancellation as idempotent success without emitting a second event', async function run() {
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

    await expect(
      service.cancelInterview(activeSession, { id: interviewId }),
    ).resolves.toEqual({ success: true })
    await expect(
      service.cancelInterview(activeSession, { id: interviewId }),
    ).resolves.toEqual({ success: true })

    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0]).toMatchObject({
      event_type: 'interview.cancelled',
    })
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

  it('publishes one created event after successful direct interview create with participant mirrors', async function run() {
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
    const createdEvent = publishedEvents[0]
    expect(createdEvent).toMatchObject({
      event_type: 'interview.created',
      interview: {
        scheduler_id: activeSession.userId,
        interviewer_id: null,
        mode: 'ai_led',
      },
      participants: {
        scheduler_user_id: activeSession.userId,
        interviewer_user_id: null,
      },
    })
    expect(createdEvent.interview.scheduler_id).toBe(
      createdEvent.participants.scheduler_user_id,
    )
    expect(createdEvent.interview.interviewer_id).toBe(
      createdEvent.participants.interviewer_user_id,
    )
  })

  it('outbox event reflects actual persisted interview tier after policy resolution', async function run() {
    const persistedOutboxEvents: import('../notification-queue-event-contract').NotificationQueueEvent[] = []
    const publishedEvents: InterviewPostCommitEvent[] = []
    const issuedIds: string[] = []

    const mockNotificationService = {
      async persistOutboxEvent(): Promise<void> {},
    } as unknown as import('../notifications').NotificationService

    const mockPostCommitPublisher: InterviewPostCommitEventPublisher = {
      async publish(event): Promise<void> {
        publishedEvents.push(event)
      },
    }

    const mockNotificationTransport = {
      async send(): Promise<void> {},
    } as unknown as import('../notifications').NotificationTransport

    const repository = new InterviewRepository({
      dataSource: {
        getAccountPolicy: async () => ({ credits: 2, free_standard_interviews: 1, free_ai_interviews: 0 }),
        createDirectInterview: async (input, outboxEvent) => {
          if (outboxEvent) {
            persistedOutboxEvents.push(outboxEvent)
          }
          return parseInterview({
            ...input,
            realtime_session_id: null,
            excalidraw_room_id: null,
            excalidraw_key: null,
            recording_url: null,
            screenshot_urls: null,
            feedback: null,
            started_at: null,
            expires_at: null,
            warning_at: null,
          })
        },
      },
    })

    const service = new InterviewService(
      repository,
      undefined,
      function createId() {
        const value =
          issuedIds.length === 0
            ? '22222222-2222-4222-8222-222222222222'
            : `33333333-3333-4333-8333-${String(issuedIds.length).padStart(12, '0')}`

        issuedIds.push(value)
        return value
      },
      function now() {
        return '2026-04-13T10:00:00.000Z'
      },
      mockPostCommitPublisher,
      undefined,
      mockNotificationService,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
    )

    const response = await service.createInterview(activeSession, {
      type: 'coding',
      mode: 'ai_led',
      scheduled_at: '2026-05-01T15:00:00.000Z',
    })

    // The created interview should have premium tier (from credits)
    expect(response.interview.tier).toBe('premium')

    // The outbox event should also have premium tier
    expect(persistedOutboxEvents).toHaveLength(1)
    const outboxEvent = persistedOutboxEvents[0]
    expect(outboxEvent.event_type).toBe('interview.created')

    const interviewPayload = outboxEvent.interview as Record<string, unknown>
    expect(interviewPayload.tier).toBe('premium')
    expect(interviewPayload.id).toBe(response.interview.id)
    expect(interviewPayload.scheduler_id).toBe(activeSession.userId)

    // Persisted outbox event and post-commit publish should reuse the same created event.
    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0]).toEqual(outboxEvent)
    expect(publishedEvents[0].event_id).toBe(outboxEvent.event_id)

    // createId should be used for interview id + one created event id only.
    expect(issuedIds).toHaveLength(2)
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

  it('publishes cancelled events with participant mirrors matching persisted interview shape', async function run() {
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
          interviewer_id: '88888888-8888-4888-8888-888888888888',
          mode: 'peer_to_peer',
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
    const cancelledEvent = publishedEvents[0]
    expect(cancelledEvent).toMatchObject({
      event_type: 'interview.cancelled',
      interview: {
        id: interviewId,
        scheduler_id: activeSession.userId,
        interviewer_id: '88888888-8888-4888-8888-888888888888',
        mode: 'peer_to_peer',
        status: 'cancelled',
      },
      participants: {
        scheduler_user_id: activeSession.userId,
        interviewer_user_id: '88888888-8888-4888-8888-888888888888',
      },
    })
    expect(cancelledEvent.interview.scheduler_id).toBe(
      cancelledEvent.participants.scheduler_user_id,
    )
    expect(cancelledEvent.interview.interviewer_id).toBe(
      cancelledEvent.participants.interviewer_user_id,
    )
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

  it('prefers notificationDispatchService+transport over legacy postCommitEventPublisher for create and does not double-send', async function run() {
    const dispatchedIdempotencyKeys: string[] = []
    const publishedEvents: InterviewPostCommitEvent[] = []

    const mockNotificationDispatchService = {
      async dispatchOutboxEventByIdempotencyKey(
        idempotencyKey: string,
        _transport: import('../notifications').NotificationTransport,
      ): Promise<void> {
        dispatchedIdempotencyKeys.push(idempotencyKey)
      },
    } as unknown as import('../notifications').NotificationDispatchService

    const mockNotificationTransport = {
      async send(): Promise<void> {},
    } as unknown as import('../notifications').NotificationTransport

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
      undefined,
      undefined,
      mockNotificationDispatchService,
      mockNotificationTransport,
    )

    await service.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    expect(dispatchedIdempotencyKeys).toHaveLength(1)
    expect(publishedEvents).toHaveLength(0)
  })

  it('prefers notificationDispatchService+transport over legacy postCommitEventPublisher for cancel and does not double-send', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const dispatchedIdempotencyKeys: string[] = []
    const publishedEvents: InterviewPostCommitEvent[] = []

    const mockNotificationDispatchService = {
      async dispatchOutboxEventByIdempotencyKey(
        idempotencyKey: string,
        _transport: import('../notifications').NotificationTransport,
      ): Promise<void> {
        dispatchedIdempotencyKeys.push(idempotencyKey)
      },
    } as unknown as import('../notifications').NotificationDispatchService

    const mockNotificationTransport = {
      async send(): Promise<void> {},
    } as unknown as import('../notifications').NotificationTransport

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
      undefined,
      {
        async persistOutboxEvent(): Promise<void> {},
      } as unknown as import('../notifications').NotificationService,
      mockNotificationDispatchService,
      mockNotificationTransport,
    )

    await service.cancelInterview(activeSession, { id: interviewId })

    expect(dispatchedIdempotencyKeys).toHaveLength(1)
    expect(publishedEvents).toHaveLength(0)
  })

  it('logs interview.post_commit_dispatch_failure and returns success when create dispatch fails', async function run() {
    const loggedErrors: Array<{ event: string; context: Record<string, unknown> }> = []

    const mockNotificationDispatchService = {
      async dispatchOutboxEventByIdempotencyKey(): Promise<void> {
        throw new Error('dispatch failed')
      },
    } as unknown as import('../notifications').NotificationDispatchService

    const mockNotificationTransport = {
      async send(): Promise<void> {},
    } as unknown as import('../notifications').NotificationTransport

    const { service } = createInterviewService(
      {
        freeAiInterviews: 1,
        credits: 0,
      },
      undefined,
      [],
      undefined,
      {
        error(_event, context) {
          loggedErrors.push({ event: _event, context })
        },
      },
      undefined,
      mockNotificationDispatchService,
      mockNotificationTransport,
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
    expect(loggedErrors[0].event).toBe('interview.post_commit_dispatch_failure')
    expect(loggedErrors[0].context).toMatchObject({
      operation: 'create',
      interview_id: '22222222-2222-4222-8222-222222222222',
      error_message: 'dispatch failed',
    })
  })

  it('logs interview.post_commit_dispatch_failure and returns success when cancel dispatch fails', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const loggedErrors: Array<{ event: string; context: Record<string, unknown> }> = []

    const mockNotificationDispatchService = {
      async dispatchOutboxEventByIdempotencyKey(): Promise<void> {
        throw new Error('dispatch failed')
      },
    } as unknown as import('../notifications').NotificationDispatchService

    const mockNotificationTransport = {
      async send(): Promise<void> {},
    } as unknown as import('../notifications').NotificationTransport

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
      undefined,
      {
        error(_event, context) {
          loggedErrors.push({ event: _event, context })
        },
      },
      {
        async persistOutboxEvent(): Promise<void> {},
      } as unknown as import('../notifications').NotificationService,
      mockNotificationDispatchService,
      mockNotificationTransport,
    )

    const response = await service.cancelInterview(activeSession, { id: interviewId })

    expect(response).toEqual({ success: true })
    expect(loggedErrors).toHaveLength(1)
    expect(loggedErrors[0].event).toBe('interview.post_commit_dispatch_failure')
    expect(loggedErrors[0].context).toMatchObject({
      operation: 'cancel',
      interview_id: interviewId,
      error_message: 'dispatch failed',
    })
  })

  it('requires authentication for interview provisioning', async function run() {
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [createInterviewRecord({ id: '33333333-3333-4333-8333-333333333333' })],
    )

    await expect(
      service.provisionInterview(null, { id: '33333333-3333-4333-8333-333333333333' }),
    ).rejects.toBeInstanceOf(InterviewUnauthorizedError)
  })

  it('rejects provisioning for authenticated non-participants', async function run() {
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: '99999999-9999-4999-8999-999999999999',
        }),
      ],
    )

    await expect(
      service.provisionInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)
  })

  it('persists and returns provision credentials for participant join', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service, repository } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [createInterviewRecord({ id: interviewId, scheduler_id: activeSession.userId })],
    )

    const response = await service.provisionInterview(activeSession, { id: interviewId })

    expect(response).toEqual({
      mode: 'ai_led',
      realtime: {
        realtime_session_id: 'realtime_33333333-3333-4333-8333-333333333333',
        token: 'realtime_token_33333333-3333-4333-8333-333333333333',
      },
      excalidraw: {
        excalidraw_room_id: 'excalidraw_room_33333333-3333-4333-8333-333333333333',
        excalidraw_key: 'excalidraw_key_33333333-3333-4333-8333-333333333333',
      },
    })

    const persistedInterview = await repository.getInterviewById(interviewId)
    expect(persistedInterview).toMatchObject({
      realtime_session_id: response.realtime.realtime_session_id,
      excalidraw_room_id: response.excalidraw.excalidraw_room_id,
      excalidraw_key: response.excalidraw.excalidraw_key,
      status: 'scheduled',
    })
  })

  it('reuses persisted provision credentials on repeated participant joins', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          realtime_session_id: 'rt_existing',
          excalidraw_room_id: 'room_existing',
          excalidraw_key: 'key_existing',
        }),
      ],
    )

    const firstResponse = await service.provisionInterview(activeSession, { id: interviewId })
    const secondResponse = await service.provisionInterview(activeSession, { id: interviewId })

    expect(secondResponse.realtime.realtime_session_id).toBe(firstResponse.realtime.realtime_session_id)
    expect(secondResponse.excalidraw).toEqual(firstResponse.excalidraw)
  })

  it('throws when repository reports provisioned interview without realtime session id', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    let tokenCreationCalled = false
    const realtimeProvider: RealtimeProvider = {
      async createSession() {
        return {
          realtimeSessionId: 'rt_created',
          excalidrawRoomId: 'room_created',
          excalidrawKey: 'key_created',
        }
      },
      async createParticipantToken() {
        tokenCreationCalled = true
        return { token: 'token_created' }
      },
    }
    const { service, repository } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [createInterviewRecord({ id: interviewId, scheduler_id: activeSession.userId })],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      realtimeProvider,
    )
    repository.provisionInterviewWithCredentialFactory = async function provisionInterviewWithCredentialFactory() {
      return {
        outcome: 'already_provisioned',
        interview: createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          realtime_session_id: null,
          excalidraw_room_id: 'room_existing',
          excalidraw_key: 'key_existing',
        }),
      }
    }

    await expect(service.provisionInterview(activeSession, { id: interviewId })).rejects.toThrow(
      'Provisioned interview is missing realtime session ID.',
    )
    expect(tokenCreationCalled).toBe(false)
  })

  it('returns the same peer-to-peer room and key to both assigned participants', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const interviewerSession: InterviewSession = {
      userId: '99999999-9999-4999-8999-999999999999',
      email: 'interviewer@mako.dev',
    }
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          interviewer_id: interviewerSession.userId,
          mode: 'peer_to_peer',
        }),
      ],
    )

    const schedulerResponse = await service.provisionInterview(activeSession, { id: interviewId })
    const interviewerResponse = await service.provisionInterview(interviewerSession, { id: interviewId })

    expect(interviewerResponse.mode).toBe('peer_to_peer')
    expect(interviewerResponse.realtime.realtime_session_id).toBe(
      schedulerResponse.realtime.realtime_session_id,
    )
    expect(interviewerResponse.excalidraw).toEqual(schedulerResponse.excalidraw)
  })

  it('rejects provisioning for terminal interview states', async function run() {
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
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
      service.provisionInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
  })

  it('does not log Realtime tokens or Excalidraw keys during provisioning', async function run() {
    const loggedEvents: Array<{ event: string; context: Record<string, unknown> }> = []
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
        }),
      ],
      undefined,
      {
        error(event, context) {
          loggedEvents.push({ event, context })
        },
        info(event, context) {
          loggedEvents.push({ event, context })
        },
      },
    )

    await service.provisionInterview(activeSession, {
      id: '33333333-3333-4333-8333-333333333333',
    })

    expect(JSON.stringify(loggedEvents)).not.toContain('realtime_token')
    expect(JSON.stringify(loggedEvents)).not.toContain('excalidraw_key')
  })

  it('logs structured provision start and success events', async function run() {
    const loggedEvents: Array<{ event: string; context: Record<string, unknown> }> = []
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
      undefined,
      {
        info(event, context) {
          loggedEvents.push({ event, context })
        },
      },
    )

    await service.provisionInterview(activeSession, { id: interviewId })

    const startLog = loggedEvents.find(function isStartLog(e) {
      return e.event === 'interview.provision_start'
    })
    expect(startLog).toBeDefined()
    expect(startLog!.context).toMatchObject({
      interview_id: interviewId,
      participant_user_id: activeSession.userId,
    })

    const successLog = loggedEvents.find(function isSuccessLog(e) {
      return e.event === 'interview.provision_success'
    })
    expect(successLog).toBeDefined()
    expect(successLog!.context).toMatchObject({
      interview_id: interviewId,
      participant_user_id: activeSession.userId,
      outcome: 'provisioned',
    })
  })

  it('logs provision failure event for terminal interview states', async function run() {
    const loggedEvents: Array<{ event: string; context: Record<string, unknown> }> = []
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          status: 'completed',
        }),
      ],
      undefined,
      {
        info(event, context) {
          loggedEvents.push({ event, context })
        },
      },
    )

    await expect(
      service.provisionInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewConflictError)

    const failureLog = loggedEvents.find(function isFailureLog(e) {
      return e.event === 'interview.provision_failure'
    })
    expect(failureLog).toBeDefined()
    expect(failureLog!.context).toMatchObject({
      interview_id: '33333333-3333-4333-8333-333333333333',
      participant_user_id: activeSession.userId,
      error_type: 'invalid_status',
    })
  })

  it('logs provision failure event for non-participant access', async function run() {
    const loggedEvents: Array<{ event: string; context: Record<string, unknown> }> = []
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: '99999999-9999-4999-8999-999999999999',
        }),
      ],
      undefined,
      {
        info(event, context) {
          loggedEvents.push({ event, context })
        },
      },
    )

    await expect(
      service.provisionInterview(activeSession, {
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)

    const failureLog = loggedEvents.find(function isFailureLog(e) {
      return e.event === 'interview.provision_failure'
    })
    expect(failureLog).toBeDefined()
    expect(failureLog!.context).toMatchObject({
      interview_id: '33333333-3333-4333-8333-333333333333',
      participant_user_id: activeSession.userId,
      error_type: 'not_found',
    })
  })

  it('does not mutate interview status during provisioning', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service, repository } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'scheduled',
        }),
      ],
    )

    await service.provisionInterview(activeSession, { id: interviewId })

    const persistedInterview = await repository.getInterviewById(interviewId)
    expect(persistedInterview).toMatchObject({
      status: 'scheduled',
    })
  })

  it('preserves all persisted provisioning fields across duplicate join attempts', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service, repository } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    )

    const firstResponse = await service.provisionInterview(activeSession, { id: interviewId })
    const secondResponse = await service.provisionInterview(activeSession, { id: interviewId })

    expect(secondResponse.realtime.realtime_session_id).toBe(firstResponse.realtime.realtime_session_id)
    expect(secondResponse.excalidraw).toEqual(firstResponse.excalidraw)

    const persistedInterview = await repository.getInterviewById(interviewId)
    expect(persistedInterview).toMatchObject({
      realtime_session_id: firstResponse.realtime.realtime_session_id,
      excalidraw_room_id: firstResponse.excalidraw.excalidraw_room_id,
      excalidraw_key: firstResponse.excalidraw.excalidraw_key,
      status: 'scheduled',
    })
  })

  it('starts scheduled interview, transitions to ongoing, returns lifecycle response', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    )

    const response = await service.startInterview(activeSession, { id: interviewId })

    expect(response.success).toBe(true)
    expect(response.interview).toMatchObject({
      id: interviewId,
      status: 'ongoing',
    })
  })

  it('start is idempotent - repeated start on ongoing interview returns success without mutation', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service, repository } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    )

    const firstResponse = await service.startInterview(activeSession, { id: interviewId })
    expect(firstResponse.interview.status).toBe('ongoing')

    const secondResponse = await service.startInterview(activeSession, { id: interviewId })
    expect(secondResponse.success).toBe(true)
    expect(secondResponse.interview.status).toBe('ongoing')

    const persisted = await repository.getInterviewById(interviewId)
    expect(persisted!.status).toBe('ongoing')
  })

  it('rejects start on completed interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'completed',
        }),
      ],
    )

    await expect(
      service.startInterview(activeSession, { id: interviewId }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
  })

  it('rejects start on cancelled interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'cancelled',
        }),
      ],
    )

    await expect(
      service.startInterview(activeSession, { id: interviewId }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
  })

  it('rejects start when user is not authenticated', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    )

    await expect(
      service.startInterview(null, { id: interviewId }),
    ).rejects.toBeInstanceOf(InterviewUnauthorizedError)
  })

  it('rejects start when user is not a participant', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: '99999999-9999-4999-8999-999999999999',
        }),
      ],
    )

    await expect(
      service.startInterview(activeSession, { id: interviewId }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)
  })

  it('ends ongoing interview, transitions to completed, returns lifecycle response', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
    )

    const response = await service.endInterview(activeSession, { id: interviewId })

    expect(response.success).toBe(true)
    expect(response.interview).toMatchObject({
      id: interviewId,
      status: 'completed',
    })
  })

  it('end is idempotent - repeated end on completed interview returns success without mutation', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service, repository } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
    )

    const firstResponse = await service.endInterview(activeSession, { id: interviewId })
    expect(firstResponse.interview.status).toBe('completed')

    const secondResponse = await service.endInterview(activeSession, { id: interviewId })
    expect(secondResponse.success).toBe(true)
    expect(secondResponse.interview.status).toBe('completed')

    const persisted = await repository.getInterviewById(interviewId)
    expect(persisted!.status).toBe('completed')
  })

  it('rejects end on scheduled interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    )

    await expect(
      service.endInterview(activeSession, { id: interviewId }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
  })

  it('rejects end on cancelled interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'cancelled',
        }),
      ],
    )

    await expect(
      service.endInterview(activeSession, { id: interviewId }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
  })

  it('rejects end when user is not authenticated', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
    )

    await expect(
      service.endInterview(null, { id: interviewId }),
    ).rejects.toBeInstanceOf(InterviewUnauthorizedError)
  })

  it('rejects end when user is not a participant', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: '99999999-9999-4999-8999-999999999999',
          status: 'ongoing',
        }),
      ],
    )

    await expect(
      service.endInterview(activeSession, { id: interviewId }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)
  })

  it('triggers timer orchestration on successful start', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const timerOrchestration = createInMemoryTimerOrchestration()
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      timerOrchestration,
    )

    await service.startInterview(activeSession, { id: interviewId })

    expect(timerOrchestration.calls).toHaveLength(1)
    expect(timerOrchestration.calls[0]).toMatchObject({
      interview_id: interviewId,
      started_at: '2026-04-13T10:00:00.000Z',
      expires_at: '2026-04-13T11:00:00.000Z',
      warning_at: '2026-04-13T10:55:00.000Z',
    })
  })

  it('does not trigger timer orchestration on already-ongoing start', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const timerOrchestration = createInMemoryTimerOrchestration()
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      timerOrchestration,
    )

    await service.startInterview(activeSession, { id: interviewId })

    expect(timerOrchestration.calls).toHaveLength(0)
  })

  it('persists timer fields on started interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service, repository } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    )

    await service.startInterview(activeSession, { id: interviewId })

    const persisted = await repository.getInterviewById(interviewId)
    expect(persisted).toMatchObject({
      status: 'ongoing',
      started_at: '2026-04-13T10:00:00.000Z',
      expires_at: '2026-04-13T11:00:00.000Z',
      warning_at: '2026-04-13T10:55:00.000Z',
    })
  })

  it('timer orchestration is idempotent - repeated start does not create duplicate timer', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const timerOrchestration = createInMemoryTimerOrchestration()
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      timerOrchestration,
    )

    await service.startInterview(activeSession, { id: interviewId })
    await service.startInterview(activeSession, { id: interviewId })

    expect(timerOrchestration.calls).toHaveLength(1)
  })

  it('manual end and timer completion converge on completed state', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service, repository } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
    )

    await service.endInterview(activeSession, { id: interviewId })

    const afterManualEnd = await repository.getInterviewById(interviewId)
    expect(afterManualEnd!.status).toBe('completed')

    const timerCompletionResult = await repository.transitionInterviewLifecycle({
      interview_id: interviewId,
      participant_user_id: activeSession.userId,
      action: 'end',
      updated_at: '2026-04-13T11:00:00.000Z',
    })

    expect(timerCompletionResult.outcome).toBe('already_completed')
  })

  it('concurrent start: two service starts converge to ongoing and timer is only created once', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const timerOrchestration = createInMemoryTimerOrchestration()
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      timerOrchestration,
    )

    const [firstResult, secondResult] = await Promise.all([
      service.startInterview(activeSession, { id: interviewId }),
      service.startInterview(activeSession, { id: interviewId }),
    ])

    expect(firstResult.success).toBe(true)
    expect(firstResult.interview.status).toBe('ongoing')
    expect(secondResult.success).toBe(true)
    expect(secondResult.interview.status).toBe('ongoing')
    expect(timerOrchestration.calls).toHaveLength(1)
  })

  it('concurrent end: two service ends converge to completed', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
    )

    const [firstResult, secondResult] = await Promise.all([
      service.endInterview(activeSession, { id: interviewId }),
      service.endInterview(activeSession, { id: interviewId }),
    ])

    expect(firstResult.success).toBe(true)
    expect(firstResult.interview.status).toBe('completed')
    expect(secondResult.success).toBe(true)
    expect(secondResult.interview.status).toBe('completed')
  })

  it('start vs end race: start wins from scheduled, end completes from ongoing', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service, repository } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    )

    const startResult = await service.startInterview(activeSession, { id: interviewId })
    expect(startResult.interview.status).toBe('ongoing')

    const endResult = await service.endInterview(activeSession, { id: interviewId })
    expect(endResult.interview.status).toBe('completed')

    const persisted = await repository.getInterviewById(interviewId)
    expect(persisted!.status).toBe('completed')
  })

  it('already_ongoing triggers timer orchestration when persisted timer fields exist', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const timerOrchestration = createInMemoryTimerOrchestration()
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
          started_at: '2026-04-13T10:00:00.000Z',
          expires_at: '2026-04-13T11:00:00.000Z',
          warning_at: '2026-04-13T10:55:00.000Z',
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      timerOrchestration,
    )

    await service.startInterview(activeSession, { id: interviewId })

    expect(timerOrchestration.calls).toHaveLength(1)
    expect(timerOrchestration.calls[0]).toMatchObject({
      interview_id: interviewId,
      started_at: '2026-04-13T10:00:00.000Z',
      expires_at: '2026-04-13T11:00:00.000Z',
      warning_at: '2026-04-13T10:55:00.000Z',
    })
  })

  it('lifecycle logs contain requested/succeeded events with safe contexts and no sensitive data', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const loggedEvents: Array<{ event: string; context: Record<string, unknown> }> = []
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
      undefined,
      {
        info(event, context) {
          loggedEvents.push({ event, context })
        },
      },
    )

    await service.startInterview(activeSession, { id: interviewId })

    const serializedLog = JSON.stringify(loggedEvents)
    expect(serializedLog).not.toContain('realtime_session_id')
    expect(serializedLog).not.toContain('excalidraw_key')
    expect(serializedLog).not.toContain('excalidraw_room_id')
    expect(serializedLog).not.toContain('token')

    const startRequestedLog = loggedEvents.find((e) => e.event === 'start_requested')
    expect(startRequestedLog).toBeDefined()
    expect(startRequestedLog!.context).toMatchObject({
      interview_id: interviewId,
      participant_user_id: activeSession.userId,
      action: 'start',
    })

    const startSucceededLog = loggedEvents.find((e) => e.event === 'start_succeeded')
    expect(startSucceededLog).toBeDefined()
    expect(startSucceededLog!.context).toMatchObject({
      interview_id: interviewId,
      participant_user_id: activeSession.userId,
      action: 'start',
      outcome: 'started',
    })
  })

  it('lifecycle end logs contain requested/succeeded events with safe contexts', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const loggedEvents: Array<{ event: string; context: Record<string, unknown> }> = []
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
      undefined,
      {
        info(event, context) {
          loggedEvents.push({ event, context })
        },
      },
    )

    await service.endInterview(activeSession, { id: interviewId })

    const endRequestedLog = loggedEvents.find((e) => e.event === 'end_requested')
    expect(endRequestedLog).toBeDefined()
    expect(endRequestedLog!.context).toMatchObject({
      interview_id: interviewId,
      participant_user_id: activeSession.userId,
      action: 'end',
    })

    const endSucceededLog = loggedEvents.find((e) => e.event === 'end_succeeded')
    expect(endSucceededLog).toBeDefined()
    expect(endSucceededLog!.context).toMatchObject({
      interview_id: interviewId,
      participant_user_id: activeSession.userId,
      action: 'end',
      outcome: 'completed',
    })
  })

  it('delegates aiChat to the repository and returns validated result', async function run() {
    let repositoryCallCount = 0
    const stubResponder: AiChatServicePort = {
      async generateReply(input) {
        repositoryCallCount += 1
        return {
          reply: 'You should add error handling.',
          guidance_mode: 'review',
          prompt_version: 'test-v1',
        }
      },
    }
    const aiChatRepository = new AiChatRepository(stubResponder)
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      undefined,
      aiChatRepository,
    )

    const result = await service.aiChat(activeSession, {
      interview_id: '33333333-3333-4333-8333-333333333333',
      message: 'What should I add next?',
      canvas_snapshot: {
        type: 'excalidraw_scene',
        scene: { elements: [] },
      },
      guidance_mode: 'review',
    })

    expect(result).toEqual({
      reply: 'You should add error handling.',
      guidance_mode: 'review',
      prompt_version: 'test-v1',
    })
    expect(repositoryCallCount).toBe(1)
  })

  it('rejects aiChat when the interview is not found for the participant', async function run() {
    const responderNeverCalled = { generateReply: vi.fn() }
    const aiChatRepository = new AiChatRepository(responderNeverCalled)
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      undefined,
      aiChatRepository,
    )

    await expect(
      service.aiChat(activeSession, {
        interview_id: '33333333-3333-4333-8333-333333333333',
        message: 'Hello',
        canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
        guidance_mode: 'review',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)

    expect(responderNeverCalled.generateReply).not.toHaveBeenCalled()
  })

  it('rejects aiChat when the participant is not on the interview', async function run() {
    const responderNeverCalled = { generateReply: vi.fn() }
    const aiChatRepository = new AiChatRepository(responderNeverCalled)
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: '99999999-9999-4999-8999-999999999999',
          mode: 'ai_led',
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      undefined,
      aiChatRepository,
    )

    await expect(
      service.aiChat(activeSession, {
        interview_id: '33333333-3333-4333-8333-333333333333',
        message: 'Hello',
        canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
        guidance_mode: 'review',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)

    expect(responderNeverCalled.generateReply).not.toHaveBeenCalled()
  })

  it('rejects aiChat when the interview mode is peer_to_peer', async function run() {
    const responderNeverCalled = { generateReply: vi.fn() }
    const aiChatRepository = new AiChatRepository(responderNeverCalled)
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'peer_to_peer',
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      undefined,
      aiChatRepository,
    )

    await expect(
      service.aiChat(activeSession, {
        interview_id: '33333333-3333-4333-8333-333333333333',
        message: 'Hello',
        canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
        guidance_mode: 'review',
      }),
    ).rejects.toBeInstanceOf(InterviewBusinessRuleError)

    expect(responderNeverCalled.generateReply).not.toHaveBeenCalled()
  })

  it('passes chat history through to the responder from aiChat', async function run() {
    let capturedHistory: unknown
    const stubResponder: AiChatServicePort = {
      async generateReply(input) {
        capturedHistory = input.chat_history
        return {
          reply: 'Looks good!',
          guidance_mode: 'review',
          prompt_version: 'test-v1',
        }
      },
    }
    const aiChatRepository = new AiChatRepository(stubResponder)
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      undefined,
      aiChatRepository,
    )

    await service.aiChat(activeSession, {
      interview_id: '33333333-3333-4333-8333-333333333333',
      message: 'What do you think?',
      canvas_snapshot: { type: 'excalidraw_scene', scene: { elements: [] } },
      guidance_mode: 'review',
      chat_history: [
        { role: 'user', content: 'Here is my design.' },
        { role: 'assistant', content: 'Consider a cache layer.' },
      ],
    })

    expect(capturedHistory).toEqual([
      { role: 'user', content: 'Here is my design.' },
      { role: 'assistant', content: 'Consider a cache layer.' },
    ])
  })

  it('does not mutate lifecycle fields after a successful aiChat', async function run() {
    const stubResponder: AiChatServicePort = {
      async generateReply() {
        return {
          reply: 'Looks good!',
          guidance_mode: 'review',
          prompt_version: 'test-v1',
        }
      },
    }
    const aiChatRepository = new AiChatRepository(stubResponder)
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const { service, repository } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
          status: 'ongoing',
          started_at: '2026-04-13T10:00:00.000Z',
          expires_at: '2026-04-13T11:00:00.000Z',
          warning_at: '2026-04-13T10:55:00.000Z',
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      undefined,
      aiChatRepository,
    )

    await service.aiChat(activeSession, {
      interview_id: interviewId,
      message: 'What do you think?',
      canvas_snapshot: { type: 'excalidraw_scene', scene: { elements: [] } },
      guidance_mode: 'review',
    })

    const after = await repository.getInterviewById(interviewId)
    expect(after).toMatchObject({
      status: 'ongoing',
      started_at: '2026-04-13T10:00:00.000Z',
      expires_at: '2026-04-13T11:00:00.000Z',
      warning_at: '2026-04-13T10:55:00.000Z',
    })
  })

  it('rejects aiChat when session is null', async function run() {
    const stubResponder: AiChatServicePort = {
      async generateReply() {
        return {
          reply: 'reply',
          guidance_mode: 'review',
          prompt_version: 'v1',
        }
      },
    }
    const aiChatRepository = new AiChatRepository(stubResponder)
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      undefined,
      aiChatRepository,
    )

    await expect(
      service.aiChat(null, {
        interview_id: '33333333-3333-4333-8333-333333333333',
        message: 'Hello',
        canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
        guidance_mode: 'review',
      }),
    ).rejects.toBeInstanceOf(InterviewUnauthorizedError)
  })

  it('throws when aiChatRepository is not configured', async function run() {
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
    )

    await expect(
      service.aiChat(activeSession, {
        interview_id: '33333333-3333-4333-8333-333333333333',
        message: 'Hello',
        canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
        guidance_mode: 'review',
      }),
    ).rejects.toBeInstanceOf(AiChatUnavailableError)
  })

  it('propagates responder errors from aiChat', async function run() {
    const stubResponder: AiChatServicePort = {
      async generateReply() {
        throw new Error('AI provider timeout')
      },
    }
    const aiChatRepository = new AiChatRepository(stubResponder)
    const { service } = createInterviewService(
      { freeAiInterviews: 0, credits: 0 },
      undefined,
      [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createDemoRealtimeProvider(),
      undefined,
      aiChatRepository,
    )

    await expect(
      service.aiChat(activeSession, {
        interview_id: '33333333-3333-4333-8333-333333333333',
        message: 'Hello',
        canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
        guidance_mode: 'review',
      }),
    ).rejects.toThrow('AI provider timeout')
  })
})

function createInterviewService(
  accountState: {
    freeAiInterviews: number
    freeStandardInterviews?: number
    credits: number
  },
  policyConfig?: {
    freeAiInterviewTier: 'standard' | 'premium'
    creditAiInterviewTier: 'standard' | 'premium'
  },
  seedInterviews: readonly Interview[] = [],
  postCommitEventPublisher?: InterviewPostCommitEventPublisher,
  logger?: Partial<InterviewServiceLogger>,
  notificationService?: import('../notifications').NotificationService,
  notificationDispatchService?: import('../notifications').NotificationDispatchService,
  notificationTransport?: import('../notifications').NotificationTransport,
  persistOutboxEvent?: (event: import('../notification-queue-event-contract').NotificationQueueEvent) => Promise<void>,
  realtimeProvider: RealtimeProvider = createDemoRealtimeProvider(),
  timerOrchestration?: TimerOrchestrationPort,
  aiChatRepository?: AiChatRepository,
) {
  const repository = new InterviewRepository({
    dataSource: createInMemoryInterviewDataSource([
      {
        userId: activeSession.userId,
        credits: accountState.credits,
        freeStandardInterviews: accountState.freeStandardInterviews ?? 1,
        freeAiInterviews: accountState.freeAiInterviews,
      },
    ], seedInterviews),
    persistOutboxEvent,
  })
  const service = new InterviewService(
    repository,
    policyConfig ? new TierPolicyService(policyConfig) : undefined,
    function createId() {
      return '22222222-2222-4222-8222-222222222222'
    },
    function now() {
      return '2026-04-13T10:00:00.000Z'
    },
    postCommitEventPublisher,
    logger ? { ...noOpTestLogger, ...logger } : undefined,
    notificationService,
    notificationDispatchService,
    notificationTransport,
    realtimeProvider,
    timerOrchestration,
    aiChatRepository,
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
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: '2026-04-13T09:55:00.000Z',
    updated_at: '2026-04-13T09:55:00.000Z',
    ...overrides,
  }
}
