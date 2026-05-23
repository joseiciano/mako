import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import type { SqlQueryExecutor } from '../interviews/interview-repository'
import { NotificationRepository } from './notification-repository'
import type {
  InterviewState,
  NotificationOutboxEventRow,
  NotificationReminderScheduleRow,
} from './notification-types'

describe('NotificationRepository', function notificationRepositorySuite() {
  it('persists outbox events with upsert semantics', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)
          return { rows: [] }
        },
      }),
    })

    await repository.persistOutboxEvent(createOutboxEventRow())

    expect(executedQueries).toHaveLength(1)
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain(
      'INSERT INTO notification_outbox_events',
    )
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain(
      'ON CONFLICT (idempotency_key) DO NOTHING',
    )
  })

  it('fetches pending outbox events prioritizing pending before failed retries', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)
          return {
            rows: [
              createOutboxEventRow({ idempotency_key: 'event-1' }),
              createOutboxEventRow({ idempotency_key: 'event-2' }),
            ],
          }
        },
      }),
    })

    const events = await repository.fetchPendingOutboxEvents(10)

    expect(events).toHaveLength(2)
    expect(events[0]?.idempotency_key).toBe('event-1')
    expect(events[1]?.idempotency_key).toBe('event-2')
    const sql = normalizeSql(executedQueries[0]?.text ?? '')
    expect(sql).toContain("status = 'pending' OR status = 'failed'")
    expect(sql).toContain("ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END ASC, created_at ASC")
  })

  it('fetches a single outbox event by idempotency key', async function run() {
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery() {
          return {
            rows: [createOutboxEventRow({ idempotency_key: 'target-key' })],
          }
        },
      }),
    })

    const event = await repository.fetchOutboxEventByIdempotencyKey('target-key')

    expect(event).not.toBeNull()
    expect(event?.idempotency_key).toBe('target-key')
  })

  it('returns null when outbox event is not found', async function run() {
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery() {
          return { rows: [] }
        },
      }),
    })

    const event = await repository.fetchOutboxEventByIdempotencyKey('missing-key')

    expect(event).toBeNull()
  })

  it('marks outbox events as dispatched', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)
          return { rows: [] }
        },
      }),
    })

    await repository.markOutboxEventDispatched('event-key')

    expect(executedQueries).toHaveLength(1)
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain("status = 'dispatched'")
  })

  it('records dispatch failures with attempt increment', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)
          return { rows: [] }
        },
      }),
    })

    await repository.recordDispatchFailure('event-key')

    expect(executedQueries).toHaveLength(1)
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain(
      "dispatch_attempts = dispatch_attempts + 1",
    )
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain("status = 'failed'")
  })

  it('records processing checkpoints with conflict ignore', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)
          return { rows: [] }
        },
      }),
    })

    await repository.recordCheckpoint('root-key', 'side-effect-key')

    expect(executedQueries).toHaveLength(1)
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain(
      'INSERT INTO notification_processing_checkpoints',
    )
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain(
      'ON CONFLICT (idempotency_key, checkpoint_key) DO NOTHING',
    )
  })

  it('checks for existing checkpoints', async function run() {
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery() {
          return { rows: [{ exists: true }] }
        },
      }),
    })

    const hasCheckpoint = await repository.hasCheckpoint('root-key', 'side-effect-key')

    expect(hasCheckpoint).toBe(true)
  })

  it('creates reminder schedules with conflict ignore', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)
          return { rows: [] }
        },
      }),
    })

    await repository.createReminderSchedule(createReminderScheduleRow())

    expect(executedQueries).toHaveLength(1)
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain(
      'INSERT INTO notification_reminder_schedules',
    )
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain('ON CONFLICT DO NOTHING')
  })

  it('lists due reminder schedules filtered by pending status', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)
          return {
            rows: [
              createReminderScheduleRow({ id: 'schedule-1' }),
              createReminderScheduleRow({ id: 'schedule-2' }),
            ],
          }
        },
      }),
    })

    const schedules = await repository.listDueReminderSchedules('2026-05-22T12:00:00.000Z', 25)

    expect(schedules).toHaveLength(2)
    expect(schedules[0]?.id).toBe('schedule-1')
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain('LIMIT $2')
    expect(executedQueries[0]?.values).toEqual(['2026-05-22T12:00:00.000Z', 25])
  })

  it('fetches interview states in batch by ids', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)
          return {
            rows: [
              {
                id: 'interview-1',
                scheduler_id: 'scheduler-1',
                interviewer_id: null,
                type: 'system_design',
                mode: 'ai_led',
                tier: 'standard',
                status: 'scheduled',
                scheduled_at: '2026-05-22T14:00:00.000Z',
                created_at: '2026-05-22T10:00:00.000Z',
                updated_at: '2026-05-22T10:00:00.000Z',
              },
            ],
          }
        },
      }),
    })

    const states = await repository.getInterviewStates(['interview-1', 'interview-2'])

    expect(states.get('interview-1')?.status).toBe('scheduled')
    expect(states.has('interview-2')).toBe(false)
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain('WHERE id = ANY($1)')
    expect(executedQueries[0]?.values).toEqual([['interview-1', 'interview-2']])
  })

  it('marks reminder schedules as dispatched in batch', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)
          return { rows: [] }
        },
      }),
    })

    await repository.markReminderDispatchedBatch(['schedule-1', 'schedule-2'])

    expect(executedQueries).toHaveLength(1)
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain('WHERE id = ANY($1)')
    expect(executedQueries[0]?.values).toEqual([['schedule-1', 'schedule-2']])
  })

  it('suppresses pending reminder schedules for an interview', async function run() {
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery() {
          return { rows: [{ count: 1 }] }
        },
      }),
    })

    const count = await repository.suppressReminderSchedulesForInterview('interview-id')

    expect(count).toBe(1)
  })

  it('marks reminder schedules as dispatched', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)
          return { rows: [] }
        },
      }),
    })

    await repository.markReminderDispatched('schedule-id')

    expect(executedQueries).toHaveLength(1)
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain("status = 'dispatched'")
  })

  it('reads interview state by id', async function run() {
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery() {
          return {
            rows: [
              {
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
              },
            ],
          }
        },
      }),
    })

    const interview = await repository.getInterviewState('interview-id')

    expect(interview).not.toBeNull()
    expect(interview?.status).toBe('scheduled')
    expect(interview?.scheduled_at).toBe('2026-05-22T14:00:00.000Z')
  })

  it('returns null when interview is not found', async function run() {
    const repository = new NotificationRepository({
      queryExecutor: createQueryExecutor({
        onQuery() {
          return { rows: [] }
        },
      }),
    })

    const interview = await repository.getInterviewState('missing-id')

    expect(interview).toBeNull()
  })
})

function createQueryExecutor(options: {
  onQuery: (queryInput: SqlQuery) => { rows: unknown[] }
}): SqlQueryExecutor {
  return {
    async query<Row>(queryInput: SqlQuery) {
      const result = options.onQuery(queryInput)
      return {
        rows: result.rows as Row[],
      }
    },
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

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
