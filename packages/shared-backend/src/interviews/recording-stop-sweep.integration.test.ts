import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { resolveLocalTestDatabaseUrl } from '../database/test-database-url'
import type { QueryResult, SqlQuery, SqlQueryExecutor } from '../index'
import { RecordingStopRepository } from './recording-stop-repository'
import { MAX_SWEEP_ATTEMPTS, RecordingStopService } from './recording-stop-service'
import { RealtimeRecordingError, type RealtimeRecordingProvider } from './realtime-recording-provider'

describe('recording stop sweeps against postgres', function sweepSuite() {
  let client: Client
  let repository: RecordingStopRepository

  beforeAll(async function connect() {
    client = new Client({ connectionString: resolveLocalTestDatabaseUrl() })
    await client.connect()
    // Parent rows (interviews, users) are out of scope here; skip FK checks for this session.
    await client.query("SET session_replication_role = 'replica'")
    const executor: SqlQueryExecutor = {
      async query<Row>(query: SqlQuery): Promise<QueryResult<Row>> {
        const result = await client.query(query.text, [...query.values])
        return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 }
      },
    }
    repository = new RecordingStopRepository(executor)
  })

  afterAll(async function disconnect() {
    await client.end()
  })

  beforeEach(async function clean() {
    await client.query('DELETE FROM interview_recording_stop_handoffs')
    await client.query('DELETE FROM interview_recordings')
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
      max_attempts: MAX_SWEEP_ATTEMPTS,
    })
    expect(ids).toEqual([fresh])
  })

  it('stops listing a handoff after max attempts', async function run() {
    const id = await insertHandoff('2026-01-01T00:00:00Z')
    let attempts = 0
    for (let i = 0; i < 3; i += 1) {
      attempts = await repository.recordHandoffFailure(id, 'provider_unavailable', '2026-01-03T00:00:00Z')
    }
    expect(attempts).toBe(3)
    const query = { older_than: '2026-02-01T00:00:00Z', limit: 10 }
    expect(await repository.listUnprocessedHandoffInterviewIds({ ...query, max_attempts: 4 })).toEqual([id])
    expect(await repository.listUnprocessedHandoffInterviewIds({ ...query, max_attempts: 3 })).toEqual([])
  })

  it('overdue recordings: failing rows rotate behind never-attempted ones and drop out after max attempts', async function run() {
    const failing = await insertRecording('2026-01-01T00:00:00Z')
    const other = await insertRecording('2026-01-02T00:00:00Z')
    const query = { created_before: '2026-02-01T00:00:00Z', limit: 1 }

    expect((await repository.listOverdueRecordings({ ...query, max_attempts: 2 }))[0]?.id).toBe(failing)
    await repository.recordStopFailure(failing, 'provider_unavailable', '2026-01-03T00:00:00Z')
    expect((await repository.listOverdueRecordings({ ...query, max_attempts: 2 }))[0]?.id).toBe(other)

    await repository.recordStopFailure(failing, 'provider_unavailable', '2026-01-04T00:00:00Z')
    const all = await repository.listOverdueRecordings({ ...query, limit: 10, max_attempts: 2 })
    expect(all.map((r) => r.id)).toEqual([other])
  })

  it('lists processed handoffs without feedback_triggered_at until marked, ignoring unprocessed ones', async function run() {
    const awaiting = await insertHandoff('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z')
    await insertHandoff('2026-01-01T00:00:00Z')
    const done = await insertHandoff('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z')
    await repository.markFeedbackTriggered(done, '2026-01-01T00:02:00Z')

    const query = { processed_before: '2026-02-01T00:00:00Z', limit: 10, max_attempts: 3 }
    expect(await repository.listHandoffsAwaitingFeedback(query)).toEqual([awaiting])

    await repository.markFeedbackTriggered(awaiting, '2026-01-01T00:03:00Z')
    expect(await repository.listHandoffsAwaitingFeedback(query)).toEqual([])
  })

  it('end to end: overdue sweep records failure then recovers once the provider answers', async function run() {
    const id = await insertRecording('2026-01-01T00:00:00Z')
    let failing = true
    const provider = {
      async stopRecording() {
        if (failing) throw new RealtimeRecordingError('provider_unavailable', true, 'down')
      },
    } as unknown as RealtimeRecordingProvider
    const service = new RecordingStopService(repository, provider, () => '2026-03-01T00:00:00.000Z')

    expect(await service.sweepOverdueRecordings({ maxAgeSeconds: 3300, limit: 5 })).toBe(0)
    failing = false
    expect(await service.sweepOverdueRecordings({ maxAgeSeconds: 3300, limit: 5 })).toBe(1)

    const row = await client.query(
      'SELECT stop_attempt_count, stop_last_error_code, stop_confirmed_at FROM interview_recordings WHERE id = $1',
      [id],
    )
    expect(row.rows[0]).toMatchObject({ stop_attempt_count: 1, stop_last_error_code: 'provider_unavailable' })
    expect(row.rows[0].stop_confirmed_at).not.toBeNull()
  })
})
