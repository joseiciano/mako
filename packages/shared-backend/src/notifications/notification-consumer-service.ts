import type {
  InterviewCancelledEvent,
  InterviewCreatedEvent,
  InterviewMatchCreatedEvent,
} from '../notification-queue-event-contract'
import type { ReminderDueTransportMessage } from './notification-transport-message'
import type { NotificationService } from './notification-service'

export type NotificationConsumerServiceLogger = {
  error(event: string, context: Record<string, unknown>): void | Promise<void>
  warn(event: string, context: Record<string, unknown>): void | Promise<void>
}

const noOpLogger: NotificationConsumerServiceLogger = {
  error: () => undefined,
  warn: () => undefined,
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000

export class NotificationConsumerService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly now: () => string = defaultNow,
    private readonly logger: NotificationConsumerServiceLogger = noOpLogger,
  ) {}

  async processInterviewCreated(event: InterviewCreatedEvent): Promise<void> {
    const confirmationKey = 'interview.created:confirmation'
    const reminderKey = 'interview.created:reminder'

    const confirmationAlreadyExisted = await this.notificationService.hasCheckpoint(
      event.idempotency_key,
      confirmationKey,
    )
    if (!confirmationAlreadyExisted) {
      await this.notificationService.recordCheckpoint(event.idempotency_key, confirmationKey)
    }

    if (await this.notificationService.hasCheckpoint(event.idempotency_key, reminderKey)) {
      await this.logger.warn('notification.consumer.dedupe', {
        event_type: 'interview.created',
        interview_id: event.interview.id,
        checkpoint: reminderKey,
      })
      return
    }

    const scheduledAt = new Date(event.interview.scheduled_at).getTime()
    const now = new Date(this.now()).getTime()
    const reminderDueAt = scheduledAt - THIRTY_MINUTES_MS

    if (reminderDueAt <= now) {
      await this.notificationService.recordCheckpoint(event.idempotency_key, reminderKey)
      return
    }

    const interviewState = await this.notificationService.getInterviewState(event.interview.id)
    if (!interviewState || interviewState.status !== 'scheduled') {
      await this.logger.warn('notification.consumer.reminder_suppressed', {
        event_type: 'interview.created',
        interview_id: event.interview.id,
        interview_status: interviewState?.status ?? 'not_found',
        reason: 'interview_not_scheduled',
      })
      await this.notificationService.recordCheckpoint(event.idempotency_key, reminderKey)
      return
    }

    await this.notificationService.createReminderSchedule({
      interviewId: event.interview.id,
      idempotencyKey: event.idempotency_key,
      reminderDueAt: new Date(reminderDueAt).toISOString(),
    })
    await this.notificationService.recordCheckpoint(event.idempotency_key, reminderKey)
  }

  async processInterviewCancelled(event: InterviewCancelledEvent): Promise<void> {
    const suppressionKey = 'interview.cancelled:suppression'

    if (await this.notificationService.hasCheckpoint(event.idempotency_key, suppressionKey)) {
      await this.logger.warn('notification.consumer.dedupe', {
        event_type: 'interview.cancelled',
        interview_id: event.interview.id,
        checkpoint: suppressionKey,
      })
      return
    }

    await this.notificationService.suppressReminderSchedulesForInterview(event.interview.id)
    await this.notificationService.recordCheckpoint(event.idempotency_key, suppressionKey)
  }

  async processInterviewMatchCreated(event: InterviewMatchCreatedEvent): Promise<void> {
    const confirmationKey = 'interview.match.created:confirmation'
    const reminderKey = 'interview.match.created:reminder'

    const confirmationAlreadyExisted = await this.notificationService.hasCheckpoint(
      event.idempotency_key,
      confirmationKey,
    )
    if (!confirmationAlreadyExisted) {
      await this.notificationService.recordCheckpoint(event.idempotency_key, confirmationKey)
    }

    if (await this.notificationService.hasCheckpoint(event.idempotency_key, reminderKey)) {
      await this.logger.warn('notification.consumer.dedupe', {
        event_type: 'interview.match.created',
        interview_id: event.interview.id,
        checkpoint: reminderKey,
      })
      return
    }

    const scheduledAt = new Date(event.interview.scheduled_at).getTime()
    const now = new Date(this.now()).getTime()
    const reminderDueAt = scheduledAt - THIRTY_MINUTES_MS

    if (reminderDueAt <= now) {
      await this.notificationService.recordCheckpoint(event.idempotency_key, reminderKey)
      return
    }

    const interviewState = await this.notificationService.getInterviewState(event.interview.id)
    if (!interviewState || interviewState.status !== 'scheduled') {
      await this.logger.warn('notification.consumer.reminder_suppressed', {
        event_type: 'interview.match.created',
        interview_id: event.interview.id,
        interview_status: interviewState?.status ?? 'not_found',
        reason: 'interview_not_scheduled',
      })
      await this.notificationService.recordCheckpoint(event.idempotency_key, reminderKey)
      return
    }

    await this.notificationService.createReminderSchedule({
      interviewId: event.interview.id,
      idempotencyKey: event.idempotency_key,
      reminderDueAt: new Date(reminderDueAt).toISOString(),
    })
    await this.notificationService.recordCheckpoint(event.idempotency_key, reminderKey)
  }

  async processReminderDue(message: ReminderDueTransportMessage): Promise<void> {
    const checkpointKey = `reminder.due:${message.idempotency_key}`

    if (await this.notificationService.hasCheckpoint(message.idempotency_key, checkpointKey)) {
      await this.logger.warn('notification.consumer.dedupe', {
        message_type: 'reminder.due',
        interview_id: message.interview_id,
        checkpoint: checkpointKey,
      })
      return
    }

    const interviewState = await this.notificationService.getInterviewState(message.interview_id)

    if (!interviewState || interviewState.status !== 'scheduled') {
      await this.logger.warn('notification.consumer.reminder_suppressed', {
        message_type: 'reminder.due',
        interview_id: message.interview_id,
        interview_status: interviewState?.status ?? 'not_found',
        reason: 'interview_not_scheduled',
      })
      await this.notificationService.recordCheckpoint(message.idempotency_key, checkpointKey)
      return
    }

    await this.notificationService.recordCheckpoint(message.idempotency_key, checkpointKey)
  }
}

function defaultNow(): string {
  return new Date().toISOString()
}
