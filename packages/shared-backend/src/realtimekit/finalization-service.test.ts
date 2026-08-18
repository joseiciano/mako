import { describe, expect, it, vi } from 'vitest'
import {
  RealtimeKitInvalidProviderAssetError,
  RecordingFinalizationService,
  type InsertArtifactInput,
  type RecordingFinalizationConfig,
  type RecordingFinalizationRepositoryPort,
  type RecordingJobWithInterview,
  type RequiredRecordingArtifact,
  type SweepCandidateRow,
} from './finalization-service'
import type {
  RealtimeKitRecordingClientPort,
  RealtimeKitRecordingStatusResult,
} from './recording-client'
import type { ArtifactStoragePort, R2BucketPort } from '../interview-assets'
import type { RealtimeKitWebhookLogger } from './types'
import { createRecordingJob } from './test-utils'

const RECORDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const INTERVIEW_ID = '22222222-2222-4222-8222-222222222222'
const NOW = '2026-08-17T12:00:00.000Z'

function createLogger(): RealtimeKitWebhookLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<number> {
  const reader = stream.getReader()
  let total = 0

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      return total
    }

    total += value.byteLength
  }
}

function createInMemoryStorage() {
  const stored: Array<{
    input: Parameters<ArtifactStoragePort['storeRecording']>[0]
    size: number
    key: string
  }> = []
  const deleted: string[] = []

  const storage: ArtifactStoragePort = {
    async storeRecording(input) {
      // Drain the body like R2 put would so size-bound transform errors surface
      // from storeRecording rather than silently succeeding.
      const size =
        input.body instanceof ReadableStream
          ? await drainStream(input.body as ReadableStream<Uint8Array>)
          : input.body.byteLength
      const key = `interviews/${input.interviewId}/recording/${input.recordingId}`
      stored.push({ input, size, key })
      return {
        key,
        metadata: {
          interviewId: input.interviewId,
          artifactKind: input.artifactKind ?? 'playback_recording',
          contentType: input.contentType,
          captureTimestamp: input.captureTimestamp,
          participantId: input.participantId,
          participantRole: input.participantRole,
        },
      }
    },
    async storeScreenshot() {
      throw new Error('unexpected screenshot store')
    },
    async getRecording() {
      return null
    },
    async getScreenshot() {
      return null
    },
    async deleteArtifact(key) {
      deleted.push(key)
    },
    async headArtifact() {
      return { size: 1, contentType: 'video/mp4' }
    },
  }

  return { storage, stored, deleted }
}

function createInMemoryRepository(overrides: Partial<RecordingFinalizationRepositoryPort> = {}) {
  const calls: Record<string, unknown[]> = {
    claimJob: [],
    releaseClaim: [],
    insertArtifact: [],
    finalizeJob: [],
    failJob: [],
    markEventProcessed: [],
    markEventAwaiting: [],
    markEventFailed: [],
    setInterviewRecordingReady: [],
  }

  // Order log distinguishes core DB writes issued inside the transaction
  // (prefix `tx.`) from writes issued outside it.
  const order: string[] = []
  let inTransaction = false

  const repository: RecordingFinalizationRepositoryPort = {
    async getJobWithInterview() {
      return null
    },
    async claimJob() {
      return true
    },
    async releaseClaim(...args) {
      calls.releaseClaim.push(args)
    },
    async getArtifactByProviderAssetId() {
      return null
    },
    async insertArtifact(...args) {
      calls.insertArtifact.push(args)
      order.push(inTransaction ? 'tx.insertArtifact' : 'insertArtifact')
      return 'inserted'
    },
    async finalizeJob(...args) {
      calls.finalizeJob.push(args)
      order.push(inTransaction ? 'tx.finalizeJob' : 'finalizeJob')
    },
    async failJob(...args) {
      calls.failJob.push(args)
    },
    async markEventProcessed(...args) {
      calls.markEventProcessed.push(args)
      order.push(inTransaction ? 'tx.markEventProcessed' : 'markEventProcessed')
    },
    async markEventAwaiting(...args) {
      calls.markEventAwaiting.push(args)
    },
    async markEventFailed(...args) {
      calls.markEventFailed.push(args)
    },
    async getAggregateReadiness() {
      return []
    },
    async setInterviewRecordingReady(...args) {
      calls.setInterviewRecordingReady.push(args)
    },
    async listSweepCandidates(): Promise<SweepCandidateRow[]> {
      return []
    },
    async updateSweepCheckpoint() {},
    async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
      const previous = inTransaction
      inTransaction = true
      try {
        return await callback()
      } finally {
        inTransaction = previous
      }
    },
    ...overrides,
  }

  return { repository, calls, order }
}

