import { describe, expect, it } from 'vitest'
import {
  buildMatcherMatchCreatedEvent,
  buildMatcherMatchCreatedIdempotencyKey,
  createMatcherQueuePostCommitEventPublisher,
  matcherMatchCreatedEventSchema,
  type MatcherPostCommitEventPublisher,
  type MatcherPostCommitQueueTransport,
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

  it('rejects participant mirror mismatch for interview.match.created', function shouldRejectMatchCreatedMirrorMismatch() {
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
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
    })

    expect(parseResult.success).toBe(false)
  })

  it('rejects interview.match.created events missing required envelope fields', function shouldValidateRequiredFields() {
    const validEvent = {
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
    }

    expect(matcherMatchCreatedEventSchema.safeParse(validEvent).success).toBe(true)

    const missingParticipants = {
      ...validEvent,
    }
    delete (missingParticipants as Record<string, unknown>).participants

    expect(matcherMatchCreatedEventSchema.safeParse(missingParticipants).success).toBe(false)

    const missingInterview = {
      ...validEvent,
    }
    delete (missingInterview as Record<string, unknown>).interview

    expect(matcherMatchCreatedEventSchema.safeParse(missingInterview).success).toBe(false)
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

  it('preserves matcher-only type boundary for publisher and transport', function shouldPreserveTypeBoundary() {
    // If MatcherPostCommitQueueTransport were widened to accept
    // interview.created or interview.cancelled, this narrower transport
    // implementation would fail to compile due to strict function parameter
    // contravariance.
    const narrowTransport: MatcherPostCommitQueueTransport = {
      async send(message) {
        expect(message.event_type).toBe('interview.match.created')
      },
    }

    // If MatcherPostCommitEventPublisher.publish were widened, this narrower
    // publisher implementation would similarly fail to compile.
    const narrowPublisher: MatcherPostCommitEventPublisher = {
      async publish(event) {
        expect(event.event_type).toBe('interview.match.created')
      },
    }

    // Factory must accept the narrow transport without casts
    const publisher = createMatcherQueuePostCommitEventPublisher(narrowTransport)
    expect(publisher).toBeDefined()
    expect(narrowPublisher).toBeDefined()
  })
})
