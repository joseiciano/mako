import {
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  queueEventParticipantsSchema as interviewParticipantsSchema,
  type InterviewCreatedEvent,
  type InterviewCancelledEvent,
  buildInterviewCreatedEvent,
  buildInterviewCreatedIdempotencyKey,
  buildInterviewCancelledEvent,
  buildInterviewCancelledIdempotencyKey,
} from '../notification-queue-event-contract'

export {
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  interviewParticipantsSchema,
  buildInterviewCreatedEvent,
  buildInterviewCreatedIdempotencyKey,
  buildInterviewCancelledEvent,
  buildInterviewCancelledIdempotencyKey,
  type InterviewCreatedEvent,
  type InterviewCancelledEvent,
}

export type InterviewPostCommitEvent =
  | InterviewCreatedEvent
  | InterviewCancelledEvent

export type InterviewPostCommitEventPublisher = {
  publish(event: InterviewPostCommitEvent): Promise<void>
}

export type InterviewPostCommitQueueTransport = {
  send(message: InterviewPostCommitEvent): Promise<void>
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
