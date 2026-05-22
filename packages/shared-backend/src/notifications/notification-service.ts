import type {
  InterviewCancelledEvent,
  InterviewCreatedEvent,
  InterviewMatchCreatedEvent,
} from '../notification-queue-event-contract'
import type { NotificationRepository } from './notification-repository'
import type {
  NotificationOutboxEventRow,
  NotificationReminderScheduleRow,
} from './notification-types'

export type NotificationServiceLogger = {
  error(event: string, context: Record<string, unknown>): void | Promise<void>
}

const noOpLogger: NotificationServiceLogger = {
  error: () => undefined,
}

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly createId: () => string = defaultCreateId,
    private readonly now: () => string = defaultNow,
    private readonly logger: NotificationServiceLogger = noOpLogger,
  ) {}

  async persistOutboxEvent(
    event: InterviewCreatedEvent | InterviewCancelledEvent | InterviewMatchCreatedEvent,
  ): Promise<void> {
    const row: NotificationOutboxEventRow = {
      idempotency_key: event.idempotency_key,
      event_type: event.event_type,
      event_payload: event as unknown as Record<string, unknown>,
      status: 'pending',
      dispatch_attempts: 0,
      last_dispatch_attempted_at: null,
      created_at: this.now(),
      updated_at: this.now(),
    }

    await this.repository.persistOutboxEvent(row)
  }

  async fetchPendingOutboxEvents(limit: number): Promise<NotificationOutboxEventRow[]> {
    return this.repository.fetchPendingOutboxEvents(limit)
  }

  async fetchOutboxEventByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<NotificationOutboxEventRow | null> {
    return this.repository.fetchOutboxEventByIdempotencyKey(idempotencyKey)
  }

  async markOutboxEventDispatched(idempotencyKey: string): Promise<void> {
    await this.repository.markOutboxEventDispatched(idempotencyKey)
  }

  async recordDispatchFailure(idempotencyKey: string): Promise<void> {
    await this.repository.recordDispatchFailure(idempotencyKey)
  }

  async recordCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<void> {
    await this.repository.recordCheckpoint(idempotencyKey, checkpointKey)
  }

  async hasCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<boolean> {
    return this.repository.hasCheckpoint(idempotencyKey, checkpointKey)
  }

  async createReminderSchedule(input: {
    interviewId: string
    idempotencyKey: string
    reminderDueAt: string
  }): Promise<void> {
    const schedule: NotificationReminderScheduleRow = {
      id: this.createId(),
      interview_id: input.interviewId,
      idempotency_key: input.idempotencyKey,
      reminder_due_at: input.reminderDueAt,
      status: 'pending',
      created_at: this.now(),
      updated_at: this.now(),
    }

    await this.repository.createReminderSchedule(schedule)
  }

  async listDueReminderSchedules(before: string): Promise<NotificationReminderScheduleRow[]> {
    return this.repository.listDueReminderSchedules(before)
  }

  async suppressReminderSchedulesForInterview(interviewId: string): Promise<number> {
    return this.repository.suppressReminderSchedulesForInterview(interviewId)
  }

  async markReminderDispatched(id: string): Promise<void> {
    await this.repository.markReminderDispatched(id)
  }

  async getInterviewState(id: string): Promise<{ status: string; scheduled_at: string } | null> {
    const interview = await this.repository.getInterviewState(id)
    if (!interview) return null
    return { status: interview.status, scheduled_at: interview.scheduled_at }
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

function defaultCreateId(): string {
  return crypto.randomUUID()
}

function defaultNow(): string {
  return new Date().toISOString()
}
