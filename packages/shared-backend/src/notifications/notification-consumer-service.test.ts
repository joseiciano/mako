import { describe, expect, it } from 'vitest'
import { NotificationConsumerService } from './notification-consumer-service'
import type {
  InterviewCreatedEvent,
  InterviewCancelledEvent,
  InterviewMatchCreatedEvent,
} from '../notification-queue-event-contract'
import type {
  NotificationOutboxEventRow,
  NotificationReminderScheduleRow,
  InterviewState,
} from './notification-types'
import type { NotificationRepositoryDataSource } from './notification-repository'
import { NotificationService } from './notification-service'

describe('NotificationConsumerService', function notificationConsumerServiceSuite() {
  it('processes interview.created by recording confirmation checkpoint and scheduling reminder', async function run() {
    const { consumer, dataSource } = createConsumerService()

    await consumer.processInterviewCreated(createInterviewCreatedEvent())

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:confirmation',
    })
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.interview_id).toBe('interview-id')
    expect(dataSource.reminderSchedules[0]?.status).toBe('pending')
  })

  it('does not duplicate side effects on repeated interview.created delivery', async function run() {
    const { consumer, dataSource } = createConsumerService()
    const event = createInterviewCreatedEvent()

    await consumer.processInterviewCreated(event)
    await consumer.processInterviewCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.reminderSchedules).toHaveLength(1)
  })

  it('suppresses reminder scheduling when interview is in the past', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T15:00:00.000Z',
    })

    await consumer.processInterviewCreated(
      createInterviewCreatedEvent('2026-05-22T14:00:00.000Z'),
    )

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('suppresses reminder scheduling when interview is less than 30 minutes away', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T13:45:00.000Z',
    })

    await consumer.processInterviewCreated(
      createInterviewCreatedEvent('2026-05-22T14:00:00.000Z'),
    )

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('resumes reminder scheduling on replay when confirmation checkpoint already exists', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewCreatedEvent()

    // Simulate crash after confirmation checkpoint but before reminder scheduling
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.created:confirmation',
    )

    await consumer.processInterviewCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:confirmation',
    })
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(1)
  })

  it('processes interview.cancelled by suppressing reminders and recording suppression checkpoint', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        interview_id: 'interview-id',
        status: 'pending',
      }),
    )

    await consumer.processInterviewCancelled(createInterviewCancelledEvent())

    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.cancelled:interview-id',
      checkpoint_key: 'interview.cancelled:suppression',
    })
    expect(dataSource.reminderSchedules[0]?.status).toBe('suppressed')
  })

  it('duplicate cancellation suppression is idempotent', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        interview_id: 'interview-id',
        status: 'pending',
      }),
    )
    const event = createInterviewCancelledEvent()

    await consumer.processInterviewCancelled(event)
    await consumer.processInterviewCancelled(event)

    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.status).toBe('suppressed')
  })

  it('resumes suppression on replay after partial progress', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        interview_id: 'interview-id',
        status: 'pending',
      }),
    )
    const event = createInterviewCancelledEvent()

    // Simulate crash after suppression but before checkpoint
    await notificationService.suppressReminderSchedulesForInterview(event.interview.id)

    await consumer.processInterviewCancelled(event)

    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.cancelled:interview-id',
      checkpoint_key: 'interview.cancelled:suppression',
    })
    expect(dataSource.reminderSchedules[0]?.status).toBe('suppressed')
  })

  it('processes interview.match.created by recording confirmation checkpoint and scheduling reminder', async function run() {
    const { consumer, dataSource } = createConsumerService()

    await consumer.processInterviewMatchCreated(createInterviewMatchCreatedEvent())

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.match.created:interview-id',
      checkpoint_key: 'interview.match.created:confirmation',
    })
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.match.created:interview-id',
      checkpoint_key: 'interview.match.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.interview_id).toBe('interview-id')
  })

  it('does not duplicate side effects on repeated interview.match.created delivery', async function run() {
    const { consumer, dataSource } = createConsumerService()
    const event = createInterviewMatchCreatedEvent()

    await consumer.processInterviewMatchCreated(event)
    await consumer.processInterviewMatchCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.reminderSchedules).toHaveLength(1)
  })

  it('resumes match reminder scheduling on replay when confirmation checkpoint already exists', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewMatchCreatedEvent()

    // Simulate crash after confirmation checkpoint but before reminder scheduling
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.match.created:confirmation',
    )

    await consumer.processInterviewMatchCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.reminderSchedules).toHaveLength(1)
  })

  it('processes reminder.due with checkpoint and state guard', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'reminder:interview-id',
      checkpoint_key: 'reminder.due:reminder:interview-id',
    })
  })

  it('reminder-due processing is restart-safe via durable checkpoint state', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })
    const message = {
      message_type: 'reminder.due' as const,
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    }

    await consumer.processReminderDue(message)
    await consumer.processReminderDue(message)

    expect(dataSource.checkpoints).toHaveLength(1)
  })

  it('skips reminder-due when interview is not scheduled', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'cancelled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(dataSource.checkpoints).toHaveLength(1)
  })

  it('skips reminder-due when interview is not found', async function run() {
    const { consumer, dataSource } = createConsumerService()

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(dataSource.checkpoints).toHaveLength(1)
  })

  it('never mutates interview lifecycle state during processing', async function run() {
    const { consumer, dataSource } = createConsumerService()
    const interview: InterviewState = {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    }
    dataSource.interviews.set('interview-id', { ...interview })

    await consumer.processInterviewCreated(createInterviewCreatedEvent())
    await consumer.processInterviewCancelled(createInterviewCancelledEvent())

    const storedInterview = dataSource.interviews.get('interview-id')
    expect(storedInterview?.status).toBe('scheduled')
    expect(storedInterview?.updated_at).toBe('2026-05-22T10:00:00.000Z')
  })
})

