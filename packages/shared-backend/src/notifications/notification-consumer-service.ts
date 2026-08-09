import type {
  InterviewCancelledEvent,
  InterviewCreatedEvent,
  InterviewMatchCreatedEvent,
  InterviewPremiumBookedEvent,
} from '../notification-queue-event-contract'
import type { ReminderDueTransportMessage } from './notification-transport-message'
import type { NotificationService } from './notification-service'

export type NotificationDeliveryPort = {
  send(input: {
    kind: 'confirmation' | 'reminder'
    interviewId: string
    scheduledAt: string
    recipientUserIds: string[]
    idempotencyKey: string
  }): Promise<void>
}

export type NotificationConsumerServiceLogger = {
  error(event: string, context: Record<string, unknown>): void | Promise<void>
  warn(event: string, context: Record<string, unknown>): void | Promise<void>
}

const noOpLogger: NotificationConsumerServiceLogger = {
  error: () => undefined,
  warn: () => undefined,
}

const noOpDeliveryPort: NotificationDeliveryPort = {
  async send(): Promise<void> {},
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000

export class NotificationConsumerService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly now: () => string = defaultNow,
    private readonly logger: NotificationConsumerServiceLogger = noOpLogger,
    private readonly deliveryPort: NotificationDeliveryPort = noOpDeliveryPort,
  ) {}

  async processInterviewCreated(event: InterviewCreatedEvent): Promise<void> {
    const confirmationKey = 'interview.created:confirmation'
    const reminderKey = 'interview.created:reminder'

    const confirmationAlreadyExisted = await this.notificationService.hasCheckpoint(
      event.idempotency_key,
      confirmationKey,
    )
    if (!confirmationAlreadyExisted) {
      await this.deliveryPort.send({
        kind: 'confirmation',
        interviewId: event.interview.id,
        scheduledAt: event.interview.scheduled_at,
        recipientUserIds: [event.interview.scheduler_id],
        idempotencyKey: `${event.idempotency_key}/confirmation`,
      })
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

    if (reminderDueAt < now) {
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
      const recipientUserIds = [event.interview.scheduler_id]
      if (event.interview.interviewer_id) {
        recipientUserIds.push(event.interview.interviewer_id)
      }
      await this.deliveryPort.send({
        kind: 'confirmation',
        interviewId: event.interview.id,
        scheduledAt: event.interview.scheduled_at,
        recipientUserIds,
        idempotencyKey: `${event.idempotency_key}/confirmation`,
      })
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

    if (reminderDueAt < now) {
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

  async processInterviewPremiumBooked(event: InterviewPremiumBookedEvent): Promise<void> {
    const confirmationKey = 'interview.premium_booked:confirmation'
    const reminderKey = 'interview.premium_booked:reminder'

    const confirmationAlreadyExisted = await this.notificationService.hasCheckpoint(
      event.idempotency_key,
      confirmationKey,
    )
    if (!confirmationAlreadyExisted) {
      const recipientUserIds = [event.interview.scheduler_id]
      if (event.interview.interviewer_id) {
        recipientUserIds.push(event.interview.interviewer_id)
      }
      await this.deliveryPort.send({
        kind: 'confirmation',
        interviewId: event.interview.id,
        scheduledAt: event.interview.scheduled_at,
        recipientUserIds,
        idempotencyKey: `${event.idempotency_key}/confirmation`,
      })
      await this.notificationService.recordCheckpoint(event.idempotency_key, confirmationKey)
    }

    if (await this.notificationService.hasCheckpoint(event.idempotency_key, reminderKey)) {
      await this.logger.warn('notification.consumer.dedupe', {
        event_type: 'interview.premium_booked',
        interview_id: event.interview.id,
        checkpoint: reminderKey,
      })
      return
    }

    const scheduledAt = new Date(event.interview.scheduled_at).getTime()
    const now = new Date(this.now()).getTime()
    const reminderDueAt = scheduledAt - THIRTY_MINUTES_MS

    if (reminderDueAt < now) {
      await this.notificationService.recordCheckpoint(event.idempotency_key, reminderKey)
      return
    }

    const interviewState = await this.notificationService.getInterviewState(event.interview.id)
    if (!interviewState || interviewState.status !== 'scheduled') {
      await this.logger.warn('notification.consumer.reminder_suppressed', {
        event_type: 'interview.premium_booked',
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

    const scheduledAtMs = new Date(interviewState.scheduled_at).getTime()
    const nowMs = new Date(this.now()).getTime()
    const expectedReminderDueAtMs = scheduledAtMs - THIRTY_MINUTES_MS
    const messageReminderDueAtMs = new Date(message.reminder_due_at).getTime()

    if (scheduledAtMs <= nowMs) {
      await this.logger.warn('notification.consumer.reminder_suppressed', {
        message_type: 'reminder.due',
        interview_id: message.interview_id,
        interview_status: interviewState.status,
        reason: 'interview_start_time_in_past',
      })
      await this.notificationService.recordCheckpoint(message.idempotency_key, checkpointKey)
      return
    }

    if (expectedReminderDueAtMs !== messageReminderDueAtMs) {
      await this.logger.warn('notification.consumer.reminder_suppressed', {
        message_type: 'reminder.due',
        interview_id: message.interview_id,
        interview_status: interviewState.status,
        reason: 'reminder_due_time_mismatch',
      })
      await this.notificationService.recordCheckpoint(message.idempotency_key, checkpointKey)
      return
    }

    const recipientUserIds = [interviewState.scheduler_id]
    if (interviewState.mode === 'peer_to_peer' && interviewState.interviewer_id) {
      recipientUserIds.push(interviewState.interviewer_id)
    }

    await this.deliveryPort.send({
      kind: 'reminder',
      interviewId: message.interview_id,
      scheduledAt: interviewState.scheduled_at,
      recipientUserIds,
      idempotencyKey: `${message.idempotency_key}/delivery`,
    })
    await this.notificationService.recordCheckpoint(message.idempotency_key, checkpointKey)
  }
}

function defaultNow(): string {
  return new Date().toISOString()
}
