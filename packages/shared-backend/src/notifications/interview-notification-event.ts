import { z } from 'zod'

const eventTimestampSchema = z.string().datetime({ offset: true })

export const interviewNotificationInterviewSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  interviewer_id: z.string().uuid().nullable(),
  type: z.string(),
  mode: z.string(),
  tier: z.string(),
  status: z.string(),
  scheduled_at: eventTimestampSchema,
}).strict()

export type InterviewNotificationInterview = z.infer<typeof interviewNotificationInterviewSchema>

export const matchedInterviewNotificationInterviewSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  interviewer_id: z.string().uuid(),
  type: z.string(),
  mode: z.literal('peer_to_peer'),
  tier: z.literal('standard'),
  status: z.literal('scheduled'),
  scheduled_at: eventTimestampSchema,
}).strict()

export type MatchedInterviewNotificationInterview = z.infer<typeof matchedInterviewNotificationInterviewSchema>

function createParticipantsSchema(options: { interviewerRequired: boolean }) {
  const interviewerSchema = options.interviewerRequired
    ? z.string().uuid()
    : z.string().uuid().nullable()

  return z.object({
    scheduler_user_id: z.string().uuid(),
    interviewer_user_id: interviewerSchema,
  }).strict()
}

function createMirrorRefinement<
  T extends z.ZodRawShape,
>(eventType: string, participantsSchema: z.ZodObject<T>, interviewSchema: z.ZodType<InterviewNotificationInterview> = interviewNotificationInterviewSchema) {
  return z.object({
    event_type: z.literal(eventType),
    event_id: z.string().uuid(),
    idempotency_key: z.string().min(1),
    occurred_at: eventTimestampSchema,
    interview: interviewSchema,
    participants: participantsSchema,
  }).strict().refine(function validateMirrorEquality(data) {
    const schedulerMatches = data.participants?.scheduler_user_id === data.interview?.scheduler_id
    const interviewerMatches = data.participants?.interviewer_user_id === data.interview?.interviewer_id
    return schedulerMatches && interviewerMatches
  }, {
    message: 'participants must mirror interview identity fields: scheduler_user_id must equal scheduler_id and interviewer_user_id must equal interviewer_id',
  })
}

export const interviewNotificationParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid().nullable(),
}).strict()

export type InterviewNotificationParticipants = z.infer<typeof interviewNotificationParticipantsSchema>

export const interviewCreatedEventSchema = createMirrorRefinement(
  'interview.created',
  createParticipantsSchema({ interviewerRequired: false }),
)

export type InterviewCreatedEvent = z.infer<typeof interviewCreatedEventSchema>

export const interviewCancelledEventSchema = createMirrorRefinement(
  'interview.cancelled',
  createParticipantsSchema({ interviewerRequired: false }),
)

export type InterviewCancelledEvent = z.infer<typeof interviewCancelledEventSchema>

export const interviewMatchCreatedEventSchema = createMirrorRefinement(
  'interview.match.created',
  createParticipantsSchema({ interviewerRequired: true }),
  matchedInterviewNotificationInterviewSchema,
)

export type InterviewMatchCreatedEvent = z.infer<typeof interviewMatchCreatedEventSchema>

export const interviewNotificationEventSchema = z.union([
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  interviewMatchCreatedEventSchema,
])

export type InterviewNotificationEvent = z.infer<typeof interviewNotificationEventSchema>

type BuildEventInput = {
  interview: InterviewNotificationInterview
  participants: InterviewNotificationParticipants
}

type BuildEventDependencies = {
  createEventId?: () => string
  now?: () => string
}

function createDefaultEventId(): string {
  return crypto.randomUUID()
}

function createDefaultNow(): string {
  return new Date().toISOString()
}

export function buildInterviewCreatedEvent(
  input: BuildEventInput,
  dependencies: BuildEventDependencies = {},
): InterviewCreatedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = interviewNotificationInterviewSchema.parse(input.interview)
  const participants = createParticipantsSchema({ interviewerRequired: false }).parse(input.participants)

  return interviewCreatedEventSchema.parse({
    event_type: 'interview.created',
    event_id: createEventId(),
    idempotency_key: buildInterviewCreatedIdempotencyKey(interview.id),
    occurred_at: now(),
    interview,
    participants,
  })
}

export function buildInterviewCancelledEvent(
  input: BuildEventInput,
  dependencies: BuildEventDependencies = {},
): InterviewCancelledEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = interviewNotificationInterviewSchema.parse(input.interview)
  const participants = createParticipantsSchema({ interviewerRequired: false }).parse(input.participants)

  return interviewCancelledEventSchema.parse({
    event_type: 'interview.cancelled',
    event_id: createEventId(),
    idempotency_key: buildInterviewCancelledIdempotencyKey(interview.id),
    occurred_at: now(),
    interview,
    participants,
  })
}

export function buildInterviewMatchCreatedEvent(
  input: BuildEventInput,
  dependencies: BuildEventDependencies = {},
): InterviewMatchCreatedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = matchedInterviewNotificationInterviewSchema.parse(input.interview)
  const participants = createParticipantsSchema({ interviewerRequired: true }).parse(input.participants)

  return interviewMatchCreatedEventSchema.parse({
    event_type: 'interview.match.created',
    event_id: createEventId(),
    idempotency_key: buildInterviewMatchCreatedIdempotencyKey(interview.id),
    occurred_at: now(),
    interview,
    participants,
  })
}

export function buildInterviewCreatedIdempotencyKey(interviewId: string): string {
  return `interview.created:${interviewId}`
}

export function buildInterviewCancelledIdempotencyKey(interviewId: string): string {
  return `interview.cancelled:${interviewId}`
}

export function buildInterviewMatchCreatedIdempotencyKey(interviewId: string): string {
  return `interview.match.created:${interviewId}`
}
