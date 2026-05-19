import { describe, expect, it } from 'vitest'
import {
  buildInterviewCancelledEvent,
  buildInterviewCreatedEvent,
  buildInterviewMatchCreatedEvent,
  buildInterviewMatchCreatedIdempotencyKey,
  createInterviewQueuePostCommitEventPublisher,
  interviewPostCommitEventSchema,
  type InterviewPostCommitEvent,
} from './interview-post-commit-event'

describe('interview post-commit event contract', function interviewPostCommitEventSuite() {
  it('builds interview.created events with required envelope and nullable participant B', function shouldBuildCreatedEvent() {
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
  })

  it('rejects interview.created with peer_to_peer mode', function shouldRejectCreatedPeerToPeer() {
    const parseResult = interviewPostCommitEventSchema.safeParse({
      event_type: 'interview.created',
      event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      idempotency_key: 'interview.created:99999999-9999-4999-8999-999999999999',
      occurred_at: '2026-04-01T12:00:00.000Z',
      interview: {
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_id: null,
        type: 'system_design',
        mode: 'peer_to_peer',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      },
      participants: {
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: null,
      },
    })

    expect(parseResult.success).toBe(false)
  })

  it('rejects interview.created with non-scheduled status', function shouldRejectCreatedNonScheduled() {
    const parseResult = interviewPostCommitEventSchema.safeParse({
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

  it('builds interview.cancelled events with required envelope', function shouldBuildCancelledEvent() {
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

  it('rejects interview.cancelled with non-cancelled status', function shouldRejectCancelledNonCancelled() {
    const parseResult = interviewPostCommitEventSchema.safeParse({
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
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      },
      participants: {
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: null,
      },
    })

    expect(parseResult.success).toBe(false)
  })

  it('builds interview.match.created events with required non-null participant B', function shouldBuildMatchCreatedEvent() {
    const event = buildInterviewMatchCreatedEvent(
      {
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'system_design',
          mode: 'peer_to_peer',
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
      event_type: 'interview.match.created',
      event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      idempotency_key: 'interview.match.created:99999999-9999-4999-8999-999999999999',
      occurred_at: '2026-04-01T12:00:00.000Z',
      interview: {
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        type: 'system_design',
        mode: 'peer_to_peer',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      },
      participants: {
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    })

    expect(event.participants.scheduler_user_id).toBe(event.interview.scheduler_id)
    expect(event.participants.interviewer_user_id).toBe(event.interview.interviewer_id)
  })

  it('uses stable idempotency keys for the same interview id per event type', function shouldBuildStableIdempotencyKey() {
    const interviewId = '99999999-9999-4999-8999-999999999999'

    expect(buildInterviewMatchCreatedIdempotencyKey(interviewId)).toBe(
      'interview.match.created:99999999-9999-4999-8999-999999999999',
    )
    expect(buildInterviewMatchCreatedIdempotencyKey(interviewId)).toBe(
      'interview.match.created:99999999-9999-4999-8999-999999999999',
    )
  })

  it('requires non-null participant B identity for interview.match.created', function shouldRequireInterviewerIdentityForMatchCreated() {
    const parseResult = interviewPostCommitEventSchema.safeParse({
      event_type: 'interview.match.created',
      event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      idempotency_key: 'interview.match.created:99999999-9999-4999-8999-999999999999',
      occurred_at: '2026-04-01T12:00:00.000Z',
      interview: {
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_id: null,
        type: 'system_design',
        mode: 'peer_to_peer',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      },
      participants: {
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: null,
      },
    })

    expect(parseResult.success).toBe(false)
  })

  it('allows nullable participant B identity for interview.created', function shouldAllowNullableInterviewerForCreated() {
    const parseResult = interviewPostCommitEventSchema.safeParse({
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

    expect(parseResult.success).toBe(true)
  })

  it('allows nullable participant B identity for interview.cancelled', function shouldAllowNullableInterviewerForCancelled() {
    const parseResult = interviewPostCommitEventSchema.safeParse({
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

    expect(parseResult.success).toBe(true)
  })

  it('rejects when canonical and derived identities differ', function shouldRejectMismatchedIdentities() {
    const parseResult = interviewPostCommitEventSchema.safeParse({
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
        scheduler_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        interviewer_user_id: null,
      },
    })

    expect(parseResult.success).toBe(false)
  })

  it('rejects interview envelope fields outside the canonical subset', function shouldRejectExtraInterviewFields() {
    const parseResult = interviewPostCommitEventSchema.safeParse({
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
        scheduler_alias: 'Candidate-Blue',
      },
      participants: {
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: null,
      },
    })

    expect(parseResult.success).toBe(false)
  })

  it('publishes events through queue transport hand-off', async function shouldPublishViaQueueTransport() {
    const sentMessages: InterviewPostCommitEvent[] = []
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
    expect(sentMessages[0]?.event_type).toBe('interview.created')
  })
})
