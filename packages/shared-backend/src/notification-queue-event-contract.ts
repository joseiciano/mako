import { z } from 'zod'

const eventTimestampSchema = z
  .union([z.string().datetime({ offset: true }), z.date()])
  .transform(function normalizeTimestamp(value) {
    return value instanceof Date ? value.toISOString() : value
  })

const interviewTypeSchema = z.enum([
  'system_design',
  'coding',
  'behavioral',
])

const interviewModeSchema = z.enum(['peer_to_peer', 'ai_led'])

export const bookingChannelSchema = z.enum([
  'ai_direct',
  'standard_match',
  'verified_interviewer',
])

export type BookingChannel = z.infer<typeof bookingChannelSchema>

const interviewTierSchema = z.enum(['standard', 'premium'])

const interviewStatusSchema = z.enum([
  'scheduled',
  'ongoing',
  'completed',
  'cancelled',
])

export const queueEventInterviewSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  interviewer_id: z.string().uuid().nullable(),
  type: interviewTypeSchema,
  mode: interviewModeSchema,
  booking_channel: bookingChannelSchema,
  tier: interviewTierSchema,
  status: interviewStatusSchema,
  scheduled_at: z.string().datetime({ offset: true }),
})

const aiLedCreatedQueueEventInterviewSchema = queueEventInterviewSchema.extend({
  mode: z.literal('ai_led'),
  status: z.literal('scheduled'),
})

const aiLedCancelledQueueEventInterviewSchema = queueEventInterviewSchema.extend({
  mode: z.literal('ai_led'),
  status: z.literal('cancelled'),
})

const peerToPeerCancelledQueueEventInterviewSchema = queueEventInterviewSchema.extend({
  mode: z.literal('peer_to_peer'),
  status: z.literal('cancelled'),
  interviewer_id: z.string().uuid(),
})

export const matchedQueueEventInterviewSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  interviewer_id: z.string().uuid(),
  type: interviewTypeSchema,
  mode: z.literal('peer_to_peer'),
  booking_channel: z.literal('standard_match'),
  tier: interviewTierSchema,
  status: z.literal('scheduled'),
  scheduled_at: z.string().datetime({ offset: true }),
})

const completedQueueEventInterviewSchema = queueEventInterviewSchema.extend({
  status: z.literal('completed'),
})

export const queueEventParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid().nullable(),
})

export const matchedQueueEventParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid(),
})

export const premiumBookedQueueEventInterviewSchema =
  matchedQueueEventInterviewSchema.extend({
    booking_channel: z.literal('verified_interviewer'),
  })

const peerToPeerCancelledQueueEventParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid(),
})

function createParticipantMirrorRefinement<
  T extends {
    interview: {
      scheduler_id: string
      interviewer_id: string | null
    }
    participants: {
      scheduler_user_id: string
      interviewer_user_id: string | null
    }
  },
>(schema: z.ZodType<T>) {
  return schema.refine(
    function validateParticipantMirror(data) {
      return (
        data.participants.scheduler_user_id === data.interview.scheduler_id &&
        data.participants.interviewer_user_id === data.interview.interviewer_id
      )
    },
    {
      message:
        'Participant identity fields must mirror interview canonical identity fields',
    },
  )
}

export const interviewCreatedEventSchema = createParticipantMirrorRefinement(
  z.object({
    event_type: z.literal('interview.created'),
    event_id: z.string().uuid(),
    idempotency_key: z.string().min(1),
    occurred_at: eventTimestampSchema,
    interview: aiLedCreatedQueueEventInterviewSchema,
    participants: queueEventParticipantsSchema,
  }),
)

export type InterviewCreatedEvent = z.infer<typeof interviewCreatedEventSchema>

const aiLedCancelledEventSchema = createParticipantMirrorRefinement(
  z.object({
    event_type: z.literal('interview.cancelled'),
    event_id: z.string().uuid(),
    idempotency_key: z.string().min(1),
    occurred_at: eventTimestampSchema,
    interview: aiLedCancelledQueueEventInterviewSchema,
    participants: queueEventParticipantsSchema,
  }),
)

const peerToPeerCancelledEventSchema = createParticipantMirrorRefinement(
  z.object({
    event_type: z.literal('interview.cancelled'),
    event_id: z.string().uuid(),
    idempotency_key: z.string().min(1),
    occurred_at: eventTimestampSchema,
    interview: peerToPeerCancelledQueueEventInterviewSchema,
    participants: peerToPeerCancelledQueueEventParticipantsSchema,
  }),
)

export const interviewCancelledEventSchema = z.union([
  aiLedCancelledEventSchema,
  peerToPeerCancelledEventSchema,
])

export type InterviewCancelledEvent = z.infer<
  typeof interviewCancelledEventSchema
>

