import type {
  AccountPrivacyCleanupRequestedEvent,
  InterviewCancelledEvent,
  InterviewCompletedEvent,
  InterviewCreatedEvent,
  InterviewMatchCreatedEvent,
  InterviewPremiumBookedEvent,
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
    event:
      | InterviewCreatedEvent
      | InterviewCancelledEvent
      | InterviewCompletedEvent
      | InterviewMatchCreatedEvent
      | InterviewPremiumBookedEvent
      | AccountPrivacyCleanupRequestedEvent,
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

  async listDueReminderSchedules(
    before: string,
    limit?: number,
  ): Promise<NotificationReminderScheduleRow[]> {
    return this.repository.listDueReminderSchedules(before, limit)
  }

  async suppressReminderSchedulesForInterview(interviewId: string): Promise<number> {
    return this.repository.suppressReminderSchedulesForInterview(interviewId)
  }

  async markReminderDispatched(id: string): Promise<void> {
    await this.repository.markReminderDispatched(id)
  }

  async markReminderDispatchedBatch(ids: string[]): Promise<void> {
    await this.repository.markReminderDispatchedBatch(ids)
  }

  async getInterviewState(id: string): Promise<import('./notification-types').InterviewState | null> {
    const interview = await this.repository.getInterviewState(id)
    if (!interview) return null
    return interview
  }

  async getInterviewStates(
    ids: string[],
  ): Promise<Map<string, import('./notification-types').InterviewState>> {
    const interviews = await this.repository.getInterviewStates(ids)
    return new Map(
      Array.from(interviews.entries()).map(([id, interview]) => [id, interview]),
    )
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
