import { z } from 'zod'
import {
  matcherCreatedInterviewSchema,
  type MatcherCreatedInterview,
} from './types'

const eventTimestampSchema = z
  .union([z.string().datetime({ offset: true }), z.date()])
  .transform(function normalizeTimestamp(value) {
    return value instanceof Date ? value.toISOString() : value
  })

export const matcherParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid(),
})

export const matcherMatchCreatedEventSchema = z.object({
  event_type: z.literal('interview.match.created'),
  event_id: z.string().uuid(),
  idempotency_key: z.string().min(1),
  occurred_at: eventTimestampSchema,
  interview: matcherCreatedInterviewSchema,
  participants: matcherParticipantsSchema,
})

export type MatcherMatchCreatedEvent = z.infer<typeof matcherMatchCreatedEventSchema>

export type MatcherPostCommitEventPublisher = {
  publish(event: MatcherMatchCreatedEvent): Promise<void>
}

export type MatcherPostCommitQueueTransport = {
  send(message: MatcherMatchCreatedEvent): Promise<void>
}

type BuildMatcherMatchCreatedEventInput = {
  interview: MatcherCreatedInterview
}

type BuildMatcherMatchCreatedEventDependencies = {
  createEventId?: () => string
  now?: () => string
}

export function buildMatcherMatchCreatedEvent(
  input: BuildMatcherMatchCreatedEventInput,
  dependencies: BuildMatcherMatchCreatedEventDependencies = {},
): MatcherMatchCreatedEvent {
  const createEventId = dependencies.createEventId ?? createDefaultEventId
  const now = dependencies.now ?? createDefaultNow
  const interview = matcherCreatedInterviewSchema.parse(input.interview)

  return matcherMatchCreatedEventSchema.parse({
    event_type: 'interview.match.created',
    event_id: createEventId(),
    idempotency_key: buildMatcherMatchCreatedIdempotencyKey(interview.id),
    occurred_at: now(),
    interview,
    participants: {
      scheduler_user_id: interview.scheduler_id,
      interviewer_user_id: interview.interviewer_id,
    },
  })
}

export function buildMatcherMatchCreatedIdempotencyKey(interviewId: string): string {
  return `interview.match.created:${interviewId}`
}

export function createMatcherQueuePostCommitEventPublisher(
  queueTransport: MatcherPostCommitQueueTransport,
): MatcherPostCommitEventPublisher {
  return {
    publish: async function publish(event) {
      const payload = matcherMatchCreatedEventSchema.parse(event)
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
