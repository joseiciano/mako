import { describe, expect, it, vi } from 'vitest'
import {
  RecordingFinalizationWorkflow,
  checkpointRecordingFinalizationError,
  createWorkflowQueryExecutor,
  mapRecordingFinalizationError,
  recordingFinalizationWorkflowPayloadSchema,
  STEP_FINALIZE_RECORDING,
  type RecordingFinalizationRecoveryRepository,
  type RecordingFinalizationWorkflowPayload,
} from './recording-finalization-workflow'
import {
  RealtimeKitInvalidProviderAssetError,
  RealtimeKitRecordingClientError,
  REALTIMEKIT_SAFE_ERROR_CODES,
} from '@mako/shared-backend'
import type { WorkerBindings } from '../index'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

const RECORDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('recordingFinalizationWorkflowPayloadSchema', function schemaSuite() {
  it('accepts valid payload with provider_recording_id and attempt', function run() {
    const result = recordingFinalizationWorkflowPayloadSchema.safeParse({
      provider_recording_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      attempt: 0,
    })

    expect(result.success).toBe(true)
  })

  it('accepts attempt of zero', function run() {
    const result = recordingFinalizationWorkflowPayloadSchema.safeParse({
      provider_recording_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      attempt: 0,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.attempt).toBe(0)
    }
  })

  it('rejects missing provider_recording_id', function run() {
    const result = recordingFinalizationWorkflowPayloadSchema.safeParse({
      attempt: 0,
    })

    expect(result.success).toBe(false)
  })

  it('rejects empty provider_recording_id', function run() {
    const result = recordingFinalizationWorkflowPayloadSchema.safeParse({
      provider_recording_id: '',
      attempt: 0,
    })

    expect(result.success).toBe(false)
  })

  it('rejects missing attempt', function run() {
    const result = recordingFinalizationWorkflowPayloadSchema.safeParse({
      provider_recording_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })

    expect(result.success).toBe(false)
  })

  it('rejects negative attempt', function run() {
    const result = recordingFinalizationWorkflowPayloadSchema.safeParse({
      provider_recording_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      attempt: -1,
    })

    expect(result.success).toBe(false)
  })

  it('rejects unknown keys', function run() {
    const result = recordingFinalizationWorkflowPayloadSchema.safeParse({
      provider_recording_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      attempt: 0,
      extra: 'field',
    })

    expect(result.success).toBe(false)
  })
})

describe('RecordingFinalizationWorkflow', function workflowSuite() {
  it('exports the correct step name', function run() {
    expect(STEP_FINALIZE_RECORDING).toBe('finalize-recording')
  })

  it('can be imported and is a class', function run() {
    expect(typeof RecordingFinalizationWorkflow).toBe('function')
    expect(RecordingFinalizationWorkflow.name).toBe('RecordingFinalizationWorkflow')
  })

  it('maps provider asset validation failures to safe invalid asset errors', function run() {
    expect(
      mapRecordingFinalizationError(
        new RealtimeKitInvalidProviderAssetError('unsafe provider asset'),
      ),
    ).toBe(REALTIMEKIT_SAFE_ERROR_CODES.invalid_provider_asset)
  })

  it('maps provider client failures to safe provider download errors', function run() {
    expect(
      mapRecordingFinalizationError(
        new RealtimeKitRecordingClientError('provider unavailable'),
      ),
    ).toBe(REALTIMEKIT_SAFE_ERROR_CODES.provider_download_failed)
  })

  it('maps storage, database, and unknown failures to internal errors', function run() {
    expect(mapRecordingFinalizationError(new Error('database unavailable'))).toBe(
      REALTIMEKIT_SAFE_ERROR_CODES.internal_error,
    )
  })
})

