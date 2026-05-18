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

const interviewPostCommitEventInterviewSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  interviewer_id: z.string().uuid().nullable(),
  type: interviewTypeSchema,
  mode: interviewModeSchema,
  tier: interviewTierSchema,
  status: interviewStatusSchema,
  scheduled_at: z.string().datetime(),
})

export const interviewParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid().nullable(),
})

export const interviewCreatedEventSchema = z.object({
  event_type: z.literal('interview.created'),
  event_id: z.string().uuid(),
  idempotency_key: z.string().min(1),
  occurred_at: eventTimestampSchema,
  interview: interviewPostCommitEventInterviewSchema,
  participants: interviewParticipantsSchema,
})

export type InterviewCreatedEvent = z.infer<typeof interviewCreatedEventSchema>

export const interviewCancelledEventSchema = z.object({
  event_type: z.literal('interview.cancelled'),
  event_id: z.string().uuid(),
  idempotency_key: z.string().min(1),
  occurred_at: eventTimestampSchema,
  interview: interviewPostCommitEventInterviewSchema,
})

export type InterviewCancelledEvent = z.infer<
  typeof interviewCancelledEventSchema
>

export type InterviewPostCommitEvent =
  | InterviewCreatedEvent
  | InterviewCancelledEvent

export type InterviewPostCommitEventPublisher = {
  publish(event: InterviewPostCommitEvent): Promise<void>
}

export type InterviewPostCommitQueueTransport = {
  send(message: InterviewPostCommitEvent): Promise<void>
}

type BuildInterviewCreatedEventInput = {
  interview: z.input<typeof interviewPostCommitEventInterviewSchema>
}

type BuildInterviewCancelledEventInput = {
  interview: z.input<typeof interviewPostCommitEventInterviewSchema>
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
  const interview = interviewPostCommitEventInterviewSchema.parse(input.interview)

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
  input: BuildInterviewCancelledEventInput,
  dependencies: BuildEventDependencies = {},
): InterviewCancelledEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = interviewPostCommitEventInterviewSchema.parse(input.interview)

  return interviewCancelledEventSchema.parse({
    event_type: 'interview.cancelled',
    event_id: createEventId(),
    idempotency_key: buildInterviewCancelledIdempotencyKey(interview.id),
    occurred_at: now(),
    interview,
  })
}

export function buildInterviewCancelledIdempotencyKey(
  interviewId: string,
): string {
  return `interview.cancelled:${interviewId}`
}

export function createInterviewQueuePostCommitEventPublisher(
  queueTransport: InterviewPostCommitQueueTransport,
): InterviewPostCommitEventPublisher {
  return {
    publish: async function publish(event) {
      const payload =
        event.event_type === 'interview.created'
          ? interviewCreatedEventSchema.parse(event)
          : interviewCancelledEventSchema.parse(event)
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
