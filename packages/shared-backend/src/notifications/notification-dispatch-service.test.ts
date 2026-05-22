import { describe, expect, it } from 'vitest'
import { NotificationDispatchService } from './notification-dispatch-service'
import {
  reminderDueTransportMessageSchema,
  type NotificationTransport,
} from './notification-transport-message'
import type {
  NotificationOutboxEventRow,
  NotificationReminderScheduleRow,
  InterviewState,
} from './notification-types'
import type { NotificationRepositoryDataSource } from './notification-repository'
import { NotificationService } from './notification-service'

describe('NotificationDispatchService', function notificationDispatchServiceSuite() {
  it('dispatches a single outbox event by idempotency key', async function run() {
    const { dispatchService, dataSource, transport, sentMessages } = createDispatchService()
    dataSource.outboxEvents.push(
      createOutboxEventRow({
        idempotency_key: 'event-key',
        event_type: 'interview.created',
        event_payload: { test: 'payload' },
      }),
    )

    await dispatchService.dispatchOutboxEventByIdempotencyKey('event-key', transport)

    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0]).toEqual({ test: 'payload' })
    expect(dataSource.outboxEvents[0]?.status).toBe('dispatched')
  })

  it('dispatches pending outbox events in bulk', async function run() {
    const { dispatchService, dataSource, transport, sentMessages } = createDispatchService()
    dataSource.outboxEvents.push(
      createOutboxEventRow({ idempotency_key: 'event-1', status: 'pending' }),
      createOutboxEventRow({ idempotency_key: 'event-2', status: 'pending' }),
      createOutboxEventRow({ idempotency_key: 'event-3', status: 'dispatched' }),
    )

    await dispatchService.dispatchPendingOutboxEvents(transport, 10)

    expect(sentMessages).toHaveLength(2)
    expect(dataSource.outboxEvents.filter((e) => e.status === 'dispatched')).toHaveLength(3)
  })

  it('preserves pending state and increments attempts on transient dispatch failure', async function run() {
    const { dispatchService, dataSource, sentMessages } = createDispatchService()
    dataSource.outboxEvents.push(
      createOutboxEventRow({
        idempotency_key: 'event-key',
        status: 'pending',
        dispatch_attempts: 1,
      }),
    )

    const failingTransport: NotificationTransport = {
      async send() {
        throw new Error('transport failure')
      },
    }

    await dispatchService.dispatchOutboxEventByIdempotencyKey('event-key', failingTransport)

    expect(sentMessages).toHaveLength(0)
    expect(dataSource.outboxEvents[0]?.status).toBe('failed')
    expect(dataSource.outboxEvents[0]?.dispatch_attempts).toBe(2)
  })

  it('enqueues due reminder schedules as reminder-due transport messages', async function run() {
    const { dispatchService, dataSource, transport, sentMessages } = createDispatchService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        id: 'schedule-1',
        interview_id: '11111111-1111-4111-8111-111111111111',
        idempotency_key: 'reminder:interview-1',
        reminder_due_at: '2026-05-22T12:00:00.000Z',
        status: 'pending',
      }),
      createReminderScheduleRow({
        id: 'schedule-2',
        interview_id: '22222222-2222-4222-8222-222222222222',
        idempotency_key: 'reminder:interview-2',
        reminder_due_at: '2026-05-22T15:00:00.000Z',
        status: 'pending',
      }),
    )
    dataSource.interviews.set('11111111-1111-4111-8111-111111111111', {
      id: '11111111-1111-4111-8111-111111111111',
      scheduler_id: 'scheduler-1',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T09:00:00.000Z',
      updated_at: '2026-05-22T09:00:00.000Z',
    })

    await dispatchService.enqueueDueReminders(transport, '2026-05-22T13:00:00.000Z')

    expect(sentMessages).toHaveLength(1)
    expect(() => reminderDueTransportMessageSchema.parse(sentMessages[0])).not.toThrow()
    expect(sentMessages[0]).toMatchObject({
      message_type: 'reminder.due',
      interview_id: '11111111-1111-4111-8111-111111111111',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T12:00:00.000Z',
    })
    expect(dataSource.reminderSchedules[0]?.status).toBe('dispatched')
    expect(dataSource.reminderSchedules[1]?.status).toBe('pending')
  })

  it('skips reminders when interview state is missing', async function run() {
    const { dispatchService, dataSource, transport, sentMessages } = createDispatchService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        id: 'schedule-1',
        interview_id: '11111111-1111-4111-8111-111111111111',
        idempotency_key: 'reminder:interview-1',
        reminder_due_at: '2026-05-22T12:00:00.000Z',
        status: 'pending',
      }),
    )

    await dispatchService.enqueueDueReminders(transport, '2026-05-22T13:00:00.000Z')

    expect(sentMessages).toHaveLength(0)
    expect(dataSource.reminderSchedules[0]?.status).toBe('pending')
  })

  it('normalizes reminder scheduled_at to an ISO string when interview state has Date values', async function run() {
    const { dispatchService, dataSource, transport, sentMessages } = createDispatchService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        id: 'schedule-1',
        interview_id: '11111111-1111-4111-8111-111111111111',
        idempotency_key: 'reminder:interview-1',
        reminder_due_at: '2026-05-22T12:00:00.000Z',
        status: 'pending',
      }),
    )
    dataSource.interviews.set('11111111-1111-4111-8111-111111111111', {
      id: '11111111-1111-4111-8111-111111111111',
      scheduler_id: 'scheduler-1',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: new Date('2026-05-22T14:00:00.000Z') as unknown as string,
      created_at: '2026-05-22T09:00:00.000Z',
      updated_at: '2026-05-22T09:00:00.000Z',
    })

    await dispatchService.enqueueDueReminders(transport, '2026-05-22T13:00:00.000Z')

    expect(sentMessages).toHaveLength(1)
    const parsedMessage = reminderDueTransportMessageSchema.parse(sentMessages[0])
    expect(parsedMessage.scheduled_at).toBe('2026-05-22T14:00:00.000Z')
    expect(dataSource.reminderSchedules[0]?.status).toBe('dispatched')
  })

  it('preserves idempotency and retry metadata during dispatch', async function run() {
    const { dispatchService, dataSource, transport, sentMessages } = createDispatchService()
    dataSource.outboxEvents.push(
      createOutboxEventRow({
        idempotency_key: 'event-key',
        event_type: 'interview.created',
        event_payload: { idempotency_key: 'event-key' },
        dispatch_attempts: 0,
      }),
    )

    await dispatchService.dispatchPendingOutboxEvents(transport)

    expect(sentMessages).toHaveLength(1)
    expect(dataSource.outboxEvents[0]?.status).toBe('dispatched')
  })

  it('handles missing outbox event gracefully during single dispatch', async function run() {
    const { dispatchService, transport, sentMessages } = createDispatchService()

    await dispatchService.dispatchOutboxEventByIdempotencyKey('missing-key', transport)

    expect(sentMessages).toHaveLength(0)
  })
})

