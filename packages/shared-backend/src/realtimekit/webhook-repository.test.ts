import { describe, expect, it, vi } from 'vitest'
import { RealtimeKitWebhookRepository } from './webhook-repository'
import type {
  RealtimeKitWebhookAcceptanceInput,
  RealtimeKitWebhookEventStatus,
  ResolvedRecordingJob,
} from './types'
import { createRecordingJob } from './test-utils'
import type { SqlQueryExecutor } from '../index'

function normalizeSql(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function createFakeExecutor(initial: {
  job?: ResolvedRecordingJob | null
  eventsByEventId?: Map<string, { status: RealtimeKitWebhookEventStatus }>
  eventsByRecordingId?: Map<string, Array<{ status: RealtimeKitWebhookEventStatus; received_at: string }>>
  forceConflictEventIds?: string[]
}): {
  executor: SqlQueryExecutor
  statements: string[]
  insertedEvents: RealtimeKitWebhookAcceptanceInput[]
  job: () => ResolvedRecordingJob | null
} {
  let job = initial.job ?? null
  const eventsByEventId = new Map(initial.eventsByEventId ?? new Map())
  const eventsByRecordingId = new Map(initial.eventsByRecordingId ?? new Map())
  const statements: string[] = []
  const insertedEvents: RealtimeKitWebhookAcceptanceInput[] = []

  const executor: SqlQueryExecutor = {
    async query<Row>(queryInput: { text: string; values: readonly unknown[] }) {
      const sql = normalizeSql(queryInput.text)
      statements.push(sql)
      const values = [...queryInput.values]

      if (sql === 'BEGIN;') {
        return { rows: [] as Row[] }
      }
      if (sql === 'COMMIT;') {
        return { rows: [] as Row[] }
      }
      if (sql === 'ROLLBACK;') {
        return { rows: [] as Row[] }
      }

      if (sql.includes('FROM interview_recordings') && sql.includes('provider_recording_id')) {
        return {
          rows: job ? ([job] as Row[]) : ([] as Row[]),
          rowCount: job ? 1 : 0,
        }
      }

      if (
        sql.includes('FROM realtimekit_webhook_events') &&
        sql.includes('provider_event_id = $1')
      ) {
        const existing = eventsByEventId.get(values[0] as string)
        return {
          rows: existing ? ([existing] as Row[]) : ([] as Row[]),
        }
      }

      if (
        sql.includes('FROM realtimekit_webhook_events') &&
        sql.includes('ORDER BY received_at DESC')
      ) {
        const list = eventsByRecordingId.get(values[0] as string) ?? []
        return { rows: list.slice(0, 1) as Row[] }
      }

      if (sql.includes('INSERT INTO realtimekit_webhook_events')) {
        const providerEventId = values[0] as string
        if (
          eventsByEventId.has(providerEventId) ||
          initial.forceConflictEventIds?.includes(providerEventId)
        ) {
          return { rows: [], rowCount: 0 }
        }
        const input: RealtimeKitWebhookAcceptanceInput = {
          provider_event_id: values[0] as string,
          event_type: values[1] as string,
          provider_recording_id: values[2] as string,
          provider_asset_id: (values[3] as string | null) ?? null,
          mapped_status: values[4] as RealtimeKitWebhookEventStatus,
          next_attempt_at: (values[5] as string | null) ?? null,
          received_at: values[6] as string,
          provider_status: job?.provider_status ?? 'UNKNOWN',
          last_error_code: (values[7] as string | null) ?? null,
        }
        insertedEvents.push(input)
        eventsByEventId.set(input.provider_event_id, { status: input.mapped_status })
        eventsByRecordingId.set(input.provider_recording_id, [
          { status: input.mapped_status, received_at: input.received_at },
        ])
        return {
          rows: [
            {
              provider_event_id: input.provider_event_id,
              event_type: input.event_type,
              recording_id: input.provider_recording_id,
              provider_asset_id: input.provider_asset_id,
              status: input.mapped_status,
              attempt_count: 0,
              next_attempt_at: input.next_attempt_at,
              received_at: input.received_at,
              processed_at: null,
              last_error_code: input.last_error_code,
            },
          ] as Row[],
          rowCount: 1,
        }
      }

      if (sql.includes('UPDATE interview_recordings') && sql.includes('provider_status')) {
        if (job) {
          job = {
            ...job,
            provider_status: values[1] as string,
          }
        }
        return {
          rows: job ? ([{ id: job.id }] as Row[]) : ([] as Row[]),
          rowCount: job ? 1 : 0,
        }
      }

      throw new Error(`Unexpected SQL in fake executor: ${sql}`)
    },
  }

  return { executor, statements, insertedEvents, job: () => job }
}

function buildAcceptanceInput(
  overrides: Partial<RealtimeKitWebhookAcceptanceInput> = {},
): RealtimeKitWebhookAcceptanceInput {
  return {
    provider_event_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    event_type: 'recording.statusUpdate',
    provider_recording_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    provider_asset_id: null,
    mapped_status: 'processed',
    provider_status: 'UPLOADED',
    next_attempt_at: null,
    received_at: '2026-08-17T12:00:00.000Z',
    last_error_code: null,
    ...overrides,
  }
}

describe('RealtimeKitWebhookRepository', function webhookRepositorySuite() {
  it('persists the webhook event and provider state in one transaction', async function run() {
    const fake = createFakeExecutor({ job: createRecordingJob() })
    const repository = new RealtimeKitWebhookRepository(fake.executor)

    const result = await repository.acceptWebhookEvent(buildAcceptanceInput())

    expect(result.outcome).toBe('recorded')
    expect(fake.insertedEvents).toHaveLength(1)
    expect(fake.insertedEvents[0].provider_event_id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    expect(fake.job()?.provider_status).toBe('UPLOADED')

    const sql = fake.statements.join('\n')
    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('INSERT INTO realtimekit_webhook_events')
    expect(sql).toContain('UPDATE interview_recordings')
    expect(sql).toContain('COMMIT;')
    expect(sql).not.toContain('ROLLBACK;')
  })

  it('returns duplicate when the provider event id already exists', async function run() {
    const fake = createFakeExecutor({
      job: createRecordingJob(),
      eventsByEventId: new Map([
        [
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          { status: 'processed' },
        ],
      ]),
    })
    const repository = new RealtimeKitWebhookRepository(fake.executor)

    const result = await repository.acceptWebhookEvent(buildAcceptanceInput())

    expect(result.outcome).toBe('duplicate')
    expect(fake.insertedEvents).toHaveLength(0)
    expect(fake.job()?.provider_status).toBe('UPLOADED')
    expect(fake.statements.join('\n')).toContain('COMMIT;')
  })

  it('returns duplicate when a concurrent delivery causes a unique conflict on insert', async function run() {
    const fake = createFakeExecutor({
      job: createRecordingJob(),
      forceConflictEventIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    })
    const repository = new RealtimeKitWebhookRepository(fake.executor)

    const result = await repository.acceptWebhookEvent(buildAcceptanceInput())

    expect(result.outcome).toBe('duplicate')
    expect(fake.insertedEvents).toHaveLength(0)
    expect(fake.statements.join('\n')).toContain('COMMIT;')
  })

  it('returns unknown_recording without side effects when no job row exists', async function run() {
    const fake = createFakeExecutor({ job: null })
    const repository = new RealtimeKitWebhookRepository(fake.executor)

    const result = await repository.acceptWebhookEvent(buildAcceptanceInput())

    expect(result.outcome).toBe('unknown_recording')
    expect(fake.insertedEvents).toHaveLength(0)
    expect(fake.statements.join('\n')).toContain('COMMIT;')
  })

  it('returns stale without side effects when the new status regresses the latest recorded status', async function run() {
    const fake = createFakeExecutor({
      job: createRecordingJob(),
      eventsByRecordingId: new Map([
        [
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          [{ status: 'processed', received_at: '2026-08-17T11:00:00.000Z' }],
        ],
      ]),
    })
    const repository = new RealtimeKitWebhookRepository(fake.executor)

    const result = await repository.acceptWebhookEvent(
      buildAcceptanceInput({
        provider_event_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        mapped_status: 'accepted',
        provider_status: 'RECORDING',
      }),
    )

    expect(result.outcome).toBe('stale')
    expect(fake.insertedEvents).toHaveLength(0)
    expect(fake.job()?.provider_status).toBe('UPLOADED')
  })

  it('allows forward progress after a stale lower-priority event', async function run() {
    const fake = createFakeExecutor({
      job: createRecordingJob({ provider_status: 'UPLOADING' }),
      eventsByRecordingId: new Map([
        [
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          [{ status: 'accepted', received_at: '2026-08-17T10:00:00.000Z' }],
        ],
      ]),
    })
    const repository = new RealtimeKitWebhookRepository(fake.executor)

    const result = await repository.acceptWebhookEvent(
      buildAcceptanceInput({ mapped_status: 'processed' }),
    )

    expect(result.outcome).toBe('recorded')
    expect(fake.insertedEvents).toHaveLength(1)
  })

  it('rolls back on unexpected query failure', async function run() {
    const failingExecutor: SqlQueryExecutor = {
      async query<Row>(queryInput: { text: string; values: readonly unknown[] }) {
        const sql = normalizeSql(queryInput.text)
        if (sql === 'BEGIN;') {
          return { rows: [] as Row[] }
        }
        throw new Error('connection lost')
      },
    }
    const rollbackSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const repository = new RealtimeKitWebhookRepository(failingExecutor)

    await expect(
      repository.acceptWebhookEvent(buildAcceptanceInput()),
    ).rejects.toThrow('connection lost')

    rollbackSpy.mockRestore()
  })
})