type InMemoryNotificationDataSource = {
  outboxEvents: NotificationOutboxEventRow[]
  checkpoints: Array<{ idempotency_key: string; checkpoint_key: string }>
  reminderSchedules: NotificationReminderScheduleRow[]
  interviews: Map<string, InterviewState>
}

function createConsumerService(options: { now?: () => string } = {}): {
  consumer: NotificationConsumerService
  dataSource: InMemoryNotificationDataSource
  notificationService: NotificationService
} {
  const dataSource: InMemoryNotificationDataSource = {
    outboxEvents: [],
    checkpoints: [],
    reminderSchedules: [],
    interviews: new Map(),
  }

  const repository: NotificationRepositoryDataSource = {
    async persistOutboxEvent(): Promise<void> {},

    async fetchPendingOutboxEvents(): Promise<NotificationOutboxEventRow[]> {
      return []
    },

    async fetchOutboxEventByIdempotencyKey(): Promise<NotificationOutboxEventRow | null> {
      return null
    },

    async markOutboxEventDispatched(): Promise<void> {},

    async recordDispatchFailure(): Promise<void> {},

    async recordCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<void> {
      const exists = dataSource.checkpoints.some(
        (c) => c.idempotency_key === idempotencyKey && c.checkpoint_key === checkpointKey,
      )
      if (!exists) {
        dataSource.checkpoints.push({ idempotency_key: idempotencyKey, checkpoint_key: checkpointKey })
      }
    },

    async hasCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<boolean> {
      return dataSource.checkpoints.some(
        (c) => c.idempotency_key === idempotencyKey && c.checkpoint_key === checkpointKey,
      )
    },

    async createReminderSchedule(schedule: NotificationReminderScheduleRow): Promise<void> {
      dataSource.reminderSchedules.push({ ...schedule })
    },

    async listDueReminderSchedules(): Promise<NotificationReminderScheduleRow[]> {
      return []
    },

    async suppressReminderSchedulesForInterview(interviewId: string): Promise<number> {
      let count = 0
      for (const schedule of dataSource.reminderSchedules) {
        if (schedule.interview_id === interviewId && schedule.status === 'pending') {
          schedule.status = 'suppressed'
          count += 1
        }
      }
      return count
    },

    async markReminderDispatched(): Promise<void> {},

    async getInterviewState(id: string): Promise<InterviewState | null> {
      return dataSource.interviews.get(id) ?? null
    },
  }

  const service = new NotificationService(
    repository as unknown as import('./notification-repository').NotificationRepository,
    () => 'schedule-id',
    options.now ?? (() => '2026-05-22T10:00:00.000Z'),
  )

  const consumer = new NotificationConsumerService(
    service,
    options.now ?? (() => '2026-05-22T10:00:00.000Z'),
  )

  return { consumer, dataSource, notificationService: service }
}

function createInterviewCreatedEvent(
  scheduledAt: string = '2026-05-22T14:00:00.000Z',
): InterviewCreatedEvent {
  return {
    event_type: 'interview.created',
    event_id: 'event-id',
    idempotency_key: 'interview.created:interview-id',
    occurred_at: '2026-05-22T10:00:00.000Z',
    interview: {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: scheduledAt,
    },
    participants: {
      scheduler_user_id: 'scheduler-id',
      interviewer_user_id: null,
    },
  }
}

function createInterviewCancelledEvent(
  overrides: Partial<InterviewCancelledEvent> = {},
): InterviewCancelledEvent {
  return {
    event_type: 'interview.cancelled',
    event_id: 'event-id',
    idempotency_key: 'interview.cancelled:interview-id',
    occurred_at: '2026-05-22T10:00:00.000Z',
    interview: {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'cancelled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
    },
    participants: {
      scheduler_user_id: 'scheduler-id',
      interviewer_user_id: null,
    },
    ...overrides,
  } as InterviewCancelledEvent
}

function createInterviewMatchCreatedEvent(
  overrides: Partial<InterviewMatchCreatedEvent> = {},
): InterviewMatchCreatedEvent {
  return {
    event_type: 'interview.match.created',
    event_id: 'event-id',
    idempotency_key: 'interview.match.created:interview-id',
    occurred_at: '2026-05-22T10:00:00.000Z',
    interview: {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
    },
    participants: {
      scheduler_user_id: 'scheduler-id',
      interviewer_user_id: 'interviewer-id',
    },
    ...overrides,
  } as InterviewMatchCreatedEvent
}

function createReminderScheduleRow(
  overrides: Partial<NotificationReminderScheduleRow> = {},
): NotificationReminderScheduleRow {
  return {
    id: 'schedule-id',
    interview_id: 'interview-id',
    idempotency_key: 'default-key',
    reminder_due_at: '2026-05-22T13:00:00.000Z',
    status: 'pending',
    created_at: '2026-05-22T10:00:00.000Z',
    updated_at: '2026-05-22T10:00:00.000Z',
    ...overrides,
  }
}
