import { describe, expect, it } from 'vitest'
import { NotificationService } from './notification-service'
import type {
  NotificationOutboxEventRow,
  NotificationReminderScheduleRow,
  InterviewState,
} from './notification-types'

describe('NotificationService', function notificationServiceSuite() {
  it('persists outbox events from lifecycle events', async function run() {
    const { service, dataSource } = createNotificationService()

    await service.persistOutboxEvent({
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
        booking_channel: 'ai_direct',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-05-22T14:00:00.000Z',
      },
      participants: {
        scheduler_user_id: 'scheduler-id',
        interviewer_user_id: null,
      },
    } as const)

    expect(dataSource.outboxEvents).toHaveLength(1)
    expect(dataSource.outboxEvents[0]?.idempotency_key).toBe('interview.created:interview-id')
    expect(dataSource.outboxEvents[0]?.status).toBe('pending')
  })

  it('fetches pending outbox events', async function run() {
    const { service, dataSource } = createNotificationService()
    dataSource.outboxEvents.push(
      createOutboxEventRow({ idempotency_key: 'pending-1', status: 'pending' }),
      createOutboxEventRow({ idempotency_key: 'dispatched-1', status: 'dispatched' }),
      createOutboxEventRow({ idempotency_key: 'pending-2', status: 'pending' }),
    )

    const events = await service.fetchPendingOutboxEvents(10)

    expect(events).toHaveLength(2)
    expect(events.map((e) => e.idempotency_key)).toContain('pending-1')
    expect(events.map((e) => e.idempotency_key)).toContain('pending-2')
  })

  it('fetches outbox event by idempotency key', async function run() {
    const { service, dataSource } = createNotificationService()
    dataSource.outboxEvents.push(createOutboxEventRow({ idempotency_key: 'target-key' }))

    const event = await service.fetchOutboxEventByIdempotencyKey('target-key')

    expect(event).not.toBeNull()
    expect(event?.idempotency_key).toBe('target-key')
  })

  it('marks outbox events as dispatched', async function run() {
    const { service, dataSource } = createNotificationService()
    dataSource.outboxEvents.push(createOutboxEventRow({ idempotency_key: 'target-key' }))

    await service.markOutboxEventDispatched('target-key')

    expect(dataSource.outboxEvents[0]?.status).toBe('dispatched')
  })

  it('records dispatch failures with attempt increment', async function run() {
    const { service, dataSource } = createNotificationService()
    dataSource.outboxEvents.push(
      createOutboxEventRow({ idempotency_key: 'target-key', dispatch_attempts: 2 }),
    )

    await service.recordDispatchFailure('target-key')

    expect(dataSource.outboxEvents[0]?.dispatch_attempts).toBe(3)
    expect(dataSource.outboxEvents[0]?.status).toBe('failed')
  })

  it('records and checks processing checkpoints', async function run() {
    const { service } = createNotificationService()

    expect(await service.hasCheckpoint('root-key', 'side-effect')).toBe(false)

    await service.recordCheckpoint('root-key', 'side-effect')

    expect(await service.hasCheckpoint('root-key', 'side-effect')).toBe(true)
  })

  it('creates reminder schedules', async function run() {
    const { service, dataSource } = createNotificationService()

    await service.createReminderSchedule({
      interviewId: 'interview-id',
      idempotencyKey: 'root-key',
      reminderDueAt: '2026-05-22T13:30:00.000Z',
    })

    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.interview_id).toBe('interview-id')
    expect(dataSource.reminderSchedules[0]?.status).toBe('pending')
  })

  it('lists due reminder schedules', async function run() {
    const { service, dataSource } = createNotificationService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        id: 'due-1',
        reminder_due_at: '2026-05-22T12:00:00.000Z',
        status: 'pending',
      }),
      createReminderScheduleRow({
        id: 'future-1',
        reminder_due_at: '2026-05-22T15:00:00.000Z',
        status: 'pending',
      }),
      createReminderScheduleRow({
        id: 'suppressed-1',
        reminder_due_at: '2026-05-22T11:00:00.000Z',
        status: 'suppressed',
      }),
    )

    const due = await service.listDueReminderSchedules('2026-05-22T13:00:00.000Z')

    expect(due).toHaveLength(1)
    expect(due[0]?.id).toBe('due-1')
  })

  it('suppresses pending reminder schedules for an interview', async function run() {
    const { service, dataSource } = createNotificationService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        id: 'schedule-1',
        interview_id: 'interview-id',
        status: 'pending',
      }),
      createReminderScheduleRow({
        id: 'schedule-2',
        interview_id: 'interview-id',
        status: 'pending',
      }),
      createReminderScheduleRow({
        id: 'schedule-3',
        interview_id: 'other-id',
        status: 'pending',
      }),
    )

    const count = await service.suppressReminderSchedulesForInterview('interview-id')

    expect(count).toBe(2)
    expect(
      dataSource.reminderSchedules
        .filter((s) => s.interview_id === 'interview-id')
        .every((s) => s.status === 'suppressed'),
    ).toBe(true)
    expect(
      dataSource.reminderSchedules.find((s) => s.id === 'schedule-3')?.status,
    ).toBe('pending')
  })

  it('marks reminder schedules as dispatched', async function run() {
    const { service, dataSource } = createNotificationService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({ id: 'schedule-1', status: 'pending' }),
    )

    await service.markReminderDispatched('schedule-1')

    expect(dataSource.reminderSchedules[0]?.status).toBe('dispatched')
  })

  it('reads interview state for send-time guards', async function run() {
    const { service, dataSource } = createNotificationService()
    dataSource.interviews.set('interview-id', {
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
    })

    const state = await service.getInterviewState('interview-id')

    expect(state).not.toBeNull()
    expect(state?.status).toBe('scheduled')
    expect(state?.scheduled_at).toBe('2026-05-22T14:00:00.000Z')
  })

  it('reads interview states in batch for send-time guards', async function run() {
    const { service, dataSource } = createNotificationService()
    dataSource.interviews.set('interview-1', {
      id: 'interview-1',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    const states = await service.getInterviewStates(['interview-1', 'interview-2'])

    expect(states.get('interview-1')?.status).toBe('scheduled')
    expect(states.has('interview-2')).toBe(false)
  })

  it('returns null for missing interview state', async function run() {
    const { service } = createNotificationService()

    const state = await service.getInterviewState('missing-id')

    expect(state).toBeNull()
  })

  it('marks reminder schedules as dispatched in batch', async function run() {
    const { service, dataSource } = createNotificationService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({ id: 'schedule-1', status: 'pending' }),
      createReminderScheduleRow({ id: 'schedule-2', status: 'pending' }),
    )

    await service.markReminderDispatchedBatch(['schedule-1', 'schedule-2'])

    expect(dataSource.reminderSchedules[0]?.status).toBe('dispatched')
    expect(dataSource.reminderSchedules[1]?.status).toBe('dispatched')
  })
})