function createJobWithInterview(
  overrides: Partial<RecordingJobWithInterview['job']> = {},
  interviewOverrides: Partial<RecordingJobWithInterview['interview']> = {},
): RecordingJobWithInterview {
  return {
    job: createRecordingJob({
      provider_recording_id: RECORDING_ID,
      ...overrides,
    }),
    interview: {
      id: INTERVIEW_ID,
      mode: 'ai_led',
      scheduler_id: '33333333-3333-4333-8333-333333333333',
      interviewer_id: null,
      recording_status: 'processing',
      ...interviewOverrides,
    },
  }
}

function createDemoClient(
  status: RealtimeKitRecordingStatusResult | (() => RealtimeKitRecordingStatusResult),
): RealtimeKitRecordingClientPort {
  return {
    async getRecordingStatus() {
      return typeof status === 'function' ? status() : status
    },
  }
}

function createUploadedStatus(
  overrides: Partial<RealtimeKitRecordingStatusResult> = {},
): RealtimeKitRecordingStatusResult {
  return {
    recordingId: RECORDING_ID,
    state: 'UPLOADED',
    capturedAt: '2026-08-17T11:00:00.000Z',
    assets: [
      {
        assetId: 'asset-composite',
        kind: 'composite',
        downloadUrl: 'https://api.realtime.cloudflare.com/downloads/composite.mp4',
        contentType: 'video/mp4',
      },
    ],
    ...overrides,
  }
}

function createMockFetch(
  body?: ReadableStream<any> | ArrayBuffer | Uint8Array<ArrayBuffer>,
  options: { status?: number; contentType?: string; contentLength?: number } = {},
) {
  const arrayBufferSpy = vi.fn(async () => {
    throw new Error('arrayBuffer should not be called for streamed artifacts')
  })

  const fetchMock = vi.fn(async () => {
    const response = new Response(body, {
      status: options.status ?? 200,
      headers: {
        'content-type': options.contentType ?? 'video/mp4',
        ...(options.contentLength !== undefined
          ? { 'content-length': String(options.contentLength) }
          : {}),
      },
    })
    return Object.assign(response, { arrayBuffer: arrayBufferSpy })
  })

  return { fetchMock, arrayBufferSpy }
}

function createService(options: {
  repository?: RecordingFinalizationRepositoryPort
  storage?: ArtifactStoragePort
  client?: RealtimeKitRecordingClientPort
  fetchMock?: ReturnType<typeof vi.fn>
  config?: Partial<RecordingFinalizationConfig>
  logger?: RealtimeKitWebhookLogger
}) {
  const repository = options.repository ?? createInMemoryRepository().repository
  const { storage, stored, deleted } = options.storage
    ? {
        storage: options.storage,
        stored: [] as storedCalls,
        deleted: [] as string[],
      }
    : createInMemoryStorage()
  const client = options.client ?? createDemoClient(createUploadedStatus())
  const logger = options.logger ?? createLogger()

  const service = new RecordingFinalizationService({
    repository,
    storage,
    providerClient: client,
    fetch: (options.fetchMock ??
      (async () =>
        new Response('ok', {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        }))) as unknown as typeof globalThis.fetch,
    config: options.config,
    logger,
  })

  return { service, storage, stored, deleted, repository, logger }
}

