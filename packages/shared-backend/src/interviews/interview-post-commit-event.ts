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

const interviewTierSchema = z.enum(['standard', 'premium'])

const interviewStatusSchema = z.enum([
  'scheduled',
  'ongoing',
  'completed',
  'cancelled',
])

const interviewModeSchema = z.enum(['peer_to_peer', 'ai_led'])

const createdInterviewEventSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  interviewer_id: z.string().uuid().nullable(),
  type: interviewTypeSchema,
  mode: z.literal('ai_led'),
  tier: interviewTierSchema,
  status: z.literal('scheduled'),
  scheduled_at: eventTimestampSchema,
}).strict()

const cancelledInterviewEventSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  interviewer_id: z.string().uuid().nullable(),
  type: interviewTypeSchema,
  mode: interviewModeSchema,
  tier: interviewTierSchema,
  status: z.literal('cancelled'),
  scheduled_at: eventTimestampSchema,
}).strict()

const matchCreatedInterviewEventSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  interviewer_id: z.string().uuid(),
  type: interviewTypeSchema,
  mode: z.literal('peer_to_peer'),
  tier: z.literal('standard'),
  status: z.literal('scheduled'),
  scheduled_at: eventTimestampSchema,
}).strict()

const participantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid().nullable(),
})

const matchCreatedParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid(),
})

function createIdentityEqualityRefine<
  TInterview extends z.ZodType,
  TParticipants extends z.ZodType,
>(interviewSchema: TInterview, participantsSchema: TParticipants) {
  return z
    .object({
      event_type: z.literal('interview.match.created'),
      event_id: z.string().uuid(),
      idempotency_key: z.string().min(1),
      occurred_at: eventTimestampSchema,
      interview: interviewSchema,
      participants: participantsSchema,
    })
    .refine(
      function validateIdentityEquality(data) {
        return (
          data.participants!.scheduler_user_id === data.interview!.scheduler_id &&
          data.participants!.interviewer_user_id === data.interview!.interviewer_id
        )
      },
      {
        message:
          'participants must mirror interview identities: scheduler_user_id must equal scheduler_id and interviewer_user_id must equal interviewer_id',
      },
    )
}

const interviewCreatedEventSchema = z
  .object({
    event_type: z.literal('interview.created'),
    event_id: z.string().uuid(),
    idempotency_key: z.string().min(1),
    occurred_at: eventTimestampSchema,
    interview: createdInterviewEventSchema,
    participants: participantsSchema,
  })
  .refine(
    function validateIdentityEquality(data) {
      return (
        data.participants!.scheduler_user_id === data.interview!.scheduler_id &&
        data.participants!.interviewer_user_id === data.interview!.interviewer_id
      )
    },
    {
      message:
        'participants must mirror interview identities: scheduler_user_id must equal scheduler_id and interviewer_user_id must equal interviewer_id',
    },
  )

const interviewCancelledEventSchema = z
  .object({
    event_type: z.literal('interview.cancelled'),
    event_id: z.string().uuid(),
    idempotency_key: z.string().min(1),
    occurred_at: eventTimestampSchema,
    interview: cancelledInterviewEventSchema,
    participants: participantsSchema,
  })
  .refine(
    function validateIdentityEquality(data) {
      return (
        data.participants!.scheduler_user_id === data.interview!.scheduler_id &&
        data.participants!.interviewer_user_id === data.interview!.interviewer_id
      )
    },
    {
      message:
        'participants must mirror interview identities: scheduler_user_id must equal scheduler_id and interviewer_user_id must equal interviewer_id',
    },
  )

export const interviewMatchCreatedEventSchema = createIdentityEqualityRefine(
  matchCreatedInterviewEventSchema,
  matchCreatedParticipantsSchema,
)

export const interviewPostCommitEventSchema = z.union([
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  interviewMatchCreatedEventSchema,
])

export type InterviewPostCommitEvent = z.infer<typeof interviewPostCommitEventSchema>
export type InterviewCreatedEvent = z.infer<typeof interviewCreatedEventSchema>
export type InterviewCancelledEvent = z.infer<typeof interviewCancelledEventSchema>
export type InterviewMatchCreatedEvent = z.infer<typeof interviewMatchCreatedEventSchema>

export type InterviewPostCommitEventPublisher = {
  publish(event: InterviewPostCommitEvent): Promise<void>
}

export type InterviewPostCommitQueueTransport = {
  send(message: InterviewPostCommitEvent): Promise<void>
}

type BuildInterviewCreatedEventInput = {
  interview: {
    id: string
    scheduler_id: string
    interviewer_id: string | null
    type: 'system_design' | 'coding' | 'behavioral'
    mode: 'ai_led'
    tier: 'standard' | 'premium'
    status: 'scheduled'
    scheduled_at: string | Date
  }
}

type BuildInterviewCancelledEventInput = {
  interview: {
    id: string
    scheduler_id: string
    interviewer_id: string | null
    type: 'system_design' | 'coding' | 'behavioral'
    mode: 'ai_led' | 'peer_to_peer'
    tier: 'standard' | 'premium'
    status: 'cancelled'
    scheduled_at: string | Date
  }
}

type BuildInterviewMatchCreatedEventInput = {
  interview: {
    id: string
    scheduler_id: string
    interviewer_id: string
    type: 'system_design' | 'coding' | 'behavioral'
    mode: 'peer_to_peer'
    tier: 'standard'
    status: 'scheduled'
    scheduled_at: string | Date
  }
}

type BuildEventDependencies = {
  createEventId?: () => string
  now?: () => string
}

export function buildInterviewCreatedEvent(
  input: BuildInterviewCreatedEventInput,
  dependencies: BuildEventDependencies = {},
): InterviewCreatedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = createdInterviewEventSchema.parse(input.interview)

  return interviewCreatedEventSchema.parse({
    event_type: 'interview.created',
    event_id: createEventId(),
    idempotency_key: `interview.created:${interview.id}`,
    occurred_at: now(),
    interview,
    participants: {
      scheduler_user_id: interview.scheduler_id,
      interviewer_user_id: interview.interviewer_id,
    },
  })
}

export function buildInterviewCancelledEvent(
  input: BuildInterviewCancelledEventInput,
  dependencies: BuildEventDependencies = {},
): InterviewCancelledEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = cancelledInterviewEventSchema.parse(input.interview)

  return interviewCancelledEventSchema.parse({
    event_type: 'interview.cancelled',
    event_id: createEventId(),
    idempotency_key: `interview.cancelled:${interview.id}`,
    occurred_at: now(),
    interview,
    participants: {
      scheduler_user_id: interview.scheduler_id,
      interviewer_user_id: interview.interviewer_id,
    },
  })
}

export function buildInterviewMatchCreatedEvent(
  input: BuildInterviewMatchCreatedEventInput,
  dependencies: BuildEventDependencies = {},
): InterviewMatchCreatedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = matchCreatedInterviewEventSchema.parse(input.interview)

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

export function buildInterviewMatchCreatedIdempotencyKey(interviewId: string): string {
  return `interview.match.created:${interviewId}`
}

export function createInterviewQueuePostCommitEventPublisher(
  queueTransport: InterviewPostCommitQueueTransport,
): InterviewPostCommitEventPublisher {
  return {
    publish: async function publish(event) {
      const payload = interviewPostCommitEventSchema.parse(event)
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
