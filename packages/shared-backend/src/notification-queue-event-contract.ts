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
  tier: interviewTierSchema,
  status: interviewStatusSchema,
  scheduled_at: z.string().datetime(),
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
  tier: z.literal('standard'),
  status: z.literal('scheduled'),
  scheduled_at: z.string().datetime(),
})

export const queueEventParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid().nullable(),
})

export const matchedQueueEventParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid(),
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

export type NotificationQueueEvent =
  | InterviewCreatedEvent
  | InterviewCancelledEvent
  | InterviewMatchCreatedEvent

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

export function buildInterviewCreatedEvent(
  input: {
    interview: z.input<typeof queueEventInterviewSchema>
  },
  dependencies: BuildEventDependencies = {},
): InterviewCreatedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = aiLedCreatedQueueEventInterviewSchema.parse(input.interview)

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
    interview: z.input<typeof queueEventInterviewSchema>
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
    .parse(input.interview)

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
    interview: z.input<typeof matchedQueueEventInterviewSchema>
  },
  dependencies: BuildEventDependencies = {},
): InterviewMatchCreatedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = matchedQueueEventInterviewSchema.parse(input.interview)

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