type InMemoryNotificationDataSource = {
  outboxEvents: NotificationOutboxEventRow[]
  checkpoints: Array<{ idempotency_key: string; checkpoint_key: string }>
  reminderSchedules: NotificationReminderScheduleRow[]
  interviews: Map<string, InterviewState>
}

function createNotificationService(): {
  service: NotificationService
  dataSource: InMemoryNotificationDataSource
} {
  const dataSource: InMemoryNotificationDataSource = {
    outboxEvents: [],
    checkpoints: [],
    reminderSchedules: [],
    interviews: new Map(),
  }

  const repository = {
    async persistOutboxEvent(event: NotificationOutboxEventRow): Promise<void> {
      const existing = dataSource.outboxEvents.find(
        (e) => e.idempotency_key === event.idempotency_key,
      )
      if (!existing) {
        dataSource.outboxEvents.push({ ...event })
      }
    },

    async fetchPendingOutboxEvents(limit: number): Promise<NotificationOutboxEventRow[]> {
      return dataSource.outboxEvents
        .filter((e) => e.status === 'pending')
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

    async listDueReminderSchedules(
      before: string,
      limit: number = Number.MAX_SAFE_INTEGER,
    ): Promise<NotificationReminderScheduleRow[]> {
      return dataSource.reminderSchedules.filter(
        (s) => s.status === 'pending' && s.reminder_due_at <= before,
      ).slice(0, limit)
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

    async markReminderDispatched(id: string): Promise<void> {
      const schedule = dataSource.reminderSchedules.find((s) => s.id === id)
      if (schedule) {
        schedule.status = 'dispatched'
      }
    },

    async getInterviewState(id: string): Promise<InterviewState | null> {
      return dataSource.interviews.get(id) ?? null
    },

    async getInterviewStates(ids: string[]): Promise<Map<string, InterviewState>> {
      const entries = ids
        .map((id) => {
          const state = dataSource.interviews.get(id)
          return state ? ([id, state] as const) : null
        })
        .filter((entry): entry is readonly [string, InterviewState] => entry !== null)
      return new Map(entries)
    },

    async markReminderDispatchedBatch(ids: string[]): Promise<void> {
      for (const id of ids) {
        const schedule = dataSource.reminderSchedules.find((s) => s.id === id)
        if (schedule) {
          schedule.status = 'dispatched'
        }
      }
    },
  }

  const service = new NotificationService(
    repository as unknown as import('./notification-repository').NotificationRepository,
    () => 'schedule-id',
    () => '2026-05-22T10:00:00.000Z',
  )

  return { service, dataSource }
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
