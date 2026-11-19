import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RecordingFinalizationWorkflow,
  recordingFinalizationPayloadSchema,
} from './recording-finalization-workflow'
import type { WorkerBindings } from '../index'
import { createPostgresConnectionPool } from '@mako/shared-backend'

vi.mock('@mako/shared-backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mako/shared-backend')>()
  return {
    ...actual,
    createPostgresConnectionPool: vi.fn(),
    createSqlQuery: (text: string, values: readonly unknown[] = []) => ({ text, values }),
  }
})
const TRACK_PROVIDER_ID = '66666666-6666-4666-8666-666666666666'
const INTERVIEW_ID = '11111111-1111-4111-8111-111111111111'
const PROVIDER_ID = '22222222-2222-4222-8222-222222222222'
const ASSET_ID = '33333333-3333-4333-8333-333333333333'
const SCHEDULER_ID = '44444444-4444-4444-8444-444444444444'
const PEER_INTERVIEWER_ID = '55555555-5555-4555-8555-555555555555'
const VALID_PAYLOAD = { recording_id: PROVIDER_ID, schema_version: 1 as const }


type RecordingJob = {
  id: string
  interview_id: string
  provider_recording_id: string
  recording_type: 'composite' | 'participant_track'
  participant_id?: string
  participant_role?: string
  provider_status: string
  finalization_status: 'pending' | 'processing' | 'finalized' | 'failed'
  finalization_checkpoint?: string | null
  error_code?: string | null
}

function createBucket() {
  const objects = new Map<string, { body: ReadableStream; options: Record<string, unknown> }>()
  const put = vi.fn(async (key: string, body: ReadableStream, options: Record<string, unknown>) => {
    if (!(body instanceof ReadableStream)) throw new Error('non-stream body')
    objects.set(key, { body, options })
  })
  const head = vi.fn(async (key: string) => objects.has(key) ? { key } : null)
  return { bucket: { put, head } as unknown as WorkerBindings['RECORDINGS_BUCKET'], objects, put, head }
}

function createPool(initialJob: RecordingJob, additionalJobs: RecordingJob[] = [], initialArtifactIds: string[] = [], interviewMode: 'ai_led' | 'peer_to_peer' = 'ai_led') {
  const jobs = new Map([initialJob, ...additionalJobs].map((job) => [job.id, { ...job }]))
  const artifacts = new Set(initialArtifactIds)
  const calls: Array<{ text: string; values: readonly unknown[] }> = []
  const query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
    calls.push({ text, values })
    const lower = text.toLowerCase()
    if (lower.includes('select') && lower.includes('from interviews')) {
      return { rows: [{ id: INTERVIEW_ID, scheduler_id: SCHEDULER_ID, interviewer_id: PEER_INTERVIEWER_ID, mode: interviewMode }], rowCount: 1 }
    }
    if (lower.includes('select') && lower.includes('interview_recordings')) {
      const rows = lower.includes('required') ? [...jobs.values()] : [...jobs.values()].filter((job) => job.provider_recording_id === values[0])
      return { rows, rowCount: rows.length }
    }
    if (lower.includes('select') && lower.includes('interview_artifacts')) {
      return { rows: [...artifacts].map((provider_asset_id) => ({ provider_asset_id, object_key: `interviews/${INTERVIEW_ID}/recording/${provider_asset_id}` })), rowCount: artifacts.size }
    }
    if (lower.includes('insert') && lower.includes('interview_artifacts')) {
      const asset = String(values.find((value) => value === ASSET_ID) ?? values[0])
      artifacts.add(asset)
      return { rows: [{ provider_asset_id: asset }], rowCount: 1 }
    }
    if (lower.includes('update') && lower.includes('interview_recordings')) {
      const job = [...jobs.values()][0]
      if (values.includes('finalized')) job.finalization_status = 'finalized'
      return { rows: [job], rowCount: 1 }
    }
    return { rows: [], rowCount: 1 }
  })
  const client = { query, async release() {} }
  const pool = { connect: vi.fn(async () => client) }
  vi.mocked(createPostgresConnectionPool).mockReturnValue(pool as unknown as ReturnType<typeof createPostgresConnectionPool>)
  return { pool, client, calls, jobs, artifacts }
}

