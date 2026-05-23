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

  it('preserves failed state and increments attempts on transient dispatch failure', async function run() {
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

  it('retries failed outbox events that satisfy retry backoff', async function run() {
    const { dispatchService, dataSource, transport, sentMessages } = createDispatchService()
    dataSource.outboxEvents.push(
      createOutboxEventRow({
        idempotency_key: 'retryable-failed',
        status: 'failed',
        dispatch_attempts: 1,
        last_dispatch_attempted_at: '2026-05-22T09:58:00.000Z',
        event_payload: { test: 'failed-retry' },
      }),
    )

    await dispatchService.dispatchPendingOutboxEvents(transport, 10)

    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0]).toEqual({ test: 'failed-retry' })
    expect(dataSource.outboxEvents[0]?.status).toBe('dispatched')
  })

  it('does not retry failed outbox events before backoff delay has elapsed', async function run() {
    const { dispatchService, dataSource, transport, sentMessages } = createDispatchService()
    dataSource.outboxEvents.push(
      createOutboxEventRow({
        idempotency_key: 'not-ready-failed',
        status: 'failed',
        dispatch_attempts: 2,
        last_dispatch_attempted_at: '2026-05-22T09:59:30.000Z',
      }),
    )

    await dispatchService.dispatchPendingOutboxEvents(transport, 10)

    expect(sentMessages).toHaveLength(0)
    expect(dataSource.outboxEvents[0]?.status).toBe('failed')
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

  it('enqueues due reminders in a bounded run and marks dispatched schedules in batch', async function run() {
    const { dispatchService, dataSource, transport, sentMessages } = createDispatchService()
    const firstInterviewId = '11111111-1111-4111-8111-111111111111'
    const secondInterviewId = '22222222-2222-4222-8222-222222222222'
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        id: 'schedule-1',
        interview_id: firstInterviewId,
        idempotency_key: 'reminder:interview-1',
        reminder_due_at: '2026-05-22T10:59:00.000Z',
      }),
      createReminderScheduleRow({
        id: 'schedule-2',
        interview_id: secondInterviewId,
        idempotency_key: 'reminder:interview-2',
        reminder_due_at: '2026-05-22T10:59:30.000Z',
      }),
      createReminderScheduleRow({
        id: 'schedule-3',
        interview_id: firstInterviewId,
        idempotency_key: 'reminder:interview-3',
        reminder_due_at: '2026-05-22T10:59:45.000Z',
      }),
    )
    dataSource.interviews.set(firstInterviewId, createInterviewState(firstInterviewId))
    dataSource.interviews.set(secondInterviewId, createInterviewState(secondInterviewId))

    await dispatchService.enqueueDueReminders(transport, '2026-05-22T11:00:00.000Z')

    expect(sentMessages).toHaveLength(2)
    expect(dataSource.reminderSchedules.find((schedule) => schedule.id === 'schedule-1')?.status).toBe(
      'dispatched',
    )
    expect(dataSource.reminderSchedules.find((schedule) => schedule.id === 'schedule-2')?.status).toBe(
      'dispatched',
    )
    expect(dataSource.reminderSchedules.find((schedule) => schedule.id === 'schedule-3')?.status).toBe('pending')
    expect(dataSource.listDueReminderSchedulesCalls).toEqual([
      {
        before: '2026-05-22T11:00:00.000Z',
        limit: 2,
      },
    ])
    expect(dataSource.getInterviewStatesCalls).toEqual([[firstInterviewId, secondInterviewId]])
    expect(dataSource.markReminderDispatchedBatchCalls).toEqual([['schedule-1', 'schedule-2']])
    expect(dataSource.getInterviewStateCalls).toHaveLength(0)
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
  listDueReminderSchedulesCalls: Array<{ before: string; limit: number }>
  getInterviewStateCalls: string[]
  getInterviewStatesCalls: string[][]
  markReminderDispatchedBatchCalls: string[][]
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
    listDueReminderSchedulesCalls: [],
    getInterviewStateCalls: [],
    getInterviewStatesCalls: [],
    markReminderDispatchedBatchCalls: [],
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
      return dataSource.outboxEvents
        .filter((event) => isOutboxEventReadyForDispatch(event, '2026-05-22T10:00:00.000Z'))
        .slice(0, limit)
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

    async listDueReminderSchedules(
      before: string,
      limit: number = Number.MAX_SAFE_INTEGER,
    ): Promise<NotificationReminderScheduleRow[]> {
      dataSource.listDueReminderSchedulesCalls.push({ before, limit })

      return dataSource.reminderSchedules
        .filter(
        (s) => s.status === 'pending' && s.reminder_due_at <= before,
      )
        .slice(0, limit)
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

    async markReminderDispatchedBatch(ids: string[]): Promise<void> {
      dataSource.markReminderDispatchedBatchCalls.push([...ids])
      for (const id of ids) {
        const schedule = dataSource.reminderSchedules.find((s) => s.id === id)
        if (schedule) {
          schedule.status = 'dispatched'
        }
      }
    },

    async getInterviewState(id: string): Promise<InterviewState | null> {
      dataSource.getInterviewStateCalls.push(id)
      return dataSource.interviews.get(id) ?? null
    },

    async getInterviewStates(ids: string[]): Promise<Map<string, InterviewState>> {
      dataSource.getInterviewStatesCalls.push([...ids])
      const entries = ids
        .map((id) => {
          const state = dataSource.interviews.get(id)
          return state ? ([id, state] as const) : null
        })
        .filter((entry): entry is readonly [string, InterviewState] => entry !== null)
      return new Map(entries)
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
    undefined,
    2,
  )

  return { dispatchService, dataSource, transport, sentMessages }
}

function isOutboxEventReadyForDispatch(event: NotificationOutboxEventRow, nowIso: string): boolean {
  if (event.status === 'pending') {
    return true
  }

  if (event.status !== 'failed') {
    return false
  }

  if (!event.last_dispatch_attempted_at) {
    return true
  }

  const now = new Date(nowIso).getTime()
  const lastAttemptedAt = new Date(event.last_dispatch_attempted_at).getTime()
  const backoffMs = Math.min(Math.max(event.dispatch_attempts, 1) * 30_000, 300_000)

  return now - lastAttemptedAt >= backoffMs
}

function createInterviewState(interviewId: string): InterviewState {
  return {
    id: interviewId,
    scheduler_id: 'scheduler-1',
    interviewer_id: null,
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-05-22T14:00:00.000Z',
    created_at: '2026-05-22T09:00:00.000Z',
    updated_at: '2026-05-22T09:00:00.000Z',
  }
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