type InMemoryNotificationDataSource = {
  outboxEvents: NotificationOutboxEventRow[]
  checkpoints: Array<{ idempotency_key: string; checkpoint_key: string }>
  reminderSchedules: NotificationReminderScheduleRow[]
  interviews: Map<string, InterviewState>
}

function createDispatchService(): {
  dispatchService: NotificationDispatchService
  dataSource: InMemoryNotificationDataSource
  transport: NotificationTransport
  sentMessages: unknown[]
} {
  const dataSource: InMemoryNotificationDataSource = {
    outboxEvents: [],
    checkpoints: [],
    reminderSchedules: [],
    interviews: new Map(),
  }

  const sentMessages: unknown[] = []

  const transport: NotificationTransport = {
    async send(message) {
      sentMessages.push(message)
    },
  }

  const repository: NotificationRepositoryDataSource = {
    async persistOutboxEvent(): Promise<void> {},

    async fetchPendingOutboxEvents(limit: number): Promise<NotificationOutboxEventRow[]> {
      return dataSource.outboxEvents.filter((e) => e.status === 'pending').slice(0, limit)
    },

    async fetchOutboxEventByIdempotencyKey(
      idempotencyKey: string,
    ): Promise<NotificationOutboxEventRow | null> {
      return (
        dataSource.outboxEvents.find((e) => e.idempotency_key === idempotencyKey) ?? null
      )
    },

    async markOutboxEventDispatched(idempotencyKey: string): Promise<void> {
      const event = dataSource.outboxEvents.find(
        (e) => e.idempotency_key === idempotencyKey,
      )
      if (event) {
        event.status = 'dispatched'
      }
    },

    async recordDispatchFailure(idempotencyKey: string): Promise<void> {
      const event = dataSource.outboxEvents.find(
        (e) => e.idempotency_key === idempotencyKey,
      )
      if (event) {
        event.dispatch_attempts += 1
        event.status = 'failed'
      }
    },

    async recordCheckpoint(): Promise<void> {},

    async hasCheckpoint(): Promise<boolean> {
      return false
    },

    async createReminderSchedule(): Promise<void> {},

    async listDueReminderSchedules(before: string): Promise<NotificationReminderScheduleRow[]> {
      return dataSource.reminderSchedules.filter(
        (s) => s.status === 'pending' && s.reminder_due_at <= before,
      )
    },

    async suppressReminderSchedulesForInterview(): Promise<number> {
      return 0
    },

    async markReminderDispatched(id: string): Promise<void> {
      const schedule = dataSource.reminderSchedules.find((s) => s.id === id)
      if (schedule) {
        schedule.status = 'dispatched'
      }
    },

    async getInterviewState(id: string): Promise<InterviewState | null> {
      return dataSource.interviews.get(id) ?? null
    },
  }

  const service = new NotificationService(
    repository as unknown as import('./notification-repository').NotificationRepository,
    () => 'schedule-id',
    () => '2026-05-22T10:00:00.000Z',
  )

  const dispatchService = new NotificationDispatchService(
    service,
    () => '2026-05-22T10:00:00.000Z',
  )

  return { dispatchService, dataSource, transport, sentMessages }
}

function createOutboxEventRow(
  overrides: Partial<NotificationOutboxEventRow> = {},
): NotificationOutboxEventRow {
  return {
    idempotency_key: 'default-key',
    event_type: 'interview.created',
    event_payload: {},
    status: 'pending',
    dispatch_attempts: 0,
    last_dispatch_attempted_at: null,
    created_at: '2026-05-22T10:00:00.000Z',
    updated_at: '2026-05-22T10:00:00.000Z',
    ...overrides,
  }
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
