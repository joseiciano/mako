import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { resolveLocalTestDatabaseUrl } from '../database/test-database-url'
import type { QueryResult, SqlQuery, SqlQueryExecutor } from '../index'
import { RecordingStopRepository, type SweepRetryWindow } from './recording-stop-repository'
import { RecordingStopService, SWEEP_FAST_ATTEMPTS } from './recording-stop-service'
import { RealtimeRecordingError, type RealtimeRecordingProvider } from './realtime-recording-provider'

describe('recording stop sweeps against postgres', function sweepSuite() {
  const schema = `recording_stop_sweep_test_${process.pid}`
  const retry: SweepRetryWindow = {
    fast_attempts: SWEEP_FAST_ATTEMPTS,
    slow_retry_before: '2026-01-01T00:00:00Z',
    created_after: '2025-01-01T00:00:00Z',
  }
  let client: Client
  let repository: RecordingStopRepository

  beforeAll(async function connect() {
    client = new Client({ connectionString: resolveLocalTestDatabaseUrl() })
    await client.connect()
    // Throwaway schema with FK-free copies of the two tables; the shared schema is untouched.
    await client.query(`CREATE SCHEMA ${schema}`)
    await client.query(`SET search_path TO ${schema}`)
    for (const table of ['interview_recordings', 'interview_recording_stop_handoffs']) {
      await client.query(
        `CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING DEFAULTS)`,
      )
    }
    const executor: SqlQueryExecutor = {
      async query<Row>(query: SqlQuery): Promise<QueryResult<Row>> {
        const result = await client.query(query.text, [...query.values])
        return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 }
      },
    }
    repository = new RecordingStopRepository(executor)
  })

  afterAll(async function disconnect() {
    await client.query(`DROP SCHEMA ${schema} CASCADE`)
    await client.end()
  })

  beforeEach(async function clean() {
    await client.query('TRUNCATE interview_recording_stop_handoffs, interview_recordings')
  })

  async function insertHandoff(createdAt: string, processedAt: string | null = null) {
    const id = randomUUID()
    await client.query(
      `INSERT INTO interview_recording_stop_handoffs (interview_id, created_at, updated_at, processed_at)
       VALUES ($1, $2, $2, $3)`,
      [id, createdAt, processedAt],
    )
    return id
  }

  async function insertRecording(createdAt: string) {
    const id = randomUUID()
    await client.query(
      `INSERT INTO interview_recordings
         (id, interview_id, provider_recording_id, recording_type, created_at, updated_at)
       VALUES ($1, $2, $3, 'composite', $4, $4)`,
      [id, randomUUID(), `prov-${id}`, createdAt],
    )
    return id
  }

  it('orders handoffs by least recently attempted so failing rows do not starve newer ones', async function run() {
    const old = await insertHandoff('2026-01-01T00:00:00Z')
    const fresh = await insertHandoff('2026-01-02T00:00:00Z')
    await repository.recordHandoffFailure(old, 'provider_unavailable', '2026-01-03T00:00:00Z')

    const ids = await repository.listUnprocessedHandoffInterviewIds({
      older_than: '2026-02-01T00:00:00Z',
      limit: 1,
      retry,
    })
    expect(ids).toEqual([fresh])
  })

  it('handoffs past the fast attempts retry only after the slow cutoff and are abandoned after the give-up cutoff', async function run() {
    const id = await insertHandoff('2026-01-01T00:00:00Z')
    for (let i = 0; i < 3; i += 1) {
      await repository.recordHandoffFailure(id, 'provider_unavailable', '2026-01-03T00:00:00Z')
    }
    const query = { older_than: '2026-02-01T00:00:00Z', limit: 10 }
    const window = { ...retry, fast_attempts: 3 }
    expect(
      await repository.listUnprocessedHandoffInterviewIds({
        ...query,
        retry: { ...window, slow_retry_before: '2026-01-03T00:00:00Z' },
      }),
    ).toEqual([])
    expect(
      await repository.listUnprocessedHandoffInterviewIds({
        ...query,
        retry: { ...window, slow_retry_before: '2026-01-03T00:30:00Z' },
      }),
    ).toEqual([id])
    expect(
      await repository.listUnprocessedHandoffInterviewIds({
        ...query,
        retry: { ...window, slow_retry_before: '2026-01-03T00:30:00Z', created_after: '2026-01-02T00:00:00Z' },
      }),
    ).toEqual([])
  })

  it('overdue recordings: failing rows rotate behind never-attempted ones and slow down after the fast attempts', async function run() {
    const failing = await insertRecording('2026-01-01T00:00:00Z')
    const other = await insertRecording('2026-01-02T00:00:00Z')
    const query = { created_before: '2026-02-01T00:00:00Z', limit: 1 }
    const window = { ...retry, fast_attempts: 2, slow_retry_before: '2026-01-04T00:00:00Z' }

    expect((await repository.listOverdueRecordings({ ...query, retry: window }))[0]?.id).toBe(failing)
    await repository.recordStopFailure(failing, 'provider_unavailable', '2026-01-03T00:00:00Z')
    expect((await repository.listOverdueRecordings({ ...query, retry: window }))[0]?.id).toBe(other)

    await repository.recordStopFailure(failing, 'provider_unavailable', '2026-01-04T00:00:00Z')
    const slow = { ...window, slow_retry_before: '2026-01-04T00:00:00Z' }
    expect((await repository.listOverdueRecordings({ ...query, limit: 10, retry: slow })).map((r) => r.id)).toEqual([
      other,
    ])
    const later = { ...window, slow_retry_before: '2026-01-04T00:30:00Z' }
    expect((await repository.listOverdueRecordings({ ...query, limit: 10, retry: later })).map((r) => r.id)).toEqual([
      other,
      failing,
    ])
  })

  it('lists handoffs without feedback_triggered_at: processed ones after processed_before, unprocessed ones only after unprocessed_before', async function run() {
    const awaiting = await insertHandoff('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z')
    const stuck = await insertHandoff('2026-01-01T00:00:00Z')
    const recentStuck = await insertHandoff('2026-01-31T23:50:00Z')
    const done = await insertHandoff('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z')
    await repository.markFeedbackTriggered(done, '2026-01-01T00:02:00Z')

    const query = {
      processed_before: '2026-02-01T00:00:00Z',
      unprocessed_before: '2026-01-31T23:45:00Z',
      limit: 10,
      retry,
    }
    expect((await repository.listHandoffsAwaitingFeedback(query)).sort()).toEqual([awaiting, stuck].sort())
    expect(await repository.listHandoffsAwaitingFeedback({ ...query, unprocessed_before: '2026-02-01T00:00:00Z' }))
      .toContain(recentStuck)

    await repository.markFeedbackTriggered(awaiting, '2026-01-01T00:03:00Z')
    await repository.markFeedbackTriggered(stuck, '2026-01-01T00:03:00Z')
    expect(await repository.listHandoffsAwaitingFeedback(query)).toEqual([])
  })

  it('provider down: a never-processed handoff with failing stop attempts still surfaces for feedback', async function run() {
    const id = await insertHandoff('2026-03-01T00:00:00Z')
    for (let i = 0; i < 3; i += 1) {
      await repository.recordHandoffFailure(id, 'provider_unavailable', '2026-03-01T00:10:00Z')
    }
    const service = new RecordingStopService(repository, {} as RealtimeRecordingProvider, () => '2026-03-01T00:20:00.000Z')

    expect(
      await service.listHandoffsAwaitingFeedback({
        processedBefore: '2026-03-01T00:18:00.000Z',
        unprocessedBefore: '2026-02-28T23:45:00.000Z',
        limit: 10,
      }),
    ).toEqual([])
    expect(
      await service.listHandoffsAwaitingFeedback({
        processedBefore: '2026-03-01T00:18:00.000Z',
        unprocessedBefore: '2026-03-01T00:05:00.000Z',
        limit: 10,
      }),
    ).toEqual([id])
  })

  it('end to end: overdue sweep records failure then recovers once the provider answers', async function run() {
    const id = await insertRecording('2026-02-28T12:00:00Z')
    let failing = true
    const provider = {
      async stopRecording() {
        if (failing) throw new RealtimeRecordingError('provider_unavailable', true, 'down')
      },
    } as unknown as RealtimeRecordingProvider
    const service = new RecordingStopService(repository, provider, () => '2026-03-01T00:00:00.000Z')

    expect(await service.sweepOverdueRecordings({ maxAgeSeconds: 3600, limit: 5 })).toBe(0)
    failing = false
    expect(await service.sweepOverdueRecordings({ maxAgeSeconds: 3600, limit: 5 })).toBe(1)

    const row = await client.query(
      'SELECT stop_attempt_count, stop_last_error_code, stop_confirmed_at FROM interview_recordings WHERE id = $1',
      [id],
    )
    expect(row.rows[0]).toMatchObject({ stop_attempt_count: 1, stop_last_error_code: 'provider_unavailable' })
    expect(row.rows[0].stop_confirmed_at).not.toBeNull()
  })
})
