import {
  buildInterviewMatchCreatedEvent,
  buildInterviewMatchCreatedIdempotencyKey as buildInterviewMatchCreatedIdempotencyKeyFromContract,
  interviewMatchCreatedEventSchema,
  matchedQueueEventParticipantsSchema as matcherParticipantsSchema,
  type InterviewMatchCreatedEvent as MatcherMatchCreatedEvent,
} from '../notification-queue-event-contract'
import {
  matcherCreatedInterviewSchema,
  type MatcherCreatedInterview,
} from './types'

export {
  interviewMatchCreatedEventSchema as matcherMatchCreatedEventSchema,
  matcherParticipantsSchema,
  type MatcherMatchCreatedEvent,
}

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
  return buildInterviewMatchCreatedEvent({ interview }, dependencies)
}

export function buildMatcherMatchCreatedIdempotencyKey(
  interviewId: string,
): string {
  return buildInterviewMatchCreatedIdempotencyKeyFromContract(interviewId)
}

export function createMatcherQueuePostCommitEventPublisher(
  queueTransport: MatcherPostCommitQueueTransport,
): MatcherPostCommitEventPublisher {
  return {
    publish: async function publish(event: MatcherMatchCreatedEvent) {
      const payload = interviewMatchCreatedEventSchema.parse(event)
      await queueTransport.send(payload)
    },
  }
}