export const interviewMatchCreatedEventSchema =
  createParticipantMirrorRefinement(
    z.object({
      event_type: z.literal('interview.match.created'),
      event_id: z.string().uuid(),
      idempotency_key: z.string().min(1),
      occurred_at: eventTimestampSchema,
      interview: matchedQueueEventInterviewSchema,
      participants: matchedQueueEventParticipantsSchema,
    }),
  )

export type InterviewMatchCreatedEvent = z.infer<
  typeof interviewMatchCreatedEventSchema
>

export const interviewCompletedEventSchema = createParticipantMirrorRefinement(
  z.object({
    event_type: z.literal('interview.completed'),
    event_id: z.string().uuid(),
    idempotency_key: z.string().min(1),
    occurred_at: eventTimestampSchema,
    interview: completedQueueEventInterviewSchema,
    participants: queueEventParticipantsSchema,
  }),
)

export type InterviewCompletedEvent = z.infer<
  typeof interviewCompletedEventSchema
>

export const interviewPremiumBookedEventSchema =
  createParticipantMirrorRefinement(
    z.object({
      event_type: z.literal('interview.premium_booked'),
      event_id: z.string().uuid(),
      idempotency_key: z.string().min(1),
      occurred_at: eventTimestampSchema,
      interview: premiumBookedQueueEventInterviewSchema,
      participants: matchedQueueEventParticipantsSchema,
    }),
  )

export type InterviewPremiumBookedEvent = z.infer<
  typeof interviewPremiumBookedEventSchema
>

export const accountPrivacyCleanupRequestedEventSchema = z.object({
  event_type: z.literal('account.privacy_cleanup_requested'),
  event_id: z.string().uuid(),
  idempotency_key: z.string().min(1),
  occurred_at: eventTimestampSchema,
  user_id: z.string().uuid(),
})

export type AccountPrivacyCleanupRequestedEvent = z.infer<
  typeof accountPrivacyCleanupRequestedEventSchema
>

export type NotificationQueueEvent =
  | InterviewCreatedEvent
  | InterviewCancelledEvent
  | InterviewMatchCreatedEvent
  | InterviewCompletedEvent
  | InterviewPremiumBookedEvent

export type NotificationQueueEventPublisher = {
  publish(event: NotificationQueueEvent): Promise<void>
}

export type NotificationQueueTransport = {
  send(message: NotificationQueueEvent): Promise<void>
}

type BuildEventDependencies = {
  createEventId?: () => string
  now?: () => string
}

// Ingress fallback for legacy events: already-persisted outbox payloads and
// older producers may omit interview.booking_channel. Derive it deterministically
// from `mode` so the normalized canonical event always carries a non-null channel.
// This fallback is retained until old producers that omit booking_channel are
// drained and all pending/failed legacy outbox/queue payloads are drained or
// replayed through normalization. The persisted-row parser removed its equivalent
// fallback after the NOT NULL contraction (Story 7.11); persisted rows must
// always carry an explicit booking_channel and never rely on derivation.
type QueueEventInterviewBuilderInput = Omit<
  z.input<typeof queueEventInterviewSchema>,
  'booking_channel'
> & {
  booking_channel?: BookingChannel | null
}

type MatchedQueueEventInterviewBuilderInput = Omit<
  z.input<typeof matchedQueueEventInterviewSchema>,
  'booking_channel'
> & {
  booking_channel?: BookingChannel | null
}

export function buildInterviewCreatedEvent(
  input: {
    interview: QueueEventInterviewBuilderInput
  },
  dependencies: BuildEventDependencies = {},
): InterviewCreatedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = aiLedCreatedQueueEventInterviewSchema.parse(
    normalizeQueueEventInterviewInput(input.interview),
  )

  return interviewCreatedEventSchema.parse({
    event_type: 'interview.created',
    event_id: createEventId(),
    idempotency_key: buildInterviewCreatedIdempotencyKey(interview.id),
    occurred_at: now(),
    interview,
    participants: {
      scheduler_user_id: interview.scheduler_id,
      interviewer_user_id: interview.interviewer_id,
    },
  })
}

export function buildInterviewCreatedIdempotencyKey(
  interviewId: string,
): string {
  return `interview.created:${interviewId}`
}

export function buildInterviewCancelledEvent(
  input: {
    interview: QueueEventInterviewBuilderInput
  },
  dependencies: BuildEventDependencies = {},
): InterviewCancelledEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = z
    .union([
      aiLedCancelledQueueEventInterviewSchema,
      peerToPeerCancelledQueueEventInterviewSchema,
    ])
    .parse(normalizeQueueEventInterviewInput(input.interview))

  return interviewCancelledEventSchema.parse({
    event_type: 'interview.cancelled',
    event_id: createEventId(),
    idempotency_key: buildInterviewCancelledIdempotencyKey(interview.id),
    occurred_at: now(),
    interview,
    participants: {
      scheduler_user_id: interview.scheduler_id,
      interviewer_user_id: interview.interviewer_id,
    },
  })
}

export function buildInterviewCancelledIdempotencyKey(
  interviewId: string,
): string {
  return `interview.cancelled:${interviewId}`
}

