import { z } from 'zod'
import {
  buildInterviewMatchCreatedEvent,
  buildInterviewMatchCreatedIdempotencyKey,
  createInterviewQueuePostCommitEventPublisher,
  interviewMatchCreatedEventSchema,
  interviewPostCommitEventSchema,
  type InterviewMatchCreatedEvent,
  type InterviewPostCommitEventPublisher,
  type InterviewPostCommitQueueTransport,
} from '../interviews/interview-post-commit-event'
import {
  matcherCreatedInterviewSchema,
  type MatcherCreatedInterview,
} from './types'

export const matcherParticipantsSchema = z.object({
  scheduler_user_id: z.string().uuid(),
  interviewer_user_id: z.string().uuid(),
})

export const matcherMatchCreatedEventSchema = interviewMatchCreatedEventSchema

export type MatcherMatchCreatedEvent = InterviewMatchCreatedEvent

export type MatcherPostCommitEventPublisher = InterviewPostCommitEventPublisher

export type MatcherPostCommitQueueTransport = InterviewPostCommitQueueTransport

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
      interview: {
        id: interview.id,
        scheduler_id: interview.scheduler_id,
        interviewer_id: interview.interviewer_id,
        type: interview.type,
        mode: interview.mode,
        tier: interview.tier,
        status: interview.status,
        scheduled_at: interview.scheduled_at,
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
  return createInterviewQueuePostCommitEventPublisher(queueTransport)
}
