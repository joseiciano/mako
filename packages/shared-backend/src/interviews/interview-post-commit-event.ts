import {
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  interviewCompletedEventSchema,
  queueEventParticipantsSchema as interviewParticipantsSchema,
  type InterviewCreatedEvent,
  type InterviewCancelledEvent,
  type InterviewCompletedEvent,
  buildInterviewCreatedEvent,
  buildInterviewCreatedIdempotencyKey,
  buildInterviewCancelledEvent,
  buildInterviewCancelledIdempotencyKey,
  buildInterviewCompletedEvent,
  buildInterviewCompletedIdempotencyKey,
} from '../notification-queue-event-contract'

export {
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  interviewCompletedEventSchema,
  interviewParticipantsSchema,
  buildInterviewCreatedEvent,
  buildInterviewCreatedIdempotencyKey,
  buildInterviewCancelledEvent,
  buildInterviewCancelledIdempotencyKey,
  buildInterviewCompletedEvent,
  buildInterviewCompletedIdempotencyKey,
  type InterviewCreatedEvent,
  type InterviewCancelledEvent,
  type InterviewCompletedEvent,
}

export type InterviewPostCommitEvent =
  | InterviewCreatedEvent
  | InterviewCancelledEvent
  | InterviewCompletedEvent

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
          : event.event_type === 'interview.cancelled'
            ? interviewCancelledEventSchema.parse(event)
            : interviewCompletedEventSchema.parse(event)
      await queueTransport.send(payload)
    },
  }
}
