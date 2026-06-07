import { describe, expect, it } from 'vitest'
import {
  buildInterviewCreatedEvent,
  buildInterviewCreatedIdempotencyKey,
  buildInterviewCancelledEvent,
  buildInterviewCancelledIdempotencyKey,
  createInterviewQueuePostCommitEventPublisher,
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
} from './interview-post-commit-event'

describe('interview post-commit event contract', function interviewPostCommitEventSuite() {
  it('builds interview.created events with required envelope and participant mirrors', function shouldBuildCreatedEvent() {
    const event = buildInterviewCreatedEvent(
      {
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
      },
      {
        createEventId: function createFixedEventId() {
          return 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
        },
        now: function createFixedOccurredAt() {
          return '2026-04-01T12:00:00.000Z'
        },
      },
    )

    expect(event).toEqual({
      event_type: 'interview.created',
      event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      idempotency_key: 'interview.created:99999999-9999-4999-8999-999999999999',
      occurred_at: '2026-04-01T12:00:00.000Z',
      interview: {
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_id: null,
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      },
      participants: {
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: null,
      },
    })

    expect(event.participants.scheduler_user_id).toBe(event.interview.scheduler_id)
    expect(event.participants.interviewer_user_id).toBe(event.interview.interviewer_id)
    expect(event.interview).not.toHaveProperty('realtime_session_id')
    expect(event.interview).not.toHaveProperty('excalidraw_room_id')
    expect(event.interview).not.toHaveProperty('excalidraw_key')
  })

  it('uses stable idempotency keys for created events', function shouldBuildStableCreatedIdempotencyKey() {
    const interviewId = '99999999-9999-4999-8999-999999999999'

    expect(buildInterviewCreatedIdempotencyKey(interviewId)).toBe(
      'interview.created:99999999-9999-4999-8999-999999999999',
    )
    expect(buildInterviewCreatedIdempotencyKey(interviewId)).toBe(
      'interview.created:99999999-9999-4999-8999-999999999999',
    )
  })

  it('builds interview.cancelled events with required envelope and participant mirrors', function shouldBuildCancelledEvent() {
    const event = buildInterviewCancelledEvent(
      {
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'cancelled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
      },
      {
        createEventId: function createFixedEventId() {
          return 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
        },
        now: function createFixedOccurredAt() {
          return '2026-04-01T12:00:00.000Z'
        },
      },
    )

    expect(event).toEqual({
      event_type: 'interview.cancelled',
      event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      idempotency_key: 'interview.cancelled:99999999-9999-4999-8999-999999999999',
      occurred_at: '2026-04-01T12:00:00.000Z',
      interview: {
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_id: null,
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'cancelled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      },
      participants: {
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: null,
      },
    })

    expect(event.participants.scheduler_user_id).toBe(event.interview.scheduler_id)
    expect(event.participants.interviewer_user_id).toBe(event.interview.interviewer_id)
  })

  it('uses stable idempotency keys for cancelled events', function shouldBuildStableCancelledIdempotencyKey() {
    const interviewId = '99999999-9999-4999-8999-999999999999'

    expect(buildInterviewCancelledIdempotencyKey(interviewId)).toBe(
      'interview.cancelled:99999999-9999-4999-8999-999999999999',
    )
    expect(buildInterviewCancelledIdempotencyKey(interviewId)).toBe(
      'interview.cancelled:99999999-9999-4999-8999-999999999999',
    )
  })

  it('rejects participant mirror mismatch for interview.created', function shouldRejectCreatedMirrorMismatch() {
    const parseResult = interviewCreatedEventSchema.safeParse({
      event_type: 'interview.created',
      event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      idempotency_key: 'interview.created:99999999-9999-4999-8999-999999999999',
      occurred_at: '2026-04-01T12:00:00.000Z',
      interview: {
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_id: null,
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      },
      participants: {
        scheduler_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        interviewer_user_id: null,
      },
    })

    expect(parseResult.success).toBe(false)
  })

  it('rejects participant mirror mismatch for interview.cancelled', function shouldRejectCancelledMirrorMismatch() {
    const parseResult = interviewCancelledEventSchema.safeParse({
      event_type: 'interview.cancelled',
      event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      idempotency_key: 'interview.cancelled:99999999-9999-4999-8999-999999999999',
      occurred_at: '2026-04-01T12:00:00.000Z',
      interview: {
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_id: null,
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'cancelled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      },
      participants: {
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    })

    expect(parseResult.success).toBe(false)
  })

  it('rejects peer_to_peer cancelled with null interviewer identity', function shouldRejectPeerToPeerNullInterviewer() {
    const parseResult = interviewCancelledEventSchema.safeParse({
      event_type: 'interview.cancelled',
      event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      idempotency_key: 'interview.cancelled:99999999-9999-4999-8999-999999999999',
      occurred_at: '2026-04-01T12:00:00.000Z',
      interview: {
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_id: null,
        type: 'system_design',
        mode: 'peer_to_peer',
        tier: 'standard',
        status: 'cancelled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      },
      participants: {
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: null,
      },
    })

    expect(parseResult.success).toBe(false)
  })

  it('publishes created events through queue transport hand-off', async function shouldPublishCreatedViaQueueTransport() {
    const sentMessages: unknown[] = []
    const publisher = createInterviewQueuePostCommitEventPublisher({
      async send(message) {
        sentMessages.push(message)
      },
    })

    await publisher.publish(
      buildInterviewCreatedEvent(
        {
          interview: {
            id: '99999999-9999-4999-8999-999999999999',
            scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            interviewer_id: null,
            type: 'system_design',
            mode: 'ai_led',
            tier: 'standard',
            status: 'scheduled',
            scheduled_at: '2026-04-10T10:30:00.000Z',
          },
        },
        {
          createEventId: function createFixedEventId() {
            return 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
          },
          now: function createFixedOccurredAt() {
            return '2026-04-01T12:00:00.000Z'
          },
        },
      ),
    )

    expect(sentMessages).toHaveLength(1)
  })

  it('publishes cancelled events through queue transport hand-off', async function shouldPublishCancelledViaQueueTransport() {
    const sentMessages: unknown[] = []
    const publisher = createInterviewQueuePostCommitEventPublisher({
      async send(message) {
        sentMessages.push(message)
      },
    })

    await publisher.publish(
      buildInterviewCancelledEvent(
        {
          interview: {
            id: '99999999-9999-4999-8999-999999999999',
            scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            interviewer_id: null,
            type: 'system_design',
            mode: 'ai_led',
            tier: 'standard',
            status: 'cancelled',
            scheduled_at: '2026-04-10T10:30:00.000Z',
          },
        },
        {
          createEventId: function createFixedEventId() {
            return 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
          },
          now: function createFixedOccurredAt() {
            return '2026-04-01T12:00:00.000Z'
          },
        },
      ),
    )

    expect(sentMessages).toHaveLength(1)
  })

  it('created event payload strips runtime provisioning fields', function shouldStripRuntimeFieldsFromCreated() {
    const event = buildInterviewCreatedEvent(
      {
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
          realtime_session_id: 'sess_abc123',
          excalidraw_room_id: 'room_def456',
          excalidraw_key: 'key_ghi789',
          recording_url: 'https://r2.example.com/recording.mp4',
          screenshot_urls: ['https://r2.example.com/ss1.png'],
          feedback: { score: 85 },
        } as unknown as Parameters<typeof buildInterviewCreatedEvent>[0]['interview'],
      },
      {
        createEventId: function createFixedEventId() {
          return 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
        },
        now: function createFixedOccurredAt() {
          return '2026-04-01T12:00:00.000Z'
        },
      },
    )

    expect(event.interview).not.toHaveProperty('realtime_session_id')
    expect(event.interview).not.toHaveProperty('excalidraw_room_id')
    expect(event.interview).not.toHaveProperty('excalidraw_key')
    expect(event.interview).not.toHaveProperty('recording_url')
    expect(event.interview).not.toHaveProperty('screenshot_urls')
    expect(event.interview).not.toHaveProperty('feedback')
    expect(event.participants.scheduler_user_id).toBe(event.interview.scheduler_id)
    expect(event.participants.interviewer_user_id).toBe(event.interview.interviewer_id)
  })

  it('cancelled event payload strips runtime provisioning fields', function shouldStripRuntimeFieldsFromCancelled() {
    const event = buildInterviewCancelledEvent(
      {
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'cancelled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
          realtime_session_id: 'sess_abc123',
          excalidraw_room_id: 'room_def456',
          excalidraw_key: 'key_ghi789',
          recording_url: 'https://r2.example.com/recording.mp4',
          screenshot_urls: ['https://r2.example.com/ss1.png'],
          feedback: { score: 85 },
        } as unknown as Parameters<typeof buildInterviewCancelledEvent>[0]['interview'],
      },
      {
        createEventId: function createFixedEventId() {
          return 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
        },
        now: function createFixedOccurredAt() {
          return '2026-04-01T12:00:00.000Z'
        },
      },
    )

    expect(event.interview).not.toHaveProperty('realtime_session_id')
    expect(event.interview).not.toHaveProperty('excalidraw_room_id')
    expect(event.interview).not.toHaveProperty('excalidraw_key')
    expect(event.interview).not.toHaveProperty('recording_url')
    expect(event.interview).not.toHaveProperty('screenshot_urls')
    expect(event.interview).not.toHaveProperty('feedback')
    expect(event.participants.scheduler_user_id).toBe(event.interview.scheduler_id)
    expect(event.participants.interviewer_user_id).toBe(event.interview.interviewer_id)
  })

  it('peer_to_peer cancelled event payload strips runtime provisioning fields and keeps mirrors aligned', function shouldStripRuntimeFieldsFromPeerToPeerCancelled() {
    const event = buildInterviewCancelledEvent(
      {
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'system_design',
          mode: 'peer_to_peer',
          tier: 'standard',
          status: 'cancelled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
          realtime_session_id: 'sess_abc123',
          excalidraw_room_id: 'room_def456',
          excalidraw_key: 'key_ghi789',
          recording_url: 'https://r2.example.com/recording.mp4',
          screenshot_urls: ['https://r2.example.com/ss1.png'],
          feedback: { score: 85 },
        } as unknown as Parameters<typeof buildInterviewCancelledEvent>[0]['interview'],
      },
      {
        createEventId: function createFixedEventId() {
          return 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
        },
        now: function createFixedOccurredAt() {
          return '2026-04-01T12:00:00.000Z'
        },
      },
    )

    expect(event.interview).not.toHaveProperty('realtime_session_id')
    expect(event.interview).not.toHaveProperty('excalidraw_room_id')
    expect(event.interview).not.toHaveProperty('excalidraw_key')
    expect(event.interview).not.toHaveProperty('recording_url')
    expect(event.interview).not.toHaveProperty('screenshot_urls')
    expect(event.interview).not.toHaveProperty('feedback')
    expect(event.participants.scheduler_user_id).toBe(event.interview.scheduler_id)
    expect(event.participants.interviewer_user_id).toBe(event.interview.interviewer_id)
  })
})
