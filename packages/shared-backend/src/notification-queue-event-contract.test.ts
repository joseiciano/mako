import { describe, expect, it } from 'vitest'
import {
  buildInterviewCreatedEvent,
  buildInterviewCreatedIdempotencyKey,
  buildInterviewCancelledEvent,
  buildInterviewCancelledIdempotencyKey,
  buildInterviewMatchCreatedEvent,
  buildInterviewMatchCreatedIdempotencyKey,
  createNotificationQueueEventPublisher,
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  interviewMatchCreatedEventSchema,
  queueEventInterviewSchema,
  matchedQueueEventInterviewSchema,
  queueEventParticipantsSchema,
  matchedQueueEventParticipantsSchema,
} from './notification-queue-event-contract'

describe('notification queue event contract', function notificationQueueEventContractSuite() {
  describe('interview.created', function interviewCreatedSuite() {
    it('builds events with snake_case envelope and participant mirrors', function shouldBuildCreatedEvent() {
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
          createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          now: () => '2026-04-01T12:00:00.000Z',
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

    it('uses deterministic idempotency key', function shouldUseDeterministicIdempotencyKey() {
      expect(buildInterviewCreatedIdempotencyKey('99999999-9999-4999-8999-999999999999')).toBe(
        'interview.created:99999999-9999-4999-8999-999999999999',
      )
    })

    it('allows nullable interviewer_id for ai_led mode', function shouldAllowNullableInterviewer() {
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
          createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          now: () => '2026-04-01T12:00:00.000Z',
        },
      )

      expect(event.interview.interviewer_id).toBeNull()
      expect(event.participants.interviewer_user_id).toBeNull()
    })

    it('rejects peer_to_peer mode', function shouldRejectPeerToPeerMode() {
      const result = interviewCreatedEventSchema.safeParse({
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

      expect(result.success).toBe(false)
    })

    it('rejects non-scheduled status', function shouldRejectNonScheduledStatus() {
      const result = interviewCreatedEventSchema.safeParse({
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

      expect(result.success).toBe(false)
    })

    it('rejects participant mirror mismatch', function shouldRejectMirrorMismatch() {
      const result = interviewCreatedEventSchema.safeParse({
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

      expect(result.success).toBe(false)
    })
  })

  describe('interview.cancelled', function interviewCancelledSuite() {
    it('builds events with snake_case envelope and participant mirrors', function shouldBuildCancelledEvent() {
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
          createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          now: () => '2026-04-01T12:00:00.000Z',
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

    it('uses deterministic idempotency key', function shouldUseDeterministicIdempotencyKey() {
      expect(buildInterviewCancelledIdempotencyKey('99999999-9999-4999-8999-999999999999')).toBe(
        'interview.cancelled:99999999-9999-4999-8999-999999999999',
      )
    })

    it('rejects participant mirror mismatch', function shouldRejectMirrorMismatch() {
      const result = interviewCancelledEventSchema.safeParse({
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

      expect(result.success).toBe(false)
    })

    it('rejects non-cancelled status', function shouldRejectNonCancelledStatus() {
      const result = interviewCancelledEventSchema.safeParse({
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

      expect(result.success).toBe(false)
    })

    it('rejects peer_to_peer mode with null interviewer_id', function shouldRejectPeerToPeerNullInterviewer() {
      const result = interviewCancelledEventSchema.safeParse({
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

      expect(result.success).toBe(false)
    })

    it('allows peer_to_peer mode with non-null interviewer_id', function shouldAllowPeerToPeerWithInterviewer() {
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
          },
        },
        {
          createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          now: () => '2026-04-01T12:00:00.000Z',
        },
      )

      expect(event.interview.interviewer_id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      expect(event.participants.interviewer_user_id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      expect(event.participants.scheduler_user_id).toBe(event.interview.scheduler_id)
      expect(event.participants.interviewer_user_id).toBe(event.interview.interviewer_id)
    })
  })

  describe('interview.match.created', function interviewMatchCreatedSuite() {
    it('builds events with snake_case envelope and participant mirrors', function shouldBuildMatchCreatedEvent() {
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
          createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          now: () => '2026-04-01T12:00:00.000Z',
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

    it('uses deterministic idempotency key', function shouldUseDeterministicIdempotencyKey() {
      expect(buildInterviewMatchCreatedIdempotencyKey('99999999-9999-4999-8999-999999999999')).toBe(
        'interview.match.created:99999999-9999-4999-8999-999999999999',
      )
    })

    it('requires non-null interviewer_id', function shouldRequireNonNullInterviewer() {
      const result = interviewMatchCreatedEventSchema.safeParse({
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

      expect(result.success).toBe(false)
    })

    it('rejects ai_led mode', function shouldRejectAiLedMode() {
      const result = interviewMatchCreatedEventSchema.safeParse({
        event_type: 'interview.match.created',
        event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        idempotency_key: 'interview.match.created:99999999-9999-4999-8999-999999999999',
        occurred_at: '2026-04-01T12:00:00.000Z',
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
        participants: {
          scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      })

      expect(result.success).toBe(false)
    })

    it('rejects premium tier', function shouldRejectPremiumTier() {
      const result = interviewMatchCreatedEventSchema.safeParse({
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
          tier: 'premium',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
        participants: {
          scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      })

      expect(result.success).toBe(false)
    })

    it('rejects non-scheduled status', function shouldRejectNonScheduledStatus() {
      const result = interviewMatchCreatedEventSchema.safeParse({
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
          status: 'cancelled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
        participants: {
          scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      })

      expect(result.success).toBe(false)
    })

    it('rejects participant mirror mismatch', function shouldRejectMirrorMismatch() {
      const result = interviewMatchCreatedEventSchema.safeParse({
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

      expect(result.success).toBe(false)
    })
  })

  describe('publisher', function publisherSuite() {
    it('publishes all event types through queue transport', async function shouldPublishAllEventTypes() {
      const sentMessages: unknown[] = []
      const publisher = createNotificationQueueEventPublisher({
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
            createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            now: () => '2026-04-01T12:00:00.000Z',
          },
        ),
      )

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
            createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            now: () => '2026-04-01T12:00:00.000Z',
          },
        ),
      )

      await publisher.publish(
        buildInterviewMatchCreatedEvent(
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
            createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            now: () => '2026-04-01T12:00:00.000Z',
          },
        ),
      )

      expect(sentMessages).toHaveLength(3)
    })
  })

  describe('schema independence', function schemaIndependenceSuite() {
    it('queue event interview schema is independent from API response shapes', function shouldBeIndependent() {
      const validInterview = {
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_id: null,
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      }

      expect(queueEventInterviewSchema.parse(validInterview)).toEqual(validInterview)
    })

    it('matched queue event interview schema requires non-null interviewer_id', function shouldRequireNonNullInterviewer() {
      const result = matchedQueueEventInterviewSchema.safeParse({
        id: '99999999-9999-4999-8999-999999999999',
        scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_id: null,
        type: 'system_design',
        mode: 'peer_to_peer',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      })

      expect(result.success).toBe(false)
    })

    it('queue event participants schema allows nullable interviewer_user_id', function shouldAllowNullableInterviewerUserId() {
      const result = queueEventParticipantsSchema.safeParse({
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: null,
      })

      expect(result.success).toBe(true)
    })

    it('matched queue event participants schema requires non-null interviewer_user_id', function shouldRequireNonNullInterviewerUserId() {
      const result = matchedQueueEventParticipantsSchema.safeParse({
        scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        interviewer_user_id: null,
      })

      expect(result.success).toBe(false)
    })
  })
})
