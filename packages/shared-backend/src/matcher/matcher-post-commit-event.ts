import { z } from 'zod'
import {
  buildInterviewMatchCreatedEvent,
  buildInterviewMatchCreatedIdempotencyKey,
  interviewMatchCreatedEventSchema,
  type InterviewMatchCreatedEvent,
} from '../notifications/interview-notification-event'
import {
  matcherCreatedInterviewSchema,
  type MatcherCreatedInterview,
} from './types'

export const matcherParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid(),
}).strict()

export const matcherMatchCreatedEventSchema = interviewMatchCreatedEventSchema

export type MatcherMatchCreatedEvent = InterviewMatchCreatedEvent

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
  const interview = matcherCreatedInterviewSchema.parse(input.interview)

  return buildInterviewMatchCreatedEvent(
    {
      interview,
      participants: {
        scheduler_user_id: interview.scheduler_id,
        interviewer_user_id: interview.interviewer_id,
      },
    },
    dependencies,
  )
}

export function buildMatcherMatchCreatedIdempotencyKey(interviewId: string): string {
  return buildInterviewMatchCreatedIdempotencyKey(interviewId)
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
