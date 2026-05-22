import type { NotificationTransport } from './notification-transport-message'
import type { NotificationService } from './notification-service'
import type { NotificationOutboxEventRow } from './notification-types'

export type NotificationDispatchServiceLogger = {
  error(event: string, context: Record<string, unknown>): void | Promise<void>
}

const noOpLogger: NotificationDispatchServiceLogger = {
  error: () => undefined,
}

export class NotificationDispatchService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly now: () => string = defaultNow,
    private readonly logger: NotificationDispatchServiceLogger = noOpLogger,
  ) {}

  async dispatchOutboxEventByIdempotencyKey(
    idempotencyKey: string,
    transport: NotificationTransport,
  ): Promise<void> {
    const event = await this.notificationService.fetchOutboxEventByIdempotencyKey(idempotencyKey)

    if (!event) {
      return
    }

    await this.dispatchEvent(event, transport)
  }

  async dispatchPendingOutboxEvents(
    transport: NotificationTransport,
    limit: number = 50,
  ): Promise<void> {
    const events = await this.notificationService.fetchPendingOutboxEvents(limit)

    for (const event of events) {
      await this.dispatchEvent(event, transport)
    }
  }

  async enqueueDueReminders(
    transport: NotificationTransport,
    before?: string,
  ): Promise<void> {
    const dueBefore = before ?? this.now()
    const dueSchedules = await this.notificationService.listDueReminderSchedules(dueBefore)

    for (const schedule of dueSchedules) {
      try {
        const interviewState = await this.notificationService.getInterviewState(schedule.interview_id)

        if (!interviewState) {
          await this.logSafely('notification.enqueue_reminder_missing_interview', {
            schedule_id: schedule.id,
            interview_id: schedule.interview_id,
          })
          continue
        }

        const scheduledAt = toIsoDateTime(interviewState.scheduled_at)

        if (!scheduledAt) {
          await this.logSafely('notification.enqueue_reminder_invalid_scheduled_at', {
            schedule_id: schedule.id,
            interview_id: schedule.interview_id,
            scheduled_at: interviewState.scheduled_at,
          })
          continue
        }

        await transport.send({
          message_type: 'reminder.due',
          idempotency_key: schedule.idempotency_key,
          interview_id: schedule.interview_id,
          scheduled_at: scheduledAt,
          reminder_due_at: schedule.reminder_due_at,
        })

        await this.notificationService.markReminderDispatched(schedule.id)
      } catch (error) {
        await this.logSafely('notification.enqueue_reminder_failure', {
          schedule_id: schedule.id,
          interview_id: schedule.interview_id,
          error_message: toErrorMessage(error),
        })
      }
    }
  }

  private async dispatchEvent(
    event: NotificationOutboxEventRow,
    transport: NotificationTransport,
  ): Promise<void> {
    try {
      await transport.send(event.event_payload as unknown as Parameters<NotificationTransport['send']>[0])
      await this.notificationService.markOutboxEventDispatched(event.idempotency_key)
    } catch (error) {
      await this.notificationService.recordDispatchFailure(event.idempotency_key)
      await this.logSafely('notification.dispatch_failure', {
        idempotency_key: event.idempotency_key,
        event_type: event.event_type,
        error_message: toErrorMessage(error),
      })
    }
  }

  private async logSafely(
    event: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.logger.error(event, context)
    } catch {
      // no-op
    }
  }
}

function defaultNow(): string {
  return new Date().toISOString()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function toIsoDateTime(input: unknown): string | null {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      return null
    }

    return input.toISOString()
  }

  if (typeof input === 'string') {
    const parsed = new Date(input)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }

    return parsed.toISOString()
  }

  return null
}