function createStep() {
  const results: Array<{ name: string; result: unknown }> = []
  const step = {
    async do<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const result = await callback()
      results.push({ name, result })
      return result
    },
    async sleep() {},
    async sleepUntil() {},
  }
  return { step, results }
}

function createEvent(payload: typeof VALID_PAYLOAD = VALID_PAYLOAD) {
  return { payload, timestamp: new Date('2026-08-26T00:00:00.000Z'), instanceId: `recording-finalization-v1-${PROVIDER_ID}`, workflowName: 'recording_finalization' }
}

function createEnv(bucket: unknown, _pool: ReturnType<typeof createPool>) {
  return {
    HYPERDRIVE: { connectionString: 'postgres://test' },
    RECORDINGS_BUCKET: bucket,
    CLOUDFLARE_ACCOUNT_ID: 'account',
    CLOUDFLARE_API_TOKEN: 'token',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
  } as unknown as WorkerBindings
}
function detailsResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ success: true, data: { recording: { id: PROVIDER_ID, status: 'UPLOADED', type: 'COMPOSITE', download_url: 'https://signed.invalid/composite.webm', ...overrides } } }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function trackDetailsResponse(files: Array<{ filename: string; download_url: string }>) {
  const downloadUrls = Object.fromEntries(files.map((file) => [file.filename, { download_url: file.download_url }]))
  return new Response(JSON.stringify({ success: true, data: { recording: { id: PROVIDER_ID, status: 'UPLOADED', type: 'TRACK', download_url: [{ layer_name: 'audio', download_urls: downloadUrls }] } } }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function downloadResponse(body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.close() } })) {
  return new Response(body, { status: 200, headers: { 'content-type': 'video/webm' } })
}

function runWorkflow(env: WorkerBindings, event = createEvent()) {
  const workflow = new RecordingFinalizationWorkflow({} as ExecutionContext, env)
  const tracking = createStep()
  return workflow.run(event, tracking.step as never).then((result) => ({ result, steps: tracking.results }))
}

describe('recordingFinalizationPayloadSchema', function payloadSuite() {
  it('accepts only UUID recording_id with schema_version 1 and no unknown keys', function run() {
    expect(recordingFinalizationPayloadSchema.safeParse(VALID_PAYLOAD).success).toBe(true)
    expect(recordingFinalizationPayloadSchema.safeParse({ ...VALID_PAYLOAD, extra: true }).success).toBe(false)
    expect(recordingFinalizationPayloadSchema.safeParse({ recording_id: 'not-a-uuid', schema_version: 1 }).success).toBe(false)
    expect(recordingFinalizationPayloadSchema.safeParse({ recording_id: PROVIDER_ID, schema_version: 2 }).success).toBe(false)
  })
})