describe('RecordingFinalizationWorkflow run', function runSuite() {
  it('returns a failed result when the recordings bucket is not configured', async function run() {
    const workflow = new RecordingFinalizationWorkflow(mockExecutionContext(), {
      HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
    } as unknown as WorkerBindings)

    const result = await workflow.run(createWorkflowEvent(), {} as WorkflowStep)

    expect(result).toEqual({ status: 'failed', reason: 'recordings_bucket_not_configured' })
  })

  it('rejects when the HYPERDRIVE binding is missing', async function run() {
    const workflow = new RecordingFinalizationWorkflow(
      mockExecutionContext(),
      {} as unknown as WorkerBindings,
    )

    await expect(workflow.run(createWorkflowEvent(), {} as WorkflowStep)).rejects.toThrow(
      'HYPERDRIVE binding is not configured',
    )
  })

  it('rejects an invalid workflow payload before touching any binding', async function run() {
    const workflow = new RecordingFinalizationWorkflow(
      mockExecutionContext(),
      { HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' } } as unknown as WorkerBindings,
    )

    await expect(
      workflow.run(createWorkflowEvent({ payload: { provider_recording_id: '', attempt: 0 } }), {} as WorkflowStep),
    ).rejects.toThrow()
  })

  it('preserves the original error when cleanup fails while an error is in flight', async function run() {
    const release = vi.fn(async () => {
      throw new Error('client release failed')
    })
    const end = vi.fn(async () => {
      throw new Error('pool end failed')
    })
    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      release,
    }
    const connect = vi.fn(async () => client)
    const pool = { connect, end }

    const step = {
      do: vi.fn(async () => {
        throw new Error('original finalization failure')
      }),
    } as unknown as WorkflowStep

    const workflow = new RecordingFinalizationWorkflow(
      mockExecutionContext(),
      {
        HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
        RECORDINGS_BUCKET: {},
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'api-token',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-id',
      } as unknown as WorkerBindings,
      () => pool,
    )

    // The original finalization failure must win over both the release error
    // and the pool end error, and the pool must still be ended.
    await expect(workflow.run(createWorkflowEvent(), step)).rejects.toThrow(
      'original finalization failure',
    )
    expect(end).toHaveBeenCalledTimes(1)
  })
})