type storedCalls = Array<{
  input: Parameters<ArtifactStoragePort['storeRecording']>[0]
  size: number
  key: string
}>

describe('RecordingFinalizationService', function finalizationServiceSuite() {
  it('skips unknown provider recording ids', async function run() {
    const { service, storage, stored } = createService({
      repository: createInMemoryRepository().repository,
    })

    const result = await service.finalizeRecording('unknown-recording-id', NOW)

    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('not_found')
    expect(stored).toHaveLength(0)
  })

  it('refreshes provider state by recording id and awaits when not yet uploaded', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const getJobWithInterview = vi
      .fn()
      .mockResolvedValue(createJobWithInterview())
    const repositoryWithJob: RecordingFinalizationRepositoryPort = {
      ...repository,
      getJobWithInterview,
    }
    const { service, storage, stored } = createService({
      repository: repositoryWithJob,
      client: createDemoClient({
        recordingId: RECORDING_ID,
        state: 'UPLOADING',
        capturedAt: null,
        assets: [],
      }),
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('awaiting_provider')
    expect(getJobWithInterview).toHaveBeenCalledExactlyOnceWith(RECORDING_ID)
    expect(stored).toHaveLength(0)
    expect(calls.markEventAwaiting).toHaveLength(1)
    expect(calls.finalizeJob).toHaveLength(0)
  })

  it('returns a pre-upload claim to pending and keeps the checkpoint sweep-eligible so the UPLOADED retry refreshes and transfers', async function run() {
    // Stateful fake repository mirroring the real claim/release SQL semantics:
    // only pending/failed jobs can be claimed, a claim moves to processing, and
    // releaseClaim returns a processing job to pending.
    let jobStatus: 'pending' | 'processing' | 'finalized' | 'failed' = 'pending'
    let providerState: 'UPLOADING' | 'UPLOADED' = 'UPLOADING'
    const { repository, calls } = createInMemoryRepository()
    const statefulRepository: RecordingFinalizationRepositoryPort = {
      ...repository,
      async getJobWithInterview() {
        return createJobWithInterview({ finalization_status: jobStatus })
      },
      async claimJob() {
        if (jobStatus === 'pending' || jobStatus === 'failed') {
          jobStatus = 'processing'
          return true
        }
        return false
      },
      async releaseClaim(...args) {
        calls.releaseClaim.push(args)
        if (jobStatus === 'processing') {
          jobStatus = 'pending'
        }
      },
      async finalizeJob(...args) {
        calls.finalizeJob.push(args)
        jobStatus = 'finalized'
      },
      getAggregateReadiness: vi.fn().mockResolvedValue([
        {
          provider_recording_id: RECORDING_ID,
          recording_type: 'composite',
          artifact_kind: 'playback_recording',
          artifact_object_key: 'interviews/1/recording/rec-1',
        },
      ]),
    }

    const { service, stored } = createService({
      repository: statefulRepository,
      client: createDemoClient(() => createUploadedStatus({ state: providerState })),
    })

    // First run claims the job, refreshes provider state, and finds the
    // recording still uploading. The claim must be released back to pending so
    // a later retry can claim it again, and the checkpoint must stay scheduled.
    const first = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(first.status).toBe('awaiting_provider')
    expect(calls.releaseClaim).toHaveLength(1)
    expect(calls.markEventAwaiting).toHaveLength(1)
    expect(calls.finalizeJob).toHaveLength(0)
    expect(stored).toHaveLength(0)

    // The next sweep fires while the provider now reports UPLOADED. Because the
    // claim was released, the retry claims the job, refreshes the provider, and
    // transfers the assets instead of bouncing as already_processing.
    providerState = 'UPLOADED'
    const second = await service.finalizeRecording(
      RECORDING_ID,
      addMilliseconds(NOW, 5 * 60 * 1000),
    )

    expect(second.status).toBe('finalized')
    expect(calls.finalizeJob).toHaveLength(1)
    expect(calls.markEventProcessed).toHaveLength(1)
    expect(stored).toHaveLength(1)
  })

  it('fails the job with a safe code when the provider reports ERRORED', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      client: createDemoClient({
        recordingId: RECORDING_ID,
        state: 'ERRORED',
        capturedAt: null,
        assets: [],
      }),
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('failed')
    expect(result.error_code).toBe('provider_upload_failed')
    expect(stored).toHaveLength(0)
    expect(calls.failJob).toHaveLength(1)
    expect(calls.markEventFailed).toHaveLength(1)
  })

  it('stores the composite playback artifact and finalizes a composite job', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(
          createJobWithInterview({ recording_type: 'composite' }),
        ),
        getAggregateReadiness: vi.fn().mockResolvedValue([
          {
            provider_recording_id: RECORDING_ID,
            recording_type: 'composite',
            artifact_kind: 'playback_recording',
            artifact_object_key: 'interviews/22222222-2222-4222-8222-222222222222/recording/rec-1',
          },
        ]),
      },
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('finalized')
    expect(stored).toHaveLength(1)
    expect(stored[0].input.artifactKind).toBe('playback_recording')
    expect(stored[0].input.contentType).toBe('video/mp4')
    expect(calls.finalizeJob).toHaveLength(1)
    expect(calls.markEventProcessed).toHaveLength(1)
    expect(calls.setInterviewRecordingReady).toHaveLength(1)
    expect(calls.insertArtifact).toHaveLength(1)
  })

  it('stores participant track artifacts with role mapping for transcription', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(
          createJobWithInterview({
            recording_type: 'participant_track',
            participant_id: '33333333-3333-4333-8333-333333333333',
            participant_role: 'scheduler',
          }),
        ),
        getAggregateReadiness: vi.fn().mockResolvedValue([
          {
            provider_recording_id: RECORDING_ID,
            recording_type: 'participant_track',
            artifact_kind: 'transcription_audio',
            artifact_object_key: 'interviews/22222222-2222-4222-8222-222222222222/recording/rec-1',
          },
        ]),
      },
      client: createDemoClient(
        createUploadedStatus({
          assets: [
            {
              assetId: 'asset-track',
              kind: 'participant_track',
              downloadUrl: 'https://api.realtime.cloudflare.com/downloads/track.m4a',
              contentType: 'audio/mp4',
            },
          ],
        }),
      ),
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('finalized')
    expect(stored).toHaveLength(1)
    expect(stored[0].input.artifactKind).toBe('transcription_audio')
    expect(stored[0].input.participantId).toBe(
      '33333333-3333-4333-8333-333333333333',
    )
    expect(stored[0].input.participantRole).toBe('scheduler')
    expect(calls.insertArtifact).toHaveLength(1)
    expect(calls.setInterviewRecordingReady).toHaveLength(1)
  })

  it('streams large recordings instead of materializing them in memory', async function run() {
    const bodyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    })
    const { fetchMock, arrayBufferSpy } = createMockFetch(bodyStream, {
      contentLength: 10_000,
    })
    const { service, storage, stored } = createService({
      repository: {
        ...createInMemoryRepository().repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
        getAggregateReadiness: vi.fn().mockResolvedValue([
          {
            provider_recording_id: RECORDING_ID,
            recording_type: 'composite',
            artifact_kind: 'playback_recording',
            artifact_object_key: 'interviews/1/recording/rec-1',
          },
        ]),
      },
      fetchMock,
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('finalized')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(arrayBufferSpy).not.toHaveBeenCalled()
    expect(stored[0].input.body).toBeInstanceOf(ReadableStream)
    expect(stored[0].input.body).not.toBe(bodyStream)
  })

  it('rejects non-HTTPS download URLs', async function run() {
    const { repository } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      client: createDemoClient(
        createUploadedStatus({
          assets: [
            {
              assetId: 'asset-bad',
              kind: 'composite',
              downloadUrl: 'http://insecure.example.com/downloads/composite.mp4',
              contentType: 'video/mp4',
            },
          ],
        }),
      ),
    })

    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow(
      RealtimeKitInvalidProviderAssetError,
    )
    expect(stored).toHaveLength(0)
  })

  it('rejects download URLs on hosts outside the allowlist', async function run() {
    const { repository } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      client: createDemoClient(
        createUploadedStatus({
          assets: [
            {
              assetId: 'asset-bad',
              kind: 'composite',
              downloadUrl: 'https://evil.example.com/downloads/composite.mp4',
              contentType: 'video/mp4',
            },
          ],
        }),
      ),
    })

    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow(
      RealtimeKitInvalidProviderAssetError,
    )
    expect(stored).toHaveLength(0)
  })

  it('rejects provider download redirects without following them', async function run() {
    const fetchMock = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example.com/steal.mp4' },
      })
    })
    const { repository } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      fetchMock,
    })

    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow(
      RealtimeKitInvalidProviderAssetError,
    )
    expect(stored).toHaveLength(0)
    // Redirects are disabled on the outbound fetch so the SSRF allowlist
    // cannot be bypassed by an allowlisted endpoint redirecting elsewhere.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.realtime.cloudflare.com/downloads/composite.mp4',
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('fails on non-2xx provider downloads', async function run() {
    const { fetchMock } = createMockFetch(undefined, { status: 404 })
    const { repository } = createInMemoryRepository()
    const { service } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      fetchMock,
    })

    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow()
  })

  it('rejects oversized downloads using bounded content-length metadata', async function run() {
    const bodyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
        controller.close()
      },
    })
    const { fetchMock } = createMockFetch(bodyStream, { contentLength: 10_000 })
    const { repository } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      fetchMock,
      config: { maxArtifactBytes: 1_000 },
    })

    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow(
      RealtimeKitInvalidProviderAssetError,
    )
    expect(stored).toHaveLength(0)
  })

  it('skips assets that already have a persisted artifact row', async function run() {
    const { repository } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
        getArtifactByProviderAssetId: vi.fn().mockResolvedValue({
          id: 'existing-artifact',
          object_key: 'interviews/1/recording/existing',
        }),
      },
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('finalized')
    expect(stored).toHaveLength(0)
  })

  it('issues aggregate readiness head checks concurrently', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const baseStorage = createInMemoryStorage()
    const invokedKeys: string[] = []
    const resolvers: Array<() => void> = []

    const headArtifact = vi.fn((key: string) => {
      invokedKeys.push(key)
      return new Promise<{ size: number; contentType: string }>((resolve) => {
        resolvers.push(() => resolve({ size: 1, contentType: 'video/mp4' }))
      })
    })

    const { service } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
        getAggregateReadiness: vi.fn().mockResolvedValue([
          {
            provider_recording_id: RECORDING_ID,
            recording_type: 'composite',
            artifact_kind: 'playback_recording',
            artifact_object_key: 'interviews/1/recording/rec-1',
          },
          {
            provider_recording_id: RECORDING_ID,
            recording_type: 'participant_track',
            artifact_kind: 'transcription_audio',
            artifact_object_key: 'interviews/1/recording/rec-2',
          },
        ]),
      },
      storage: { ...baseStorage.storage, headArtifact },
    })

    const finalizePromise = service.finalizeRecording(RECORDING_ID, NOW)

    // Both head checks must begin while neither has resolved. A sequential
    // loop would issue the second only after the first settles, so this
    // waitFor would time out (or the service would deadlock) on the old code.
    await vi.waitFor(() => expect(invokedKeys).toHaveLength(2))

    resolvers.forEach((resolve) => resolve())

    const result = await finalizePromise

    expect(result.status).toBe('finalized')
    expect(invokedKeys).toEqual([
      'interviews/1/recording/rec-1',
      'interviews/1/recording/rec-2',
    ])
    expect(calls.setInterviewRecordingReady).toHaveLength(1)
  })

  it('does not derive aggregate ready until every required artifact is visible in R2', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
        getAggregateReadiness: vi.fn().mockResolvedValue([
          {
            provider_recording_id: RECORDING_ID,
            recording_type: 'composite',
            artifact_kind: 'playback_recording',
            artifact_object_key: null,
          },
        ]),
      },
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('finalized')
    expect(stored).toHaveLength(1)
    expect(calls.setInterviewRecordingReady).toHaveLength(0)
  })

  it('propagates R2 persistence failures so the workflow can fail the checkpoint', async function run() {
    const failingStorage: ArtifactStoragePort = {
      async storeRecording() {
        throw new Error('r2 unavailable')
      },
      async storeScreenshot() {
        throw new Error('unexpected')
      },
      async getRecording() {
        return null
      },
      async getScreenshot() {
        return null
      },
      async deleteArtifact() {},
      async headArtifact() {
        return null
      },
    }
    const { repository } = createInMemoryRepository()
    const { service } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      storage: failingStorage,
    })

    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow('r2 unavailable')
  })

  it('reports already_finalized for finalized jobs and marks the checkpoint processed', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(
          createJobWithInterview({ finalization_status: 'finalized' }),
        ),
      },
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('already_finalized')
    expect(calls.markEventProcessed).toHaveLength(1)
  })

  it('does not finalize when the provider reports UPLOADED with no assets', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      client: createDemoClient(createUploadedStatus({ assets: [] })),
    })

    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow(
      RealtimeKitInvalidProviderAssetError,
    )
    expect(stored).toHaveLength(0)
    expect(calls.finalizeJob).toHaveLength(0)
    expect(calls.markEventProcessed).toHaveLength(0)
  })

  it('does not finalize when every asset kind mismatches the expected recording type', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(
          createJobWithInterview({ recording_type: 'composite' }),
        ),
      },
      client: createDemoClient(
        createUploadedStatus({
          assets: [
            {
              assetId: 'asset-track',
              kind: 'participant_track',
              downloadUrl: 'https://api.realtime.cloudflare.com/downloads/track.m4a',
              contentType: 'audio/mp4',
            },
          ],
        }),
      ),
    })

    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow(
      RealtimeKitInvalidProviderAssetError,
    )
    expect(stored).toHaveLength(0)
    expect(calls.finalizeJob).toHaveLength(0)
    expect(calls.markEventProcessed).toHaveLength(0)
  })

  it('finalizes when the provider asset was already persisted by a concurrent run', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
        insertArtifact: vi.fn().mockResolvedValue('duplicate' as const),
      },
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('finalized')
    expect(stored).toHaveLength(1)
    expect(calls.finalizeJob).toHaveLength(1)
  })

  it('rejects chunked downloads without content-length that exceed the size limit while streaming', async function run() {
    const chunk = new Uint8Array(512)
    const bodyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk)
        controller.enqueue(chunk)
        controller.enqueue(chunk)
        controller.close()
      },
    })
    const { fetchMock } = createMockFetch(bodyStream, {})
    const { repository } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      fetchMock,
      config: { maxArtifactBytes: 1024 },
    })

    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow(
      RealtimeKitInvalidProviderAssetError,
    )
    expect(stored).toHaveLength(0)
  })

  it('passes chunked downloads within the size limit through the bounded stream', async function run() {
    const chunk = new Uint8Array(512)
    const bodyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk)
        controller.enqueue(chunk)
        controller.close()
      },
    })
    const { fetchMock } = createMockFetch(bodyStream, {})
    const { repository } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      fetchMock,
      config: { maxArtifactBytes: 1024 },
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('finalized')
    expect(stored).toHaveLength(1)
    expect(stored[0].size).toBe(1024)
  })

  it('omits size_bytes from artifact content metadata when the provider omits content-length', async function run() {
    const bodyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    })
    const { fetchMock } = createMockFetch(bodyStream, {})
    const { repository, calls } = createInMemoryRepository()
    const { service, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      fetchMock,
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('finalized')
    expect(stored).toHaveLength(1)
    const insertInput = (calls.insertArtifact[0] as unknown[])[0] as InsertArtifactInput
    expect(insertInput.content_metadata.content_type).toBe('video/mp4')
    // A missing or invalid content-length must not be recorded as a bogus zero.
    expect(insertInput.content_metadata).not.toHaveProperty('size_bytes')
  })

  it('performs artifact insertions, job finalization, and checkpoint processing inside a single repository transaction', async function run() {
    const { repository, calls, order } = createInMemoryRepository()
    const { service, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
        getAggregateReadiness: vi.fn().mockResolvedValue([
          {
            provider_recording_id: RECORDING_ID,
            recording_type: 'composite',
            artifact_kind: 'playback_recording',
            artifact_object_key: 'interviews/1/recording/rec-1',
          },
        ]),
      },
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('finalized')
    expect(stored).toHaveLength(1)
    expect(calls.insertArtifact).toHaveLength(1)
    // R2 download/store happens before the transaction; the core DB writes are
    // atomic within a single repository.withTransaction callback.
    expect(order).toEqual([
      'tx.insertArtifact',
      'tx.finalizeJob',
      'tx.markEventProcessed',
    ])
    // Aggregate readiness derivation stays outside the transaction.
    expect(calls.setInterviewRecordingReady).toHaveLength(1)
  })

  it('keeps the checkpoint sweep-eligible when another workflow holds the processing claim', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(
          createJobWithInterview({ finalization_status: 'processing' }),
        ),
        claimJob: vi.fn().mockResolvedValue(false),
      },
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('already_processing')
    expect(calls.markEventProcessed).toHaveLength(0)
    expect(calls.finalizeJob).toHaveLength(0)
    expect(calls.markEventAwaiting).toHaveLength(1)
    expect((calls.markEventAwaiting[0] as unknown[])[1]).toBe(
      addMilliseconds(NOW, 5 * 60 * 1000),
    )
  })

  it('marks the event processed when the job was finalized between load and claim', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const getJobWithInterview = vi
      .fn()
      .mockResolvedValueOnce(createJobWithInterview())
      .mockResolvedValueOnce(
        createJobWithInterview({ finalization_status: 'finalized' }),
      )
    const { service } = createService({
      repository: {
        ...repository,
        getJobWithInterview,
        claimJob: vi.fn().mockResolvedValue(false),
      },
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('already_finalized')
    expect(calls.markEventProcessed).toHaveLength(1)
    expect(calls.markEventAwaiting).toHaveLength(0)
  })

  it('recovers a previously failed job when the scheduled retry claims it', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service, storage, stored } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(
          createJobWithInterview({ finalization_status: 'failed' }),
        ),
        getAggregateReadiness: vi.fn().mockResolvedValue([
          {
            provider_recording_id: RECORDING_ID,
            recording_type: 'composite',
            artifact_kind: 'playback_recording',
            artifact_object_key: 'interviews/1/recording/rec-1',
          },
        ]),
      },
    })

    const result = await service.finalizeRecording(RECORDING_ID, NOW)

    expect(result.status).toBe('finalized')
    expect(stored).toHaveLength(1)
    expect(calls.finalizeJob).toHaveLength(1)
    expect(calls.markEventProcessed).toHaveLength(1)
  })

  it('deletes newly stored artifacts when a later provider asset copy fails', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service, stored, deleted } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
      },
      client: createDemoClient(
        createUploadedStatus({
          assets: [
            {
              assetId: 'asset-one',
              kind: 'composite',
              downloadUrl: 'https://api.realtime.cloudflare.com/downloads/one.mp4',
              contentType: 'video/mp4',
            },
            {
              assetId: 'asset-two',
              kind: 'composite',
              downloadUrl: 'https://api.realtime.cloudflare.com/downloads/two.mp4',
              contentType: 'video/mp4',
            },
          ],
        }),
      ),
      fetchMock: vi
        .fn()
        .mockResolvedValueOnce(
          new Response('first', {
            status: 200,
            headers: { 'content-type': 'video/mp4', 'content-length': '5' },
          }),
        )
        .mockResolvedValueOnce(
          new Response('nope', {
            status: 404,
            headers: { 'content-type': 'video/mp4' },
          }),
        ),
    })

    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow(
      RealtimeKitInvalidProviderAssetError,
    )

    // The first asset was persisted to R2 before the second copy failed. The
    // compensating deletion must remove exactly that newly stored key so a
    // retry neither orphans the object nor duplicates the upload.
    expect(stored).toHaveLength(1)
    expect(deleted).toEqual([stored[0].key])
    expect(calls.finalizeJob).toHaveLength(0)
    expect(calls.markEventProcessed).toHaveLength(0)
  })

  it('deletes only newly stored artifacts when the core transaction fails and never touches pre-existing assets', async function run() {
    const { repository, calls } = createInMemoryRepository()
    const { service, stored, deleted } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
        getArtifactByProviderAssetId: vi.fn().mockImplementation(
          async (providerAssetId: string) =>
            providerAssetId === 'asset-existing'
              ? { id: 'existing-artifact', object_key: 'interviews/1/recording/existing' }
              : null,
        ),
        withTransaction: vi.fn(async () => {
          throw new Error('db unavailable')
        }),
      },
      client: createDemoClient(
        createUploadedStatus({
          assets: [
            {
              assetId: 'asset-existing',
              kind: 'composite',
              downloadUrl: 'https://api.realtime.cloudflare.com/downloads/existing.mp4',
              contentType: 'video/mp4',
            },
            {
              assetId: 'asset-new',
              kind: 'composite',
              downloadUrl: 'https://api.realtime.cloudflare.com/downloads/new.mp4',
              contentType: 'video/mp4',
            },
          ],
        }),
      ),
    })

    // The original DB error must surface unchanged so the workflow can fail the
    // checkpoint and schedule a retry.
    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow(
      'db unavailable',
    )

    // Only the asset stored by this run is compensated; the pre-existing asset
    // that already had an artifact row is left untouched.
    expect(stored).toHaveLength(1)
    expect(deleted).toEqual([stored[0].key])
    expect(deleted).not.toContain('interviews/1/recording/existing')
    expect(calls.finalizeJob).toHaveLength(0)
    expect(calls.markEventProcessed).toHaveLength(0)
  })

  it('preserves the original error and logs cleanup failures when compensating deletion fails', async function run() {
    const { repository } = createInMemoryRepository()
    const baseStorage = createInMemoryStorage()
    const failingDeleteStorage: ArtifactStoragePort = {
      ...baseStorage.storage,
      async deleteArtifact() {
        throw new Error('r2 delete unavailable')
      },
    }
    const logger = createLogger()
    const { service } = createService({
      repository: {
        ...repository,
        getJobWithInterview: vi.fn().mockResolvedValue(createJobWithInterview()),
        withTransaction: vi.fn(async () => {
          throw new Error('db unavailable')
        }),
      },
      storage: failingDeleteStorage,
      logger,
    })

    // A failed compensating delete must never replace the original error.
    await expect(service.finalizeRecording(RECORDING_ID, NOW)).rejects.toThrow(
      'db unavailable',
    )

    // The cleanup failure is reported through the existing logger so the
    // workflow can observe and alert on the orphaned object.
    expect(logger.error).toHaveBeenCalledWith(
      'realtimekit.finalization.cleanup_failed',
      expect.objectContaining({
        object_key: expect.stringContaining('interviews/22222222-2222-4222-8222-222222222222/recording/'),
        original_error: 'db unavailable',
      }),
    )
  })
})

function addMilliseconds(timestamp: string, millis: number): string {
  return new Date(new Date(timestamp).getTime() + millis).toISOString()
}
