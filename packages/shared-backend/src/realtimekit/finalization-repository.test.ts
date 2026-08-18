import { describe, expect, it, vi } from 'vitest'
import { RecordingFinalizationRepository } from './finalization-repository'
import type {
  ExistingArtifactRow,
  RecordingFinalizationRepositoryDataSource,
  RequiredRecordingArtifact,
  RecordingJobWithInterview,
  SweepCandidateRow,
} from './finalization-repository'
import type { SqlQueryExecutor } from '../index'
import { createRecordingJob } from './test-utils'

function normalizeSql(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

type FakeOptions = {
  jobWithInterview?: RecordingJobWithInterview | null
  artifactByProviderAssetId?: ExistingArtifactRow | null
  aggregateReadiness?: RequiredRecordingArtifact[]
  sweepCandidates?: SweepCandidateRow[]
  insertRowCount?: number
}

function createFakeExecutor(options: FakeOptions = {}): {
  executor: SqlQueryExecutor
  statements: string[]
} {
  const statements: string[] = []

  const executor: SqlQueryExecutor = {
    async query<Row>(queryInput: { text: string; values: readonly unknown[] }) {
      const sql = normalizeSql(queryInput.text)
      statements.push(sql)
      const values = [...queryInput.values]

      if (sql === 'BEGIN;' || sql === 'COMMIT;' || sql === 'ROLLBACK;') {
        return { rows: [] as Row[] }
      }

      if (sql.includes('FROM interview_recordings') && sql.includes('JOIN interviews')) {
        return {
          rows: options.jobWithInterview
            ? ([options.jobWithInterview] as Row[])
            : ([] as Row[]),
          rowCount: options.jobWithInterview ? 1 : 0,
        }
      }

      if (
        sql.includes('UPDATE interview_recordings') &&
        sql.includes("finalization_status = 'processing'")
      ) {
        const rowCount = options.jobWithInterview ? 1 : 0
        return {
          rows: rowCount ? ([{ id: options.jobWithInterview!.job.id }] as Row[]) : ([] as Row[]),
          rowCount,
        }
      }

      if (
        sql.includes('UPDATE interview_recordings') &&
        sql.includes("finalization_status = 'pending'")
      ) {
        return { rows: [{ id: 'job-id' }] as Row[], rowCount: 1 }
      }

      if (sql.includes('FROM interview_artifacts') && sql.includes('provider_asset_id = $1')) {
        return {
          rows: options.artifactByProviderAssetId
            ? ([options.artifactByProviderAssetId] as Row[])
            : ([] as Row[]),
        }
      }

      if (sql.includes('INSERT INTO interview_artifacts')) {
        const rowCount = options.insertRowCount ?? 1
        return {
          rows: rowCount ? [{ id: values[0], object_key: values[5] }] as Row[] : ([] as Row[]),
          rowCount,
        }
      }

      if (
        sql.includes('UPDATE interview_recordings') &&
        sql.includes("finalization_status = 'finalized'")
      ) {
        return { rows: [{ id: 'job-id' }] as Row[], rowCount: 1 }
      }

      if (
        sql.includes('UPDATE interview_recordings') &&
        sql.includes("finalization_status = 'failed'")
      ) {
        return { rows: [{ id: 'job-id' }] as Row[], rowCount: 1 }
      }

      if (sql.includes('UPDATE realtimekit_webhook_events') && sql.includes("status = 'processed'")) {
        return { rows: [] as Row[] }
      }

      if (sql.includes('UPDATE realtimekit_webhook_events') && sql.includes('next_attempt_at = $2')) {
        return { rows: [] as Row[] }
      }

      if (sql.includes('UPDATE realtimekit_webhook_events') && sql.includes("status = 'failed'")) {
        return { rows: [] as Row[] }
      }

      if (sql.includes('FROM interview_recordings') && sql.includes('FROM interview_artifacts')) {
        return { rows: (options.aggregateReadiness ?? []) as Row[] }
      }

      if (sql.includes('UPDATE interviews') && sql.includes("recording_status = 'ready'")) {
        return { rows: [{ id: 'interview-id' }] as Row[], rowCount: 1 }
      }

      if (sql.includes('FROM realtimekit_webhook_events') && sql.includes('ORDER BY next_attempt_at')) {
        return { rows: (options.sweepCandidates ?? []) as Row[] }
      }

      if (sql.includes('UPDATE realtimekit_webhook_events') && sql.includes('attempt_count')) {
        return { rows: [] as Row[] }
      }

      throw new Error(`Unexpected SQL in fake executor: ${sql}`)
    },
  }

  return { executor, statements }
}

const JOB_WITH_INTERVIEW: RecordingJobWithInterview = {
  job: createRecordingJob(),
  interview: {
    id: '22222222-2222-4222-8222-222222222222',
    mode: 'ai_led',
    scheduler_id: '33333333-3333-4333-8333-333333333333',
    interviewer_id: null,
    recording_status: 'processing',
  },
}

function createFakeDataSource(
  overrides: Partial<RecordingFinalizationRepositoryDataSource> = {},
): RecordingFinalizationRepositoryDataSource {
  return {
    getJobWithInterview: vi.fn(),
    claimJob: vi.fn(),
    releaseClaim: vi.fn(),
    getArtifactByProviderAssetId: vi.fn(),
    insertArtifact: vi.fn(),
    finalizeJob: vi.fn(),
    failJob: vi.fn(),
    markEventProcessed: vi.fn(),
    markEventAwaiting: vi.fn(),
    markEventFailed: vi.fn(),
    getAggregateReadiness: vi.fn(),
    setInterviewRecordingReady: vi.fn(),
    listSweepCandidates: vi.fn(),
    updateSweepCheckpoint: vi.fn(),
    withTransaction: vi.fn(async function withTransaction<T>(
      callback: () => Promise<T>,
    ): Promise<T> {
      return callback()
    }) as RecordingFinalizationRepositoryDataSource['withTransaction'],
    ...overrides,
  }
}

describe('RecordingFinalizationRepository', function finalizationRepositorySuite() {
  it('loads a recording job with its owning interview by provider recording id', async function run() {
    const fake = createFakeExecutor({ jobWithInterview: JOB_WITH_INTERVIEW })
    const repository = new RecordingFinalizationRepository(fake.executor)

    const loaded = await repository.getJobWithInterview(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    )

    expect(loaded).toEqual(JOB_WITH_INTERVIEW)
    expect(fake.statements[0]).toContain('FROM interview_recordings r')
    expect(fake.statements[0]).toContain('JOIN interviews i')
    expect(fake.statements[0]).toContain('provider_recording_id = $1')
  })

  it('claims a job by moving it to processing unless already claimed or finalized', async function run() {
    const fake = createFakeExecutor({ jobWithInterview: JOB_WITH_INTERVIEW })
    const repository = new RecordingFinalizationRepository(fake.executor)

    const claimed = await repository.claimJob(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-08-17T12:00:00.000Z',
    )

    expect(claimed).toBe(true)
    expect(fake.statements[0]).toContain("finalization_status = 'processing'")
    expect(fake.statements[0]).toContain("finalization_status IN ('pending', 'failed')")
    expect(fake.statements[0]).not.toContain("finalization_status <> 'finalized'")
  })

  it('claims a job previously failed so the scheduled retry can recover', async function run() {
    const fake = createFakeExecutor({
      jobWithInterview: {
        ...JOB_WITH_INTERVIEW,
        job: createRecordingJob({ finalization_status: 'failed' }),
      },
    })
    const repository = new RecordingFinalizationRepository(fake.executor)

    const claimed = await repository.claimJob(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-08-17T12:00:00.000Z',
    )

    expect(claimed).toBe(true)
    expect(fake.statements[0]).toContain("finalization_status IN ('pending', 'failed')")
  })

  it('releases a processing claim back to pending so the scheduled retry can re-claim it', async function run() {
    const fake = createFakeExecutor({ jobWithInterview: JOB_WITH_INTERVIEW })
    const repository = new RecordingFinalizationRepository(fake.executor)

    await repository.releaseClaim(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-08-17T12:00:00.000Z',
    )

    const sql = fake.statements[0]
    expect(sql).toContain('UPDATE interview_recordings')
    expect(sql).toContain("finalization_status = 'pending'")
    expect(sql).toContain("finalization_checkpoint = 'awaiting_provider'")
    expect(sql).toContain("WHERE provider_recording_id = $1")
    expect(sql).toContain("finalization_status = 'processing'")
  })

  it('looks up an existing artifact row by provider asset id', async function run() {
    const fake = createFakeExecutor({
      artifactByProviderAssetId: { id: 'artifact-id', object_key: 'interviews/1/recording/2' },
    })
    const repository = new RecordingFinalizationRepository(fake.executor)

    const existing = await repository.getArtifactByProviderAssetId('asset-id')

    expect(existing).toEqual({ id: 'artifact-id', object_key: 'interviews/1/recording/2' })
    expect(fake.statements[0]).toContain('FROM interview_artifacts')
  })

  it('inserts an artifact row with finalization and expiry timestamps', async function run() {
    const fake = createFakeExecutor({})
    const repository = new RecordingFinalizationRepository(fake.executor)

    const outcome = await repository.insertArtifact({
      id: 'artifact-id',
      interview_id: '22222222-2222-4222-8222-222222222222',
      artifact_kind: 'playback_recording',
      participant_id: null,
      participant_role: null,
      object_key: 'interviews/22222222-2222-4222-8222-222222222222/recording/rec-1',
      provider_asset_id: 'asset-id',
      idempotency_key: 'finalize:asset-id',
      content_metadata: { content_type: 'video/mp4', size_bytes: 100 },
      captured_at: '2026-08-17T11:00:00.000Z',
      finalized_at: '2026-08-17T12:00:00.000Z',
      expires_at: '2026-09-16T12:00:00.000Z',
      created_at: '2026-08-17T12:00:00.000Z',
    })

    expect(outcome).toBe('inserted')
    const sql = fake.statements[0]
    expect(sql).toContain('INSERT INTO interview_artifacts')
    expect(sql).toContain('finalized_at')
    expect(sql).toContain('expires_at')
    expect(sql).toContain('ON CONFLICT (provider_asset_id)')
  })

  it('reports duplicate when a conflicting artifact row already exists', async function run() {
    const fake = createFakeExecutor({ insertRowCount: 0 })
    const repository = new RecordingFinalizationRepository(fake.executor)

    const outcome = await repository.insertArtifact({
      id: 'artifact-id',
      interview_id: '22222222-2222-4222-8222-222222222222',
      artifact_kind: 'playback_recording',
      participant_id: null,
      participant_role: null,
      object_key: 'interviews/1/recording/rec-1',
      provider_asset_id: 'asset-id',
      idempotency_key: 'finalize:asset-id',
      content_metadata: { content_type: 'video/mp4', size_bytes: 100 },
      captured_at: '2026-08-17T11:00:00.000Z',
      finalized_at: '2026-08-17T12:00:00.000Z',
      expires_at: '2026-09-16T12:00:00.000Z',
      created_at: '2026-08-17T12:00:00.000Z',
    })

    expect(outcome).toBe('duplicate')
  })

  it('lists bounded sweep candidates ordered by next attempt', async function run() {
    const fake = createFakeExecutor({
      sweepCandidates: [
        {
          provider_event_id: 'event-1',
          recording_id: 'rec-1',
          attempt_count: 0,
        },
      ],
    })
    const repository = new RecordingFinalizationRepository(fake.executor)

    const candidates = await repository.listSweepCandidates(50, '2026-08-17T12:00:00.000Z')

    expect(candidates).toEqual([
      { provider_event_id: 'event-1', recording_id: 'rec-1', attempt_count: 0 },
    ])
    const sql = fake.statements[0]
    expect(sql).toContain('processed_at IS NULL')
    expect(sql).toContain('next_attempt_at <= $1')
    expect(sql).toContain('LIMIT $2')
  })

  it('advances a sweep checkpoint with attempt count and backoff', async function run() {
    const fake = createFakeExecutor({})
    const repository = new RecordingFinalizationRepository(fake.executor)

    await repository.updateSweepCheckpoint(
      'event-1',
      1,
      '2026-08-17T12:05:00.000Z',
      null,
    )

    expect(fake.statements[0]).toContain('UPDATE realtimekit_webhook_events')
    expect(fake.statements[0]).toContain('attempt_count = $2')
  })

  it('terminates a sweep checkpoint after bounded attempts', async function run() {
    const fake = createFakeExecutor({})
    const repository = new RecordingFinalizationRepository(fake.executor)

    await repository.updateSweepCheckpoint(
      'event-1',
      10,
      null,
      '2026-08-17T12:00:00.000Z',
    )

    const sql = fake.statements[0]
    expect(sql).toContain('processed_at = $4')
    expect(sql).toContain('sweep_exhausted')
  })

  it('clears the sweep checkpoint when marking an event processed after finalization', async function run() {
    const fake = createFakeExecutor({})
    const repository = new RecordingFinalizationRepository(fake.executor)

    await repository.markEventProcessed(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-08-17T12:00:00.000Z',
    )

    const sql = fake.statements[0]
    expect(sql).toContain('UPDATE realtimekit_webhook_events')
    expect(sql).toContain("status = 'processed'")
    expect(sql).toContain('processed_at = $2')
    expect(sql).toContain('next_attempt_at = NULL')
    // Only unprocessed checkpoints are touched so a finalized recording stops
    // being a sweep candidate while an in-flight one stays scheduled.
    expect(sql).toContain('processed_at IS NULL')
  })

  it('forwards withTransaction to a datasource implementation', async function run() {
    const dataSource = createFakeDataSource()
    const dataSourceWithTransaction = dataSource.withTransaction as ReturnType<typeof vi.fn>
    const repository = new RecordingFinalizationRepository(dataSource)

    const callback = vi.fn(async () => 'tx-done')
    const result = await repository.withTransaction(callback)

    expect(result).toBe('tx-done')
    // The repository delegates to the datasource's own transaction primitive so
    // callers holding the port keep the real transaction boundary.
    expect(dataSourceWithTransaction).toHaveBeenCalledExactlyOnceWith(callback)
  })
})