describe('RecordingFinalizationWorkflow', function workflowSuite() {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('loads fresh official RealtimeKit recording shape by provider ID and excludes signed URL from state and SQL', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const output = await runWorkflow(createEnv(bucket, pool))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(`/recordings/${PROVIDER_ID}`)
    expect(JSON.stringify(output)).not.toContain('signed.invalid')
    expect(pool.calls.every(({ values }) => values.every((value) => !String(value).includes('signed.invalid')))).toBe(true)
  })

  it('fetches recording details from the default Cloudflare API base when the setting is unset', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse())
    vi.stubGlobal('fetch', fetchSpy)
    await runWorkflow(createEnv(bucket, pool))
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(`https://api.cloudflare.com/client/v4/accounts/account/realtime/kit/app/recordings/${PROVIDER_ID}`)
  })

  it('fetches recording details from CLOUDFLARE_API_BASE_URL when set', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const env = { ...createEnv(bucket, pool), CLOUDFLARE_API_BASE_URL: 'http://fakes:9000/client/v4/' } as WorkerBindings
    await runWorkflow(env)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(`http://fakes:9000/client/v4/accounts/account/realtime/kit/app/recordings/${PROVIDER_ID}`)
  })

  it('fails the transfer with a safe code when CLOUDFLARE_API_BASE_URL is invalid', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const fetchSpy = vi.fn(async () => detailsResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const env = { ...createEnv(bucket, pool), CLOUDFLARE_API_BASE_URL: 'nope' } as WorkerBindings
    const output = await runWorkflow(env)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(output.result).toMatchObject({ status: 'failed' })
  })

  it.each([
    ['http URL', detailsResponse({ download_url: 'http://signed.invalid/file.webm' }), undefined],
    ['non-2xx download', detailsResponse(), new Response('bad', { status: 503, headers: { 'content-type': 'video/webm' } })],
    ['wrong content type', detailsResponse(), new Response('bad', { status: 200, headers: { 'content-type': 'audio/mpeg' } })],
  ])('returns safe failure for %s without finalizing job', async function run(_label, details, download) {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? details : (download ?? downloadResponse()))
    vi.stubGlobal('fetch', fetchSpy)
    const output = await runWorkflow(createEnv(bucket, pool))
    expect(output.result).toMatchObject({ status: 'failed', error_code: expect.any(String) })
    expect(pool.calls.some(({ values }) => values.includes('finalized'))).toBe(false)
  })

  it('passes response.body directly to R2 put and does not materialize download', async function run() {
    const { bucket, put } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const arrayBufferSpy = vi.spyOn(Response.prototype, 'arrayBuffer').mockImplementation(() => { throw new Error('materialized') })
    const textSpy = vi.spyOn(Response.prototype, 'text').mockImplementation(() => { throw new Error('consumed as text') })
    try {
      await runWorkflow(createEnv(bucket, pool))
      expect(put).toHaveBeenCalledWith(expect.stringContaining(`interviews/${INTERVIEW_ID}/recording/`), expect.any(ReadableStream), expect.any(Object))
      expect(arrayBufferSpy).not.toHaveBeenCalled()
      expect(textSpy).not.toHaveBeenCalled()
    } finally {
      arrayBufferSpy.mockRestore()
      textSpy.mockRestore()
    }
  })

  it('stores composite job as playback_recording using canonical key and one provider asset row', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse()))
    await runWorkflow(createEnv(bucket, pool))
    expect(pool.calls.some(({ values }) => values.includes('playback_recording'))).toBe(true)
    expect(pool.calls.filter(({ text }) => /insert.*interview_artifacts/i.test(text))).toHaveLength(1)
  })

  it('maps AI-led scheduler filename to candidate without participant ownership columns', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'participant_track', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const filename = `mix_${SCHEDULER_ID}_${PEER_INTERVIEWER_ID}_audio_audio_20260826.webm`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? trackDetailsResponse([{ filename, download_url: 'https://signed.invalid/scheduler.webm' }]) : downloadResponse()))
    await runWorkflow(createEnv(bucket, pool))
    expect(pool.calls.some(({ values }) => values.includes('transcription_audio'))).toBe(true)
    expect(pool.calls.some(({ values }) => values.includes('candidate'))).toBe(true)
    expect(pool.calls.some(({ values }) => values.includes(SCHEDULER_ID))).toBe(true)
  })

  it('maps peer scheduler and interviewer filenames to two transcription artifacts from one TRACK recording', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'participant_track', provider_status: 'UPLOADED', finalization_status: 'pending' }, [], [], 'peer_to_peer')
    const files = [
      { filename: `mix_${SCHEDULER_ID}_${PEER_INTERVIEWER_ID}_scheduler_audio_20260826.webm`, download_url: 'https://signed.invalid/scheduler.webm' },
      { filename: `mix_${PEER_INTERVIEWER_ID}_${SCHEDULER_ID}_interviewer_audio_20260826.webm`, download_url: 'https://signed.invalid/interviewer.webm' },
    ]
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? trackDetailsResponse(files) : downloadResponse()))
    await runWorkflow(createEnv(bucket, pool))
    const transcriptionRows = pool.calls.filter(({ text, values }) => /insert.*interview_artifacts/i.test(text) && values.includes('transcription_audio'))
    expect(transcriptionRows).toHaveLength(2)
    expect(pool.calls.some(({ values }) => values.includes(SCHEDULER_ID))).toBe(true)
    expect(pool.calls.some(({ values }) => values.includes(PEER_INTERVIEWER_ID))).toBe(true)
  })

  it('uses ON CONFLICT provider asset identity across replay while preserving persisted state', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse())
    vi.stubGlobal('fetch', fetchSpy)
    await runWorkflow(createEnv(bucket, pool))
    await runWorkflow(createEnv(bucket, pool))
    expect(pool.artifacts.size).toBe(1)
    expect(pool.calls.filter(({ text }) => /insert.*interview_artifacts/i.test(text)).every(({ text }) => /on conflict|do nothing|upsert/i.test(text))).toBe(true)
  })

  it('checks every required R2 object before finalizing job and setting aggregate interview ready', async function run() {
    const { bucket, head, objects } = createBucket()
    const trackKey = `interviews/${INTERVIEW_ID}/recording/${TRACK_PROVIDER_ID}`
    objects.set(trackKey, { body: new ReadableStream(), options: { contentType: 'audio/webm' } })
    const pool = createPool(
      { id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' },
      [{ id: 'track-job', interview_id: INTERVIEW_ID, provider_recording_id: TRACK_PROVIDER_ID, recording_type: 'participant_track', provider_status: 'UPLOADED', finalization_status: 'finalized' }],
      [TRACK_PROVIDER_ID],
    )
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse()))
    const output = await runWorkflow(createEnv(bucket, pool))
    expect(head).toHaveBeenCalled()
    expect(pool.calls.some(({ values }) => values.includes('finalized'))).toBe(true)
    expect(pool.calls.some(({ values }) => values.includes('ready'))).toBe(true)
    expect(output.result).toMatchObject({ status: 'ready' })
  })

  it.each([
    ['provider', 'fetch'],
    ['storage', 'put'],
  ])('maps %s failure to safe retry code without leaking signed URLs', async function run(_label, source) {
    const { bucket, put } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse())
    vi.stubGlobal('fetch', fetchSpy)
    if (source === 'put') put.mockRejectedValue(new Error('storage unavailable'))
    if (source === 'fetch') fetchSpy.mockRejectedValue(new Error('provider unavailable'))
    const output = await runWorkflow(createEnv(bucket, pool))
    expect(output.result).toMatchObject({ status: 'failed', error_code: expect.any(String) })
    expect(JSON.stringify(output.result)).not.toContain('https://')
  })

  it('does not leak signed URLs when database is unavailable', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse())
    vi.stubGlobal('fetch', fetchSpy)
    pool.client.query.mockRejectedValue(new Error('database unavailable'))
    let caughtError: unknown
    try {
      await runWorkflow(createEnv(bucket, pool))
    } catch (err) {
      caughtError = err
    }
    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as Error).message).not.toContain('https://')
  })
  it('selects composite handling from persisted recording_type when provider details omit type', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const compositeDetailsWithoutType = new Response(JSON.stringify({ success: true, data: { recording: { id: PROVIDER_ID, status: 'UPLOADED', download_url: 'https://signed.invalid/composite.webm' } } }), { status: 200, headers: { 'content-type': 'application/json' } })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? compositeDetailsWithoutType : downloadResponse()))
    const output = await runWorkflow(createEnv(bucket, pool))
    expect(output.result).not.toMatchObject({ status: 'failed' })
    expect(pool.calls.some(function hasPlayback(v) { return v.values.includes('playback_recording') })).toBe(true)
    expect(output.result).toMatchObject({ status: 'ready' })
  })

  it('selects participant-track handling from persisted recording_type when provider details omit type', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'participant_track', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const filename = `mix_${SCHEDULER_ID}_${PEER_INTERVIEWER_ID}_audio_audio_20260826.webm`
    const trackDetailsWithoutType = new Response(JSON.stringify({ success: true, data: { recording: { id: PROVIDER_ID, status: 'UPLOADED', download_url: [{ layer_name: 'audio', download_urls: { [filename]: { download_url: 'https://signed.invalid/scheduler.webm' } } }] } } }), { status: 200, headers: { 'content-type': 'application/json' } })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? trackDetailsWithoutType : downloadResponse()))
    const output = await runWorkflow(createEnv(bucket, pool))
    expect(output.result).not.toMatchObject({ status: 'failed' })
    expect(pool.calls.some(function hasTranscription(v) { return v.values.includes('transcription_audio') })).toBe(true)
  })

  it('does not use short-lived AbortSignal timeout when streaming media download for composite', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/recordings/')) return detailsResponse()
      // capture init for assertion
      void init
      return downloadResponse()
    })
    vi.stubGlobal('fetch', fetchSpy)
    await runWorkflow(createEnv(bucket, pool))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const downloadInit = fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined
    expect(downloadInit?.signal).toBeUndefined()
  })

  it('does not use short-lived AbortSignal timeout when streaming media downloads for participant tracks', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'participant_track', provider_status: 'UPLOADED', finalization_status: 'pending' }, [], [], 'peer_to_peer')
    const files = [
      { filename: `mix_${SCHEDULER_ID}_${PEER_INTERVIEWER_ID}_scheduler_audio_20260826.webm`, download_url: 'https://signed.invalid/scheduler.webm' },
      { filename: `mix_${PEER_INTERVIEWER_ID}_${SCHEDULER_ID}_interviewer_audio_20260826.webm`, download_url: 'https://signed.invalid/interviewer.webm' },
    ]
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => String(input).includes('/recordings/') ? trackDetailsResponse(files) : downloadResponse())
    vi.stubGlobal('fetch', fetchSpy)
    await runWorkflow(createEnv(bucket, pool))
    const downloadCalls = fetchSpy.mock.calls.filter(function isDownload(call) { return String(call[0]).includes('signed.invalid') })
    expect(downloadCalls.length).toBeGreaterThan(0)
    for (const call of downloadCalls) {
      const init = call[1] as RequestInit | undefined
      expect(init?.signal).toBeUndefined()
    }
  })

  it('uses partial unique index predicate WHERE provider_asset_id IS NOT NULL on artifact insert', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse()))
    await runWorkflow(createEnv(bucket, pool))
    const insertCalls = pool.calls.filter(function isInsert(entry) { return /insert.*interview_artifacts/i.test(entry.text) })
    expect(insertCalls.length).toBeGreaterThan(0)
    expect(insertCalls.every(function hasPredicate(entry) { return /on conflict.*\(provider_asset_id\)/i.test(entry.text) && /where.*provider_asset_id.*is not null/i.test(entry.text) })).toBe(true)
  })

  it('restricts aggregate visibility query to non-deleted recording artifacts only', async function run() {
    const { bucket, head, objects } = createBucket()
    const trackKey = `interviews/${INTERVIEW_ID}/recording/${TRACK_PROVIDER_ID}`
    objects.set(trackKey, { body: new ReadableStream(), options: { contentType: 'audio/webm' } })
    const pool = createPool(
      { id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' },
      [{ id: 'track-job', interview_id: INTERVIEW_ID, provider_recording_id: TRACK_PROVIDER_ID, recording_type: 'participant_track', provider_status: 'UPLOADED', finalization_status: 'finalized' }],
      [TRACK_PROVIDER_ID],
    )
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse()))
    await runWorkflow(createEnv(bucket, pool))
    const aggregateQueries = pool.calls.filter(function isAggregate(entry) { return /select.*interview_artifacts/i.test(entry.text) && entry.text.toLowerCase().includes('interview_id') })
    expect(aggregateQueries.length).toBeGreaterThan(0)
    for (const q of aggregateQueries) {
      expect(q.text.toLowerCase()).toContain('deleted_at is null')
      expect(q.text.toLowerCase()).toContain('artifact_kind')
      expect(q.text.toLowerCase()).toMatch(/playback_recording|transcription_audio/)
      expect(q.text.toLowerCase()).not.toMatch(/screenshot/)
    }
    expect(head).toHaveBeenCalled()
  })

  it('marks recording failed when artifact persistence throws after successful claim', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse()))
    const originalQuery = pool.client.query
    const querySpy = vi.fn(async (text: string, values: readonly unknown[] = []) => {
      if (/insert.*interview_artifacts/i.test(text)) throw new Error('database unavailable')
      return originalQuery(text, values)
    })
    pool.client.query = querySpy as unknown as typeof pool.client.query
    let result: unknown
    let threw: unknown
    try {
      const out = await runWorkflow(createEnv(bucket, pool))
      result = out.result
    } catch (err) {
      threw = err
    }
    const allCalls: Array<{ text: string; values: readonly unknown[] }> = []
    const spyCalls = querySpy.mock.calls as unknown as Array<[string, readonly unknown[]]>
    for (const [text, values] of spyCalls) allCalls.push({ text, values: values ?? [] })
    // Fallback to pool.calls if spy didn't capture claim
    for (const c of pool.calls) if (!allCalls.some(function exists(e) { return e.text === c.text })) allCalls.push(c)
    const failedMark = allCalls.filter(function isFailedMark(entry) { return /update.*interview_recordings/i.test(entry.text) && entry.values.includes('failed') })
    expect(failedMark.length).toBeGreaterThan(0)
    if (threw) expect(threw).toBeDefined()
    else expect(result).toMatchObject({ status: 'failed' })
  })

  it('marks recording failed when visibility check throws after successful claim', async function run() {
    const { put } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse()))
    // Force visibility head to throw by making bucket head throw
    const failingBucket = {
      put,
      head: vi.fn(async () => { throw new Error('storage unavailable') }),
    } as unknown as WorkerBindings['RECORDINGS_BUCKET']
    let result: unknown
    let threw: unknown
    try {
      const out = await runWorkflow(createEnv(failingBucket, pool))
      result = out.result
    } catch (err) {
      threw = err
    }
    const failedMark = pool.calls.filter(function isFailed(entry) { return /update.*interview_recordings/i.test(entry.text) && entry.values.includes('failed') })
    expect(failedMark.length).toBeGreaterThan(0)
    if (threw) expect(threw).toBeDefined()
    else expect(result).toMatchObject({ status: 'failed' })
  })
  it('maps R2 put rejection to storage_error and marks processing job failed with storage_error', async function run() {
    const { bucket, put } = createBucket()
    put.mockRejectedValue(Object.assign(new Error('r2 unavailable'), { safeCode: undefined }))
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse()))
    const out = await runWorkflow(createEnv(bucket, pool))
    expect(out.result).toMatchObject({ status: 'failed', error_code: 'storage_error' })
    const failedUpdates = pool.calls.filter(function isFailed(entry) { return /update.*interview_recordings/i.test(entry.text) && entry.values.includes('failed') && entry.values.includes('storage_error') })
    expect(failedUpdates.length).toBeGreaterThan(0)
  })
  it('fails with storage_error when aggregate artifact has empty object_key and does not mark interview ready', async function run() {
    const { bucket, objects } = createBucket()
    const trackKey = `interviews/${INTERVIEW_ID}/recording/${TRACK_PROVIDER_ID}`
    objects.set(trackKey, { body: new ReadableStream(), options: { contentType: 'audio/webm' } })
    const pool = createPool(
      { id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' },
      [{ id: 'track-job', interview_id: INTERVIEW_ID, provider_recording_id: TRACK_PROVIDER_ID, recording_type: 'participant_track', provider_status: 'UPLOADED', finalization_status: 'finalized' }],
      [TRACK_PROVIDER_ID],
    )
    const originalQuery = pool.client.query as unknown as (text: string, values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>
    pool.client.query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
      const lower = text.toLowerCase()
      if (lower.includes('select') && lower.includes('interview_artifacts') && lower.includes('object_key')) {
        return { rows: [{ object_key: '' } as unknown as Record<string, unknown>], rowCount: 1 }
      }
      return originalQuery(text, values)
    }) as unknown as typeof pool.client.query
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse()))
    const out = await runWorkflow(createEnv(bucket, pool))
    expect(out.result).toMatchObject({ status: 'failed', error_code: 'storage_error' })
    expect(pool.calls.some(function hasReady(entry) { return /update.*interviews.*recording_status/i.test(entry.text) && entry.values.includes('ready') })).toBe(false)
    const failedMark = pool.calls.filter(function isFailed(entry) { return /update.*interview_recordings/i.test(entry.text) && entry.values.includes('storage_error') })
    expect(failedMark.length).toBeGreaterThan(0)
  })
  it('fails with storage_error when aggregate R2 object is missing and does not mark interview ready', async function run() {
    const { bucket } = createBucket()
    const pool = createPool(
      { id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' },
      [{ id: 'track-job', interview_id: INTERVIEW_ID, provider_recording_id: TRACK_PROVIDER_ID, recording_type: 'participant_track', provider_status: 'UPLOADED', finalization_status: 'finalized' }],
      [TRACK_PROVIDER_ID],
    )
    const missingKey = `interviews/${INTERVIEW_ID}/recording/${TRACK_PROVIDER_ID}`
    const originalQuery = pool.client.query as unknown as (text: string, values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>
    pool.client.query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
      const lower = text.toLowerCase()
      if (lower.includes('select') && lower.includes('interview_artifacts') && lower.includes('object_key')) {
        return { rows: [{ object_key: missingKey } as unknown as Record<string, unknown>], rowCount: 1 }
      }
      return originalQuery(text, values)
    }) as unknown as typeof pool.client.query
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse()))
    const out = await runWorkflow(createEnv(bucket, pool))
    expect(out.result).toMatchObject({ status: 'failed', error_code: 'storage_error' })
    expect(pool.calls.some(function hasReady(entry) { return /update.*interviews.*recording_status/i.test(entry.text) && entry.values.includes('ready') })).toBe(false)
  })
  it('propagates error when STEP_MARK_FAILED itself fails instead of completing as failed', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'pending' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('provider down') }))
    const workflow = new RecordingFinalizationWorkflow({} as ExecutionContext, createEnv(bucket, pool))
    const failingStep = {
      async do(name: string, callback: () => Promise<unknown>) {
        if (name === 'recording-mark-failed') throw new Error('mark failed unavailable')
        return callback()
      },
      async sleep() {},
      async sleepUntil() {},
    }
    let threw = false
    let result: unknown = null
    try {
      result = await workflow.run(createEvent(), failingStep as never)
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    expect(result).toBeNull()
  })
  it('workflow claim SQL can reclaim processing rows for orphaned finalization', async function run() {
    const { bucket } = createBucket()
    const pool = createPool({ id: 'job', interview_id: INTERVIEW_ID, provider_recording_id: PROVIDER_ID, recording_type: 'composite', provider_status: 'UPLOADED', finalization_status: 'processing' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/recordings/') ? detailsResponse() : downloadResponse()))
    await runWorkflow(createEnv(bucket, pool))
    const claimCalls = pool.calls.filter(function isClaim(entry) { return /update.*interview_recordings/i.test(entry.text) && /finalization_status.*in/i.test(entry.text) })
    expect(claimCalls.length).toBeGreaterThan(0)
    for (const entry of claimCalls) {
      const lower = entry.text.toLowerCase()
      expect(lower).toContain('processing')
      expect(lower).toContain('pending')
      expect(lower).toContain('failed')
    }
  })
})