export function buildInterviewMatchCreatedEvent(
  input: {
    interview: MatchedQueueEventInterviewBuilderInput
  },
  dependencies: BuildEventDependencies = {},
): InterviewMatchCreatedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = matchedQueueEventInterviewSchema.parse(
    normalizeQueueEventInterviewInput(input.interview),
  )

  return interviewMatchCreatedEventSchema.parse({
    event_type: 'interview.match.created',
    event_id: createEventId(),
    idempotency_key: buildInterviewMatchCreatedIdempotencyKey(interview.id),
    occurred_at: now(),
    interview,
    participants: {
      scheduler_user_id: interview.scheduler_id,
      interviewer_user_id: interview.interviewer_id,
    },
  })
}

export function buildInterviewMatchCreatedIdempotencyKey(
  interviewId: string,
): string {
  return `interview.match.created:${interviewId}`
}

export function buildInterviewCompletedEvent(
  input: {
    interview: z.input<typeof queueEventInterviewSchema>
  },
  dependencies: BuildEventDependencies = {},
): InterviewCompletedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = completedQueueEventInterviewSchema.parse(input.interview)

  return interviewCompletedEventSchema.parse({
    event_type: 'interview.completed',
    event_id: createEventId(),
    idempotency_key: buildInterviewCompletedIdempotencyKey(interview.id),
    occurred_at: now(),
    interview,
    participants: {
      scheduler_user_id: interview.scheduler_id,
      interviewer_user_id: interview.interviewer_id,
    },
  })
}

export function buildInterviewCompletedIdempotencyKey(
  interviewId: string,
): string {
  return `interview.completed:${interviewId}`
}

export function buildInterviewPremiumBookedEvent(
  input: {
    interview: z.input<typeof premiumBookedQueueEventInterviewSchema>
  },
  dependencies: BuildEventDependencies = {},
): InterviewPremiumBookedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = premiumBookedQueueEventInterviewSchema.parse(input.interview)

  return interviewPremiumBookedEventSchema.parse({
    event_type: 'interview.premium_booked',
    event_id: createEventId(),
    idempotency_key: buildInterviewPremiumBookedIdempotencyKey(interview.id),
    occurred_at: now(),
    interview,
    participants: {
      scheduler_user_id: interview.scheduler_id,
      interviewer_user_id: interview.interviewer_id,
    },
  })
}

export function buildInterviewPremiumBookedIdempotencyKey(
  interviewId: string,
): string {
  return `premium-booking:${interviewId}`
}

/**
 * Durable outbox event emitted from the `DELETE /api/account` soft-delete
 * transaction (Story 5.15). Dispatched to the notification-orchestrator
 * queue, which runs the asynchronous raw-artifact/transcript/feedback
 * privacy cleanup for every interview where the deleted user is a recorded
 * participant.
 */
export function buildAccountPrivacyCleanupRequestedEvent(
  input: { userId: string },
  dependencies: BuildEventDependencies = {},
): AccountPrivacyCleanupRequestedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow

  return accountPrivacyCleanupRequestedEventSchema.parse({
    event_type: 'account.privacy_cleanup_requested',
    event_id: createEventId(),
    idempotency_key: buildAccountPrivacyCleanupRequestedIdempotencyKey(input.userId),
    occurred_at: now(),
    user_id: input.userId,
  })
}

export function buildAccountPrivacyCleanupRequestedIdempotencyKey(
  userId: string,
): string {
  return `account.privacy_cleanup_requested:${userId}`
}

export function createNotificationQueueEventPublisher(
  queueTransport: NotificationQueueTransport,
): NotificationQueueEventPublisher {
  return {
    publish: async function publish(event) {
      const payload =
        event.event_type === 'interview.created'
          ? interviewCreatedEventSchema.parse(event)
          : event.event_type === 'interview.cancelled'
            ? interviewCancelledEventSchema.parse(event)
            : event.event_type === 'interview.completed'
              ? interviewCompletedEventSchema.parse(event)
              : event.event_type === 'interview.premium_booked'
                ? interviewPremiumBookedEventSchema.parse(event)
                : interviewMatchCreatedEventSchema.parse(event)
      await queueTransport.send(payload)
    },
  }
}

function createDefaultEventId(): string {
  return crypto.randomUUID()
}

function createDefaultNow(): string {
  return new Date().toISOString()
}

function normalizeQueueEventInterviewInput(
  input: QueueEventInterviewBuilderInput | MatchedQueueEventInterviewBuilderInput,
): QueueEventInterviewBuilderInput | MatchedQueueEventInterviewBuilderInput {
  if (
    input.booking_channel === null ||
    input.booking_channel === undefined
  ) {
    return {
      ...input,
      booking_channel: deriveBookingChannelFromMode(input.mode),
    }
  }

  return input
}

function deriveBookingChannelFromMode(mode: unknown): BookingChannel {
  return mode === 'ai_led' ? 'ai_direct' : 'standard_match'
}