describe('createWorkflowQueryExecutor cleanup', function queryExecutorCleanupSuite() {
  const CONNECTION_STRING = 'postgresql://localhost:5432/test'

  function createMockPool() {
    const release = vi.fn(async () => {})
    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      release,
    }
    const connect = vi.fn(async () => client)
    const end = vi.fn(async () => {})
    return { pool: { connect, end }, client, connect, release, end }
  }

  function createEnv() {
    return {
      HYPERDRIVE: { connectionString: CONNECTION_STRING },
    } as unknown as WorkerBindings
  }

  it('releases the acquired client before ending the pool', async function run() {
    const { pool, connect, release, end } = createMockPool()
    const { queryExecutor, cleanup } = createWorkflowQueryExecutor(createEnv(), () => pool)

    await queryExecutor.query({ text: 'select 1', values: [] })

    expect(connect).toHaveBeenCalledTimes(1)

    await cleanup()

    expect(release).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledTimes(1)
    expect(release.mock.invocationCallOrder[0]).toBeLessThan(
      end.mock.invocationCallOrder[0],
    )
  })

  it('ends the pool without connecting when no client was acquired', async function run() {
    const { pool, connect, end } = createMockPool()
    const { cleanup } = createWorkflowQueryExecutor(createEnv(), () => pool)

    await cleanup()

    expect(connect).not.toHaveBeenCalled()
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('still ends the pool when releasing the client fails and surfaces the release error', async function run() {
    const { pool, release, end } = createMockPool()
    release.mockRejectedValueOnce(new Error('client release failed'))
    const { queryExecutor, cleanup } = createWorkflowQueryExecutor(createEnv(), () => pool)

    await queryExecutor.query({ text: 'select 1', values: [] })

    await expect(cleanup()).rejects.toThrow('client release failed')
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('still ends the pool when acquiring the client fails and surfaces the connection error', async function run() {
    const { pool, connect, end } = createMockPool()
    connect.mockRejectedValueOnce(new Error('connection failed'))
    const { queryExecutor, cleanup } = createWorkflowQueryExecutor(createEnv(), () => pool)

    await expect(queryExecutor.query({ text: 'select 1', values: [] })).rejects.toThrow(
      'connection failed',
    )

    await expect(cleanup()).rejects.toThrow('connection failed')
    expect(end).toHaveBeenCalledTimes(1)
  })
})

describe('checkpointRecordingFinalizationError', function checkpointRecoverySuite() {
  const FAILED_AT = '2026-08-17T12:05:00.000Z'
  const ERROR_CODE = REALTIMEKIT_SAFE_ERROR_CODES.internal_error

  function createRecoveryDependencies(overrides: {
    failJob?: RecordingFinalizationRecoveryRepository['failJob']
    markEventFailed?: RecordingFinalizationRecoveryRepository['markEventFailed']
    releaseClaim?: RecordingFinalizationRecoveryRepository['releaseClaim']
  } = {}) {
    const order: string[] = []
    const logError = vi.fn((event: string) => {
      order.push(event)
    })

    const repository: RecordingFinalizationRecoveryRepository = {
      async failJob(providerRecordingId, errorCode, checkpoint, now) {
        order.push('failJob')
        if (overrides.failJob) {
          return overrides.failJob(providerRecordingId, errorCode, checkpoint, now)
        }
      },
      async markEventFailed(recordingId, errorCode, nextAttemptAt) {
        order.push('markEventFailed')
        if (overrides.markEventFailed) {
          return overrides.markEventFailed(recordingId, errorCode, nextAttemptAt)
        }
      },
      async releaseClaim(providerRecordingId, now) {
        order.push('releaseClaim')
        if (overrides.releaseClaim) {
          return overrides.releaseClaim(providerRecordingId, now)
        }
      },
    }

    return { repository, logError, order }
  }

  it('releases the claim with the same provider id and failedAt before reporting the checkpoint failure', async function run() {
    const releaseClaim = vi.fn().mockResolvedValue(undefined)
    const { repository, logError, order } = createRecoveryDependencies({
      failJob: vi.fn().mockRejectedValue(new Error('checkpoint write failed')),
      releaseClaim,
    })

    await checkpointRecordingFinalizationError({
      repository,
      providerRecordingId: RECORDING_ID,
      errorCode: ERROR_CODE,
      failedAt: FAILED_AT,
      attempt: 2,
      logError,
    })

    // The claim must be released with the exact provider id and failedAt used
    // for the failed checkpoint, before any failure report is emitted.
    expect(releaseClaim).toHaveBeenCalledWith(RECORDING_ID, FAILED_AT)
    expect(logError).toHaveBeenCalledWith(
      'recording_finalization.checkpoint_failure',
      expect.objectContaining({ error_code: ERROR_CODE }),
    )
    expect(order).toEqual([
      'failJob',
      'releaseClaim',
      'recording_finalization.checkpoint_failure',
    ])
    expect(logError).not.toHaveBeenCalledWith(
      'recording_finalization.release_claim_failure',
      expect.anything(),
    )
  })

  it('logs a release failure and does not mask the original exception', async function run() {
    const releaseClaim = vi.fn().mockRejectedValue(new Error('claim release failed'))
    const { repository, logError, order } = createRecoveryDependencies({
      failJob: vi.fn().mockRejectedValue(new Error('checkpoint write failed')),
      releaseClaim,
    })

    // The recovery helper swallows recovery failures: the workflow rethrows the
    // original finalization error afterwards, so nothing here may throw.
    await expect(
      checkpointRecordingFinalizationError({
        repository,
        providerRecordingId: RECORDING_ID,
        errorCode: ERROR_CODE,
        failedAt: FAILED_AT,
        attempt: 2,
        logError,
      }),
    ).resolves.toBeUndefined()

    expect(releaseClaim).toHaveBeenCalledWith(RECORDING_ID, FAILED_AT)
    expect(logError).toHaveBeenCalledWith(
      'recording_finalization.release_claim_failure',
      expect.objectContaining({ error_code: ERROR_CODE }),
    )
    expect(logError).toHaveBeenCalledWith(
      'recording_finalization.checkpoint_failure',
      expect.objectContaining({ error_code: ERROR_CODE }),
    )
    expect(order).toEqual([
      'failJob',
      'releaseClaim',
      'recording_finalization.release_claim_failure',
      'recording_finalization.checkpoint_failure',
    ])
  })

  it('does not release the claim or log failures when checkpointing succeeds', async function run() {
    const releaseClaim = vi.fn()
    const { repository, logError, order } = createRecoveryDependencies()

    await checkpointRecordingFinalizationError({
      repository,
      providerRecordingId: RECORDING_ID,
      errorCode: ERROR_CODE,
      failedAt: FAILED_AT,
      attempt: 2,
      logError,
    })

    expect(releaseClaim).not.toHaveBeenCalled()
    expect(logError).not.toHaveBeenCalled()
    expect(order).toEqual(['failJob', 'markEventFailed'])
  })
})

function mockExecutionContext() {
  return {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext
}

function createWorkflowEvent(
  overrides: Partial<WorkflowEvent<RecordingFinalizationWorkflowPayload>> = {},
): WorkflowEvent<RecordingFinalizationWorkflowPayload> {
  return {
    payload: { provider_recording_id: RECORDING_ID, attempt: 0 },
    timestamp: new Date('2026-08-17T12:00:00.000Z'),
    instanceId: `recording-finalize-v1-${RECORDING_ID}-0`,
    workflowName: 'recording-finalization-workflow',
    ...overrides,
  }
}
