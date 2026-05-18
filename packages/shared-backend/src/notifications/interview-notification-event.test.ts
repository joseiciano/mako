import { describe, expect, it } from 'vitest'
import {
  buildInterviewCancelledEvent,
  buildInterviewCancelledIdempotencyKey,
  buildInterviewCreatedEvent,
  buildInterviewCreatedIdempotencyKey,
  buildInterviewMatchCreatedEvent,
  buildInterviewMatchCreatedIdempotencyKey,
  interviewCancelledEventSchema,
  interviewCreatedEventSchema,
  interviewMatchCreatedEventSchema,
  interviewNotificationEventSchema,
  interviewNotificationInterviewSchema,
  interviewNotificationParticipantsSchema,
} from './interview-notification-event'

describe('interview notification event contract', function interviewNotificationEventSuite() {
  const fixedEventId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const fixedNow = '2026-04-01T12:00:00.000Z'
  const interviewId = '99999999-9999-4999-8999-999999999999'
  const schedulerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const interviewerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  const baseInterview = {
    id: interviewId,
    scheduler_id: schedulerId,
    interviewer_id: interviewerId,
    type: 'system_design',
    mode: 'peer_to_peer',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-04-10T10:30:00.000Z',
  } as const

  const baseParticipants = {
    scheduler_user_id: schedulerId,
    interviewer_user_id: interviewerId,
  } as const

  const dependencies = {
    createEventId: () => fixedEventId,
    now: () => fixedNow,
  } as const

  describe('canonical envelope', function canonicalEnvelopeSuite() {
    it('requires event_type, event_id, idempotency_key, occurred_at, interview, participants', function shouldRequireEnvelopeFields() {
      const validEvent = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: baseInterview,
        participants: baseParticipants,
      }

      expect(interviewNotificationEventSchema.safeParse(validEvent).success).toBe(true)

      const requiredFields = ['event_type', 'event_id', 'idempotency_key', 'occurred_at', 'interview', 'participants'] as const

      for (const field of requiredFields) {
        const invalidEvent = { ...validEvent }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (invalidEvent as Record<string, unknown>)[field]
        expect(interviewNotificationEventSchema.safeParse(invalidEvent).success).toBe(false)
      }
    })

    it('only accepts supported event types', function shouldRestrictEventTypes() {
      const validTypes = ['interview.created', 'interview.cancelled', 'interview.match.created'] as const

      for (const eventType of validTypes) {
        const event = {
          event_type: eventType,
          event_id: fixedEventId,
          idempotency_key: 'key',
          occurred_at: fixedNow,
          interview: baseInterview,
          participants: baseParticipants,
        }
        expect(interviewNotificationEventSchema.safeParse(event).success).toBe(true)
      }

      const invalidEvent = {
        event_type: 'interview.unknown',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: baseInterview,
        participants: baseParticipants,
      }
      expect(interviewNotificationEventSchema.safeParse(invalidEvent).success).toBe(false)
    })

    it('rejects extra fields on envelope', function shouldRejectExtraEnvelopeFields() {
      const eventWithExtraField = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: baseInterview,
        participants: baseParticipants,
        extra_field: 'should not be allowed',
      }

      expect(interviewNotificationEventSchema.safeParse(eventWithExtraField).success).toBe(false)
    })
  })

  describe('canonical interview snapshot', function canonicalInterviewSuite() {
    it('only allows canonical interview fields', function shouldRestrictInterviewFields() {
      const validInterview = {
        id: interviewId,
        scheduler_id: schedulerId,
        interviewer_id: interviewerId,
        type: 'system_design',
        mode: 'peer_to_peer',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      }

      expect(interviewNotificationInterviewSchema.safeParse(validInterview).success).toBe(true)

      const extendedInterview = {
        ...validInterview,
        realtime_session_id: 'extra',
        excalidraw_room_id: 'extra',
        excalidraw_key: 'extra',
      }

      expect(interviewNotificationInterviewSchema.safeParse(extendedInterview).success).toBe(false)
    })

    it('requires all canonical interview fields', function shouldRequireInterviewFields() {
      const requiredFields = ['id', 'scheduler_id', 'interviewer_id', 'type', 'mode', 'tier', 'status', 'scheduled_at'] as const

      for (const field of requiredFields) {
        const invalidInterview = { ...baseInterview }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (invalidInterview as Record<string, unknown>)[field]
        expect(interviewNotificationInterviewSchema.safeParse(invalidInterview).success).toBe(false)
      }
    })
  })

  describe('canonical participants', function canonicalParticipantsSuite() {
    it('only allows canonical participants fields', function shouldRestrictParticipantsFields() {
      expect(interviewNotificationParticipantsSchema.safeParse(baseParticipants).success).toBe(true)

      const extendedParticipants = {
        ...baseParticipants,
        extra_field: 'should not be allowed',
      }

      expect(interviewNotificationParticipantsSchema.safeParse(extendedParticipants).success).toBe(false)
    })

    it('rejects extra fields on participants through event schema', function shouldRejectExtraParticipantsFieldsViaEvent() {
      const eventWithExtraParticipantField = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: baseInterview,
        participants: {
          ...baseParticipants,
          extra_field: 'should not be allowed',
        },
      }

      expect(interviewNotificationEventSchema.safeParse(eventWithExtraParticipantField).success).toBe(false)
    })
  })

  describe('participants mirror semantics', function participantsMirrorSuite() {
    it('requires participants to mirror canonical interview identity fields', function shouldRequireMirrorEquality() {
      const mismatchedParticipants = {
        scheduler_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        interviewer_user_id: interviewerId,
      }

      const event = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: baseInterview,
        participants: mismatchedParticipants,
      }

      expect(interviewNotificationEventSchema.safeParse(event).success).toBe(false)
    })

    it('allows null interviewer_user_id when interviewer_id is null for interview.created', function shouldAllowNullForCreated() {
      const event = {
        event_type: 'interview.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: {
          ...baseInterview,
          interviewer_id: null,
        },
        participants: {
          scheduler_user_id: schedulerId,
          interviewer_user_id: null,
        },
      }

      expect(interviewCreatedEventSchema.safeParse(event).success).toBe(true)
    })

    it('allows null interviewer_user_id when interviewer_id is null for interview.cancelled', function shouldAllowNullForCancelled() {
      const event = {
        event_type: 'interview.cancelled',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: {
          ...baseInterview,
          interviewer_id: null,
        },
        participants: {
          scheduler_user_id: schedulerId,
          interviewer_user_id: null,
        },
      }

      expect(interviewCancelledEventSchema.safeParse(event).success).toBe(true)
    })

    it('rejects null interviewer_user_id for interview.match.created', function shouldRejectNullForMatchCreated() {
      const event = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: {
          ...baseInterview,
          interviewer_id: null,
        },
        participants: {
          scheduler_user_id: schedulerId,
          interviewer_user_id: null,
        },
      }

      expect(interviewMatchCreatedEventSchema.safeParse(event).success).toBe(false)
    })

    it('rejects mismatched null states', function shouldRejectMismatchedNull() {
      const eventWithNullInterviewerButNonNullParticipant = {
        event_type: 'interview.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: {
          ...baseInterview,
          interviewer_id: null,
        },
        participants: {
          scheduler_user_id: schedulerId,
          interviewer_user_id: interviewerId,
        },
      }

      expect(interviewCreatedEventSchema.safeParse(eventWithNullInterviewerButNonNullParticipant).success).toBe(false)

      const eventWithNonNullInterviewerButNullParticipant = {
        event_type: 'interview.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: baseInterview,
        participants: {
          scheduler_user_id: schedulerId,
          interviewer_user_id: null,
        },
      }

      expect(interviewCreatedEventSchema.safeParse(eventWithNonNullInterviewerButNullParticipant).success).toBe(false)
    })
  })

  describe('event builders', function eventBuildersSuite() {
    it('builds interview.created events', function shouldBuildCreatedEvent() {
      const event = buildInterviewCreatedEvent(
        {
          interview: baseInterview,
          participants: baseParticipants,
        },
        dependencies,
      )

      expect(event).toEqual({
        event_type: 'interview.created',
        event_id: fixedEventId,
        idempotency_key: `interview.created:${interviewId}`,
        occurred_at: fixedNow,
        interview: baseInterview,
        participants: baseParticipants,
      })
    })

    it('builds interview.cancelled events', function shouldBuildCancelledEvent() {
      const event = buildInterviewCancelledEvent(
        {
          interview: baseInterview,
          participants: baseParticipants,
        },
        dependencies,
      )

      expect(event).toEqual({
        event_type: 'interview.cancelled',
        event_id: fixedEventId,
        idempotency_key: `interview.cancelled:${interviewId}`,
        occurred_at: fixedNow,
        interview: baseInterview,
        participants: baseParticipants,
      })
    })

    it('builds interview.match.created events', function shouldBuildMatchCreatedEvent() {
      const event = buildInterviewMatchCreatedEvent(
        {
          interview: baseInterview,
          participants: baseParticipants,
        },
        dependencies,
      )

      expect(event).toEqual({
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: `interview.match.created:${interviewId}`,
        occurred_at: fixedNow,
        interview: baseInterview,
        participants: baseParticipants,
      })
    })

    it('validates mirror equality during build', function shouldValidateMirrorDuringBuild() {
      expect(() =>
        buildInterviewMatchCreatedEvent(
          {
            interview: baseInterview,
            participants: {
              scheduler_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              interviewer_user_id: interviewerId,
            },
          },
          dependencies,
        ),
      ).toThrow()
    })
  })

  describe('idempotency helpers', function idempotencyHelpersSuite() {
    it('produces deterministic keys for interview.created', function shouldBeDeterministicForCreated() {
      expect(buildInterviewCreatedIdempotencyKey(interviewId)).toBe(`interview.created:${interviewId}`)
      expect(buildInterviewCreatedIdempotencyKey(interviewId)).toBe(`interview.created:${interviewId}`)
    })

    it('produces deterministic keys for interview.cancelled', function shouldBeDeterministicForCancelled() {
      expect(buildInterviewCancelledIdempotencyKey(interviewId)).toBe(`interview.cancelled:${interviewId}`)
      expect(buildInterviewCancelledIdempotencyKey(interviewId)).toBe(`interview.cancelled:${interviewId}`)
    })

    it('produces deterministic keys for interview.match.created', function shouldBeDeterministicForMatchCreated() {
      expect(buildInterviewMatchCreatedIdempotencyKey(interviewId)).toBe(`interview.match.created:${interviewId}`)
      expect(buildInterviewMatchCreatedIdempotencyKey(interviewId)).toBe(`interview.match.created:${interviewId}`)
    })
  })

  describe('timestamp contract', function timestampContractSuite() {
    it('accepts ISO timestamp strings', function shouldAcceptIsoStrings() {
      const eventWithIsoString = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: '2026-04-01T12:00:00.000Z',
        interview: baseInterview,
        participants: baseParticipants,
      }

      expect(interviewMatchCreatedEventSchema.safeParse(eventWithIsoString).success).toBe(true)
    })

    it('rejects Date objects for occurred_at', function shouldRejectDateObjectsForOccurredAt() {
      const eventWithDate = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: new Date('2026-04-01T12:00:00.000Z'),
        interview: baseInterview,
        participants: baseParticipants,
      }

      expect(interviewMatchCreatedEventSchema.safeParse(eventWithDate).success).toBe(false)
    })

    it('rejects Date objects for scheduled_at', function shouldRejectDateObjectsForScheduledAt() {
      const event = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: {
          ...baseInterview,
          scheduled_at: new Date('2026-04-10T10:30:00.000Z'),
        },
        participants: baseParticipants,
      }

      expect(interviewMatchCreatedEventSchema.safeParse(event).success).toBe(false)
    })
  })

  describe('interview.match.created invariants', function matchCreatedInvariantsSuite() {
    it('requires mode to be peer_to_peer', function shouldRequirePeerToPeerMode() {
      const event = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: {
          ...baseInterview,
          mode: 'recruiter_led',
        },
        participants: baseParticipants,
      }

      expect(interviewMatchCreatedEventSchema.safeParse(event).success).toBe(false)
    })

    it('requires tier to be standard', function shouldRequireStandardTier() {
      const event = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: {
          ...baseInterview,
          tier: 'premium',
        },
        participants: baseParticipants,
      }

      expect(interviewMatchCreatedEventSchema.safeParse(event).success).toBe(false)
    })

    it('requires status to be scheduled', function shouldRequireScheduledStatus() {
      const event = {
        event_type: 'interview.match.created',
        event_id: fixedEventId,
        idempotency_key: 'key',
        occurred_at: fixedNow,
        interview: {
          ...baseInterview,
          status: 'cancelled',
        },
        participants: baseParticipants,
      }

      expect(interviewMatchCreatedEventSchema.safeParse(event).success).toBe(false)
    })

    it('enforces invariants at build time', function shouldEnforceInvariantsAtBuildTime() {
      expect(() =>
        buildInterviewMatchCreatedEvent(
          {
            interview: {
              ...baseInterview,
              mode: 'recruiter_led',
            },
            participants: baseParticipants,
          },
          dependencies,
        ),
      ).toThrow()

      expect(() =>
        buildInterviewMatchCreatedEvent(
          {
            interview: {
              ...baseInterview,
              tier: 'premium',
            },
            participants: baseParticipants,
          },
          dependencies,
        ),
      ).toThrow()

      expect(() =>
        buildInterviewMatchCreatedEvent(
          {
            interview: {
              ...baseInterview,
              status: 'cancelled',
            },
            participants: baseParticipants,
          },
          dependencies,
        ),
      ).toThrow()
    })
  })
})
