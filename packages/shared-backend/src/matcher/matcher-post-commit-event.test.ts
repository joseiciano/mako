import { describe, expect, it } from 'vitest'
import {
  buildMatcherMatchCreatedEvent,
  buildMatcherMatchCreatedIdempotencyKey,
  createMatcherQueuePostCommitEventPublisher,
  matcherMatchCreatedEventSchema,
} from './matcher-post-commit-event'

describe('matcher post-commit event contract', function matcherPostCommitEventSuite() {
  it('builds interview.match.created events with required envelope and participant mirrors', function shouldBuildMatchCreatedEvent() {
    const event = buildMatcherMatchCreatedEvent(
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
    expect(event.interview).not.toHaveProperty('realtime_session_id')
    expect(event.interview).not.toHaveProperty('excalidraw_room_id')
    expect(event.interview).not.toHaveProperty('excalidraw_key')
  })

  it('uses stable idempotency keys for the same interview id', function shouldBuildStableIdempotencyKey() {
    const interviewId = '99999999-9999-4999-8999-999999999999'

    expect(buildMatcherMatchCreatedIdempotencyKey(interviewId)).toBe(
      'interview.match.created:99999999-9999-4999-8999-999999999999',
    )
    expect(buildMatcherMatchCreatedIdempotencyKey(interviewId)).toBe(
      'interview.match.created:99999999-9999-4999-8999-999999999999',
    )
  })

  it('requires non-null participant B identity for interview.match.created', function shouldRequireInterviewerIdentity() {
    const parseResult = matcherMatchCreatedEventSchema.safeParse({
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

  it('rejects canonical-vs-derived identity mismatch for interview.match.created', function shouldRejectIdentityMismatch() {
    const parseResult = matcherMatchCreatedEventSchema.safeParse({
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
        scheduler_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        interviewer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    })

    expect(parseResult.success).toBe(false)
  })

  it('publishes match events through queue transport hand-off', async function shouldPublishViaQueueTransport() {
    const sentMessages: unknown[] = []
    const publisher = createMatcherQueuePostCommitEventPublisher({
      async send(message) {
        sentMessages.push(message)
      },
    })

    await publisher.publish(
      buildMatcherMatchCreatedEvent(
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
      ),
    )

    expect(sentMessages).toHaveLength(1)
  })
})
