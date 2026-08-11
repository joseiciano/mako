import { describe, expect, it } from 'vitest'
import {
  bookingChannelSchema,
  buildInterviewCreatedEvent,
  buildInterviewCreatedIdempotencyKey,
  buildInterviewCancelledEvent,
  buildInterviewCancelledIdempotencyKey,
  buildInterviewMatchCreatedEvent,
  buildInterviewMatchCreatedIdempotencyKey,
  buildInterviewPremiumBookedEvent,
  buildInterviewPremiumBookedIdempotencyKey,
  createNotificationQueueEventPublisher,
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  interviewMatchCreatedEventSchema,
  interviewPremiumBookedEventSchema,
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
          booking_channel: 'ai_direct',
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

    it('accepts offset-aware scheduled_at', function shouldAcceptOffsetAwareScheduledAt() {
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
            scheduled_at: '2026-04-10T10:30:00-04:00',
          },
        },
        {
          createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          now: () => '2026-04-01T12:00:00.000Z',
        },
      )

      expect(event.interview.scheduled_at).toBe('2026-04-10T10:30:00-04:00')
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
          booking_channel: 'ai_direct',
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

    it('accepts offset-aware scheduled_at', function shouldAcceptOffsetAwareScheduledAt() {
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
            scheduled_at: '2026-04-10T10:30:00+05:30',
          },
        },
        {
          createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          now: () => '2026-04-01T12:00:00.000Z',
        },
      )

      expect(event.interview.scheduled_at).toBe('2026-04-10T10:30:00+05:30')
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
          booking_channel: 'standard_match',
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

    it('accepts premium tier', function shouldAcceptPremiumTier() {
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
          booking_channel: 'standard_match',
          tier: 'premium',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
        participants: {
          scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      })

      expect(result.success).toBe(true)
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

    it('accepts offset-aware scheduled_at', function shouldAcceptOffsetAwareScheduledAt() {
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
            scheduled_at: '2026-04-10T10:30:00+01:00',
          },
        },
        {
          createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          now: () => '2026-04-01T12:00:00.000Z',
        },
      )

      expect(event.interview.scheduled_at).toBe('2026-04-10T10:30:00+01:00')
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

  describe('interview.premium_booked', function interviewPremiumBookedSuite() {
    it('builds events with snake_case envelope and participant mirrors', function shouldBuildPremiumBookedEvent() {
      const event = buildInterviewPremiumBookedEvent(
        {
          interview: {
            id: '99999999-9999-4999-8999-999999999999',
            scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            type: 'system_design',
            mode: 'peer_to_peer',
            booking_channel: 'verified_interviewer',
            tier: 'premium',
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
        event_type: 'interview.premium_booked',
        event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        idempotency_key: 'premium-booking:99999999-9999-4999-8999-999999999999',
        occurred_at: '2026-04-01T12:00:00.000Z',
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'system_design',
          mode: 'peer_to_peer',
          booking_channel: 'verified_interviewer',
          tier: 'premium',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
        participants: {
          scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      })

      expect(event.interview.booking_channel).toBe('verified_interviewer')
      expect(event.participants.scheduler_user_id).toBe(event.interview.scheduler_id)
      expect(event.participants.interviewer_user_id).toBe(event.interview.interviewer_id)
      expect(event.idempotency_key).toBe(
        `premium-booking:${event.interview.id}`,
      )
    })

    it('uses deterministic idempotency key', function shouldUseDeterministicIdempotencyKey() {
      expect(buildInterviewPremiumBookedIdempotencyKey('99999999-9999-4999-8999-999999999999')).toBe(
        'premium-booking:99999999-9999-4999-8999-999999999999',
      )

      const first = buildInterviewPremiumBookedEvent({
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'system_design',
          mode: 'peer_to_peer',
          booking_channel: 'verified_interviewer',
          tier: 'premium',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
      })
      const second = buildInterviewPremiumBookedEvent({
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'system_design',
          mode: 'peer_to_peer',
          booking_channel: 'verified_interviewer',
          tier: 'premium',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
      })

      expect(first.idempotency_key).toBe(second.idempotency_key)
    })

    it('rejects booking_channel other than verified_interviewer', function shouldRejectNonVerifiedInterviewerChannel() {
      const result = interviewPremiumBookedEventSchema.safeParse({
        event_type: 'interview.premium_booked',
        event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        idempotency_key: 'premium-booking:99999999-9999-4999-8999-999999999999',
        occurred_at: '2026-04-01T12:00:00.000Z',
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'system_design',
          mode: 'peer_to_peer',
          booking_channel: 'standard_match',
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

    it('parses through interviewPremiumBookedEventSchema', function shouldParseThroughSchema() {
      const event = buildInterviewPremiumBookedEvent(
        {
          interview: {
            id: '99999999-9999-4999-8999-999999999999',
            scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            type: 'system_design',
            mode: 'peer_to_peer',
            booking_channel: 'verified_interviewer',
            tier: 'premium',
            status: 'scheduled',
            scheduled_at: '2026-04-10T10:30:00.000Z',
          },
        },
        {
          createEventId: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          now: () => '2026-04-01T12:00:00.000Z',
        },
      )

      expect(interviewPremiumBookedEventSchema.parse(event)).toEqual(event)
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
        booking_channel: 'ai_direct',
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

  describe('booking channel compatibility', function bookingChannelCompatibilitySuite() {
    it('builders emit non-null booking_channel in normalized events', function shouldEmitBookingChannel() {
      const created = buildInterviewCreatedEvent({
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          booking_channel: 'ai_direct',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
      })
      const cancelled = buildInterviewCancelledEvent({
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'system_design',
          mode: 'peer_to_peer',
          booking_channel: 'standard_match',
          tier: 'standard',
          status: 'cancelled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
      })
      const matched = buildInterviewMatchCreatedEvent({
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'system_design',
          mode: 'peer_to_peer',
          booking_channel: 'standard_match',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
      })

      expect(created.interview.booking_channel).toBe('ai_direct')
      expect(cancelled.interview.booking_channel).toBe('standard_match')
      expect(matched.interview.booking_channel).toBe('standard_match')
    })

    it('derives booking_channel from mode when a legacy input omits it', function shouldDeriveBookingChannelFromMode() {
      const created = buildInterviewCreatedEvent({
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
      })
      const cancelled = buildInterviewCancelledEvent({
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
      })
      const cancelledPeer = buildInterviewCancelledEvent({
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
      })
      const matched = buildInterviewMatchCreatedEvent({
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
      })

      expect(created.interview.booking_channel).toBe('ai_direct')
      expect(cancelled.interview.booking_channel).toBe('ai_direct')
      expect(cancelledPeer.interview.booking_channel).toBe('standard_match')
      expect(matched.interview.booking_channel).toBe('standard_match')
    })

    it('derives booking_channel when a legacy input supplies an explicit null', function shouldDeriveBookingChannelFromNull() {
      const created = buildInterviewCreatedEvent({
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          booking_channel: null,
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
      })

      expect(created.interview.booking_channel).toBe('ai_direct')
    })

    it('derives omitted booking_channel for legacy events after DB contraction', function shouldDeriveAfterContraction() {
      const event = buildInterviewCreatedEvent({
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
      })

      expect(event.interview.booking_channel).toBe('ai_direct')
    })

    it('retains queue-event ingress fallback after DB contraction for legacy persisted payloads', function shouldRetainFallbackAfterContraction() {
      // The DB NOT NULL contraction guarantees newly written rows carry a value,
      // but already-persisted outbox/queue payloads may still omit booking_channel.
      // The fallback is retained until old producers that omit booking_channel are
      // drained and all pending/failed legacy outbox/queue payloads are drained
      // or replayed through normalization.
      const created = buildInterviewCreatedEvent({
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
      })
      const cancelled = buildInterviewCancelledEvent({
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
      })
      const matched = buildInterviewMatchCreatedEvent({
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
      })

      expect(created.interview.booking_channel).toBe('ai_direct')
      expect(cancelled.interview.booking_channel).toBe('ai_direct')
      expect(matched.interview.booking_channel).toBe('standard_match')
    })

    it('exports a booking channel enum schema with the three supported channels', function shouldExportBookingChannelEnum() {
      expect(bookingChannelSchema.options).toEqual([
        'ai_direct',
        'standard_match',
        'verified_interviewer',
      ])
    })
  })
})
