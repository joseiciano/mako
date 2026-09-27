import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { InterviewDetail } from '@mako/shared'
import type { SqlQuery } from '../index'
import type { ArtifactStoragePort, R2Range } from '../interview-assets'
import {
  ArtifactReadRepository,
  type ReadableArtifactRow,
} from './artifact-read-repository'
import {
  ArtifactReadService,
  createInterviewArtifactUrlSource,
  screenshotRouteUrl,
} from './artifact-read-service'
import { InterviewRepository } from './interview-repository'
import { InterviewService } from './interview-service'
import { registerInterviewController } from './interview-controller'
import {
  InterviewNotFoundError,
  type GetParticipantInterviewByIdInput,
  type InterviewSession,
} from './types'

type TestBindings = Record<string, unknown>

type ExecutorHandler = (
  query: SqlQuery,
) => { rows: unknown[]; rowCount: number }

type ExecutorHandlers = Record<string, ExecutorHandler>

const FIXED_NOW = function fixedNow(): Date {
  return new Date('2026-09-18T00:00:00.000Z')
}

const participantUserId = '11111111-1111-4111-8111-111111111111'
const interviewId = '33333333-3333-4333-8333-333333333333'
const recordingId = '55555555-5555-4555-8555-555555555555'
const screenshotId = '44444444-4444-4444-8444-444444444444'
const secondScreenshotId = '66666666-6666-4666-8666-666666666666'
const recordingObjectKey = `interviews/${interviewId}/recordings/${recordingId}/recording.webm`
const screenshotObjectKey = `interviews/${interviewId}/screenshots/${screenshotId}`

const session: InterviewSession = {
  userId: participantUserId,
  email: 'participant@example.com',
}

const RECORDING_BYTES = 'RIFF-webm-payload'
const SCREENSHOT_BYTES = 'PNGDATA-BYTES'

const recordingRoute = `/api/interviews/${interviewId}/artifacts/recording`

function createRecordingRow(
  overrides: Partial<ReadableArtifactRow> = {},
): ReadableArtifactRow {
  return {
    id: recordingId,
    interview_id: interviewId,
    artifact_kind: 'playback_recording',
    object_key: recordingObjectKey,
    content_metadata: null,
    finalized_at: '2026-02-01T00:00:00.000Z',
    expires_at: '2030-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

function createScreenshotRow(
  overrides: Partial<ReadableArtifactRow> = {},
): ReadableArtifactRow {
  return {
    id: screenshotId,
    interview_id: interviewId,
    artifact_kind: 'screenshot',
    object_key: screenshotObjectKey,
    content_metadata: null,
    finalized_at: '2026-02-01T00:00:00.000Z',
    expires_at: '2030-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

function createInterviewDetail(): InterviewDetail {
  return {
    id: interviewId,
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'ai_led',
    booking_channel: 'ai_direct',
    tier: 'standard',
    status: 'completed',
    scheduled_at: '2026-04-13T10:00:00.000Z',
    recording_url: 'https://legacy.example/r2/object-key',
    screenshot_urls: ['https://legacy.example/r2/screenshots/1'],
    feedback: null,
    recording_status: 'ready',
    transcript: null,
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    screenshots_finalized_at: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: '2026-04-13T09:55:00.000Z',
    updated_at: '2026-04-13T09:55:00.000Z',
  }
}

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function streamOf(bytes: Uint8Array): ReadableStream {
  return new ReadableStream<Uint8Array>({
    start: function start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

function createStorageFake(options: {
  expectedKey: string
  head: { size: number; contentType: string; etag?: string } | null
  objectBytes?: Uint8Array | null
}): ArtifactStoragePort {
  return {
    headArtifact: async function headArtifact(key: string) {
      if (key !== options.expectedKey) {
        throw new Error(`Unexpected artifact storage key for head: ${key}`)
      }

      return options.head
    },
    getObject: function getObject(key: string, range?: R2Range) {
      if (key !== options.expectedKey) {
        throw new Error(`Unexpected artifact storage key for get: ${key}`)
      }

      if (options.objectBytes === undefined || options.objectBytes === null) {
        return Promise.resolve(null)
      }

      const bytes = range
        ? options.objectBytes.slice(range.offset, range.offset + range.length)
        : options.objectBytes

      return Promise.resolve({
        body: streamOf(bytes),
        metadata: {},
        size: options.head?.size,
        contentType: options.head?.contentType,
      })
    },
  } as unknown as ArtifactStoragePort
}

function createMockQueryExecutor(handlers: ExecutorHandlers) {
  return {
    async query<Row>(query: SqlQuery) {
      const normalized = query.text.trim().toUpperCase()

      if (
        normalized === 'BEGIN;' ||
        normalized === 'COMMIT;' ||
        normalized === 'ROLLBACK;'
      ) {
        return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
      }

      validateArtifactQueryValues(query)

      for (const [key, handler] of Object.entries(handlers)) {
        if (query.text.includes(key)) {
          return handler(query) as { rows: Row[]; rowCount: number }
        }
      }

      throw new Error(`Unexpected query: ${query.text}`)
    }
  }
}

function validateArtifactQueryValues(query: SqlQuery): void {
  let expected: readonly unknown[] | null = null

  if (query.text.includes('id = $2')) {
    expected = [interviewId, screenshotId]
  } else if (query.text.includes('playback_recording')) {
    expected = [interviewId]
  } else if (query.text.includes('interview_recordings')) {
    expected = [interviewId]
  } else if (query.text.includes('ORDER BY created_at ASC')) {
    expected = [interviewId]
  }

  if (expected === null) {
    return
  }

  if (query.values.length !== expected.length) {
    throw new Error(
      `Unexpected query parameter count: ${query.values.length} (expected ${expected.length})`,
    )
  }

  for (const [index, expectedValue] of expected.entries()) {
    if (query.values[index] !== expectedValue) {
      throw new Error(
        `Unexpected query parameter at ${index}: ${String(query.values[index])}`,
      )
    }
  }
}

function rows(...values: unknown[]): ExecutorHandler {
  return function handle() {
    return { rows: values, rowCount: values.length }
  }
}

function expectQueryValues(
  expected: readonly unknown[],
  handler: ExecutorHandler,
): ExecutorHandler {
  return function validateQueryValues(query) {
    if (query.values.length !== expected.length) {
      throw new Error(
        `Unexpected query parameter count: ${query.values.length} (expected ${expected.length})`,
      )
    }

    for (const [index, expectedValue] of expected.entries()) {
      if (query.values[index] !== expectedValue) {
        throw new Error(
          `Unexpected query parameter at ${index}: ${String(query.values[index])}`,
        )
      }
    }

    return handler(query)
  }
}

// Handler keys are distinct, stable query fragments: each matches exactly one
// artifact-read query regardless of match order.
function recordingHandlers(): ExecutorHandlers {
  return {
    playback_recording: expectQueryValues([interviewId], rows()),
    interview_recordings: expectQueryValues([interviewId], rows()),
    'id = $2': expectQueryValues([interviewId, screenshotId], rows()),
    'ORDER BY created_at ASC': expectQueryValues([interviewId], rows()),
  }
}

function createInterviewRepositoryStub(
  participantDetail: InterviewDetail | null,
): InterviewRepository {
  return new InterviewRepository({
    getAccountPolicy: async function getAccountPolicy() {
      return null
    },
    createDirectInterview: async function createDirectInterview() {
      throw new Error('Direct interview creation is unused in artifact tests.')
    },
    getParticipantInterviewById: async function getParticipantInterviewById(
      input: GetParticipantInterviewByIdInput,
    ) {
      if (
        input.interview_id !== interviewId ||
        input.participant_user_id !== participantUserId
      ) {
        throw new Error(
          `Unexpected participant lookup: ${input.interview_id}/${input.participant_user_id}`,
        )
      }

      return participantDetail
    },
  } as unknown as ConstructorParameters<typeof InterviewRepository>[0])
}

function createArtifactApp(options: {
  session: InterviewSession | null
  handlers: ExecutorHandlers
  storage: ArtifactStoragePort
  participantDetail?: InterviewDetail | null
  // null registers no artifact read service factory result (route answers 503).
  artifactReadService?: ArtifactReadService | null
}): Hono<{ Bindings: TestBindings }> {
  const app = new Hono<{ Bindings: TestBindings }>()
  const interviewRepository = createInterviewRepositoryStub(
    options.participantDetail === undefined
      ? createInterviewDetail()
      : options.participantDetail,
  )
  const defaultArtifactReadService = new ArtifactReadService(
    new ArtifactReadRepository(
      createMockQueryExecutor(options.handlers) as never,
    ),
    interviewRepository,
    options.storage,
    FIXED_NOW,
  )
  const artifactReadService =
    options.artifactReadService === undefined
      ? defaultArtifactReadService
      : options.artifactReadService

  registerInterviewController(app, {
    createService: function createService() {
      return new InterviewService(interviewRepository)
    },
    resolveSession: function resolveSession() {
      return options.session
    },
    createArtifactReadService: function createArtifactReadService() {
      return artifactReadService ?? undefined
    },
  })

  return app
}

async function getRecording(
  app: Hono<{ Bindings: TestBindings }>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(recordingRoute, { headers })
}

async function getScreenshot(
  app: Hono<{ Bindings: TestBindings }>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(
    `/api/interviews/${interviewId}/artifacts/screenshots/${screenshotId}`,
    { headers },
  )
}

function liveRecordingStorage(): ArtifactStoragePort {
  return createStorageFake({
    expectedKey: recordingObjectKey,
    head: { size: RECORDING_BYTES.length, contentType: 'video/webm', etag: '"rec-etag-1"' },
    objectBytes: toBytes(RECORDING_BYTES),
  })
}

describe('GET /api/interviews/:id/artifacts/recording', function recordingRouteSuite() {
  it('returns 401 without a session', async function run() {
    const app = createArtifactApp({
      session: null,
      handlers: recordingHandlers(),
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('returns 503 when artifact reads are not configured', async function run() {
    const app = createArtifactApp({
      session,
      handlers: recordingHandlers(),
      storage: liveRecordingStorage(),
      artifactReadService: null,
    })

    const response = await getRecording(app)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Artifact reads are not configured.',
    })
  })

  it('returns 404 for a non-participant interview without leaking object keys', async function run() {
    const storage = liveRecordingStorage()
    const app = createArtifactApp({
      session,
      handlers: recordingHandlers(),
      storage,
      participantDetail: null,
    })

    const response = await getRecording(app)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body).toEqual({ error: expect.any(String) })
    expect(JSON.stringify(body)).not.toContain('interviews/')
  })

  it('streams the full recording with stream headers and raw bytes', async function run() {
    const handlers = recordingHandlers()
    handlers.playback_recording = rows(createRecordingRow())
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('video/webm')
    expect(response.headers.get('content-length')).toBe(
      String(RECORDING_BYTES.length),
    )
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="artifact.webm"',
    )
    expect(response.headers.get('etag')).toBe('"rec-etag-1"')
    expect(response.headers.get('content-range')).toBeNull()
    expect(await response.text()).toBe(RECORDING_BYTES)
  })
  it('falls back to the recording media type when metadata and R2 report text/html', async function run() {
    const handlers = recordingHandlers()
    handlers.playback_recording = rows(
      createRecordingRow({ content_metadata: { contentType: 'text/html' } }),
    )
    const app = createArtifactApp({
      session,
      handlers,
      storage: createStorageFake({
        expectedKey: recordingObjectKey,
        head: {
          size: RECORDING_BYTES.length,
          contentType: 'text/html',
          etag: '"rec-etag-unsafe"',
        },
        objectBytes: toBytes(RECORDING_BYTES),
      }),
    })

    const response = await getRecording(app)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('video/webm')
    expect(await response.text()).toBe(RECORDING_BYTES)
  })


  it('does not leak object keys or bucket names in a successful response', async function run() {
    const handlers = recordingHandlers()
    handlers.playback_recording = rows(createRecordingRow())
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app)
    const bodyText = await response.text()
    const headerText = [...response.headers.entries()]
      .map(function headerToString([key, value]) {
        return `${key}: ${value}`
      })
      .join('\n')

    expect(bodyText).not.toContain('interviews/')
    expect(bodyText).not.toContain('recordings/')
    expect(headerText).not.toContain('interviews/')
  })
})

describe('recording range requests', function recordingRangeSuite() {
  const handlers = recordingHandlers()
  handlers.playback_recording = rows(createRecordingRow())

  it('serves a bounded prefix range as 206 with content-range and sliced body', async function run() {
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app, { range: 'bytes=0-9' })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(
      `bytes 0-9/${RECORDING_BYTES.length}`,
    )
    expect(response.headers.get('content-length')).toBe('10')
    expect(await response.text()).toBe(RECORDING_BYTES.slice(0, 10))
  })

  it('clamps an open-ended range to the object tail', async function run() {
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app, { range: 'bytes=10-' })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 10-16/17')
    expect(response.headers.get('content-length')).toBe('7')
    expect(await response.text()).toBe(RECORDING_BYTES.slice(10))
  })

  it('serves a suffix range from the object tail', async function run() {
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app, { range: 'bytes=-4' })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 13-16/17')
    expect(await response.text()).toBe(RECORDING_BYTES.slice(-4))
  })

  it('answers a start beyond the object size with 416 and a content-range trailer', async function run() {
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app, { range: 'bytes=17-' })

    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe(
      `bytes */${RECORDING_BYTES.length}`,
    )
    expect(await response.text()).toBe('')
  })

  it('serves a malformed range as a full 200 response', async function run() {
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app, { range: 'bytes=abc-def' })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(
      String(RECORDING_BYTES.length),
    )
    expect(response.headers.get('content-range')).toBeNull()
    expect(await response.text()).toBe(RECORDING_BYTES)
  })

  it('serves an end-before-start range as a full 200 response', async function run() {
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app, { range: 'bytes=10-2' })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(
      String(RECORDING_BYTES.length),
    )
    expect(response.headers.get('content-range')).toBeNull()
    expect(await response.text()).toBe(RECORDING_BYTES)
  })
})

describe('recording availability states', function recordingAvailabilitySuite() {
  type AvailabilityCase = {
    name: string
    handlers: ExecutorHandlers
    storage: ArtifactStoragePort
    expectedAvailability: string
  }

  function finalizationRow(status: string): unknown {
    return { id: recordingId, finalization_status: status }
  }

  const cases: AvailabilityCase[] = [
    {
      name: 'no artifact row and no recording job is not_created',
      handlers: recordingHandlers(),
      storage: liveRecordingStorage(),
      expectedAvailability: 'not_created',
    },
    {
      name: 'unfinalized artifact row is processing',
      handlers: Object.assign(recordingHandlers(), {
        playback_recording: rows(
          createRecordingRow({ finalized_at: null }),
        ),
      }),
      storage: liveRecordingStorage(),
      expectedAvailability: 'processing',
    },
    {
      name: 'artifact row absent with a pending finalization job is processing',
      handlers: Object.assign(recordingHandlers(), {
        interview_recordings: rows(finalizationRow('pending')),
      }),
      storage: liveRecordingStorage(),
      expectedAvailability: 'processing',
    },
    {
      name: 'artifact row absent with a processing finalization job is processing',
      handlers: Object.assign(recordingHandlers(), {
        interview_recordings: rows(finalizationRow('processing')),
      }),
      storage: liveRecordingStorage(),
      expectedAvailability: 'processing',
    },
    {
      name: 'artifact row absent with a failed finalization job is failed',
      handlers: Object.assign(recordingHandlers(), {
        interview_recordings: rows(finalizationRow('failed')),
      }),
      storage: liveRecordingStorage(),
      expectedAvailability: 'failed',
    },
    {
      name: 'finalized row with a missing storage object is failed',
      handlers: Object.assign(recordingHandlers(), {
        playback_recording: rows(createRecordingRow()),
      }),
      storage: createStorageFake({
        expectedKey: recordingObjectKey,
        head: null,
        objectBytes: toBytes(RECORDING_BYTES),
      }),
      expectedAvailability: 'failed',
    },
    {
      name: 'finalized row whose storage object vanishes between head and get is failed',
      handlers: Object.assign(recordingHandlers(), {
        playback_recording: rows(createRecordingRow()),
      }),
      storage: createStorageFake({
        expectedKey: recordingObjectKey,
        head: { size: RECORDING_BYTES.length, contentType: 'video/webm' },
        objectBytes: null,
      }),
      expectedAvailability: 'failed',
    },
    {
      name: 'expired artifact row is expired',
      handlers: Object.assign(recordingHandlers(), {
        playback_recording: rows(
          createRecordingRow({ expires_at: '2026-01-01T00:00:00.000Z' }),
        ),
      }),
      storage: liveRecordingStorage(),
      expectedAvailability: 'expired',
    },
    {
      name: 'expired artifact row with a null object key is expired',
      handlers: Object.assign(recordingHandlers(), {
        playback_recording: rows(
          createRecordingRow({
            object_key: null,
            expires_at: '2026-01-01T00:00:00.000Z',
          }),
        ),
      }),
      storage: liveRecordingStorage(),
      expectedAvailability: 'expired',
    },
    {
      name: 'tombstoned artifact row with a null object key is expired',
      handlers: Object.assign(recordingHandlers(), {
        playback_recording: rows(
          createRecordingRow({
            object_key: null,
            deleted_at: '2026-03-01T00:00:00.000Z',
          }),
        ),
      }),
      storage: liveRecordingStorage(),
      expectedAvailability: 'expired',
    },
    {
      name: 'deleted artifact row is expired',
      handlers: Object.assign(recordingHandlers(), {
        playback_recording: rows(
          createRecordingRow({
            deleted_at: '2026-03-01T00:00:00.000Z',
          }),
        ),
      }),
      storage: liveRecordingStorage(),
      expectedAvailability: 'expired',
    },
  ]

  for (const availabilityCase of cases) {
    it(`${availabilityCase.name} (409 ${availabilityCase.expectedAvailability})`, async function run() {
      const app = createArtifactApp({
        session,
        handlers: availabilityCase.handlers,
        storage: availabilityCase.storage,
      })

      const response = await getRecording(app)

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        availability: availabilityCase.expectedAvailability,
      })
    })
  }
})

describe('recording finalization status selects the composite job', function finalizationJobSuite() {
  type FinalizationJobSeed = {
    id: string
    recording_type: 'composite' | 'participant_track'
    finalization_status: string
    created_at: string
  }

  const compositeJobId = '77777777-7777-4777-8777-777777777777'
  const participantTrackJobId = '88888888-8888-4888-8888-888888888888'

  // SQL fragment assertions follow the repository-test convention (see
  // credit-repository.test.ts and interviewer-application-repository.test.ts):
  // capture the emitted query and pin the ordering, limiting, and scoping the
  // "newest composite job" contract depends on, because the row-source mock
  // cannot exercise Postgres ordering itself.
  it('orders the composite job query newest-first and limits to one row', async function run() {
    let capturedQuery: SqlQuery | null = null
    const repository = new ArtifactReadRepository({
      query: async function query<Row>(sqlQuery: SqlQuery) {
        capturedQuery = sqlQuery
        return { rows: [] as Row[], rowCount: 0 }
      },
    } as never)

    await repository.getRecordingFinalizationStatus(interviewId)

    expect(capturedQuery).not.toBeNull()
    expect(capturedQuery!.text).toContain("recording_type = 'composite'")
    expect(capturedQuery!.text).toContain('ORDER BY created_at DESC')
    expect(capturedQuery!.text).toContain('LIMIT 1')
  })


  // Emulates the database for the interview_recordings finalization query:
  // rows are stored newest-first per ORDER BY created_at DESC, and a query
  // restricted to the composite recording type only ever returns those rows.
  function finalizationJobHandler(jobs: FinalizationJobSeed[]): ExecutorHandler {
    return function handleFinalizationQuery(query: SqlQuery) {
      const eligible = query.text.includes('recording_type')
        ? jobs.filter((job) => job.recording_type === 'composite')
        : jobs

      return {
        rows: eligible.map((job) => ({
          id: job.id,
          finalization_status: job.finalization_status,
        })),
        rowCount: eligible.length,
      }
    }
  }
  it('returns the first row the executor yields for the composite job query', async function run() {
    const repository = new ArtifactReadRepository({
      query: async function query<Row>() {
        // Executor result order is the database's responsibility (see the
        // ORDER BY fragment assertion above); this only pins rows[0] selection.
        return {
          rows: [
            { id: participantTrackJobId, finalization_status: 'failed' },
            { id: compositeJobId, finalization_status: 'pending' },
          ] as Row[],
          rowCount: 2,
        }
      },
    } as never)

    await expect(repository.getRecordingFinalizationStatus(interviewId)).resolves.toEqual({
      id: participantTrackJobId,
      finalization_status: 'failed',
    })
  })

  function createRepository(jobs: FinalizationJobSeed[]): ArtifactReadRepository {
    return new ArtifactReadRepository(
      createMockQueryExecutor({
        interview_recordings: finalizationJobHandler(jobs),
      }) as never,
    )
  }

  it('returns the composite job when a newer participant_track job exists', async function run() {
    const repository = createRepository([
      {
        id: participantTrackJobId,
        recording_type: 'participant_track',
        finalization_status: 'failed',
        created_at: '2026-03-01T00:00:00.000Z',
      },
      {
        id: compositeJobId,
        recording_type: 'composite',
        finalization_status: 'pending',
        created_at: '2026-02-01T00:00:00.000Z',
      },
    ])

    await expect(repository.getRecordingFinalizationStatus(interviewId)).resolves.toEqual({
      id: compositeJobId,
      finalization_status: 'pending',
    })
  })

  it('selects the composite job from newest-first seeded rows when several composite rows exist', async function run() {
    const repository = createRepository([
      {
        id: participantTrackJobId,
        recording_type: 'composite',
        finalization_status: 'failed',
        created_at: '2026-03-01T00:00:00.000Z',
      },
      {
        id: compositeJobId,
        recording_type: 'composite',
        finalization_status: 'pending',
        created_at: '2026-02-01T00:00:00.000Z',
      },
    ])

    await expect(repository.getRecordingFinalizationStatus(interviewId)).resolves.toEqual({
      id: participantTrackJobId,
      finalization_status: 'failed',
    })
  })
})

describe('recording conditional requests', function conditionalRequestSuite() {
  const handlers = Object.assign(recordingHandlers(), {
    playback_recording: rows(createRecordingRow()),
  })

  it('returns 304 with the etag when if-none-match matches', async function run() {
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app, {
      'if-none-match': '"rec-etag-1"',
    })

    expect(response.status).toBe(304)
    expect(response.headers.get('etag')).toBe('"rec-etag-1"')
    expect(await response.text()).toBe('')
  })

  it('matches wildcard, weak, and list if-none-match forms', async function run() {
    const matchingForms = [
      '*',
      ' W/"rec-etag-1" ',
      '"other-etag", "rec-etag-1"',
    ]

    for (const ifNoneMatch of matchingForms) {
      const app = createArtifactApp({
        session,
        handlers,
        storage: liveRecordingStorage(),
      })

      const response = await getRecording(app, { 'if-none-match': ifNoneMatch })

      expect(response.status).toBe(304)
    }
  })

  it('streams the full body when if-none-match does not match', async function run() {
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app, {
      'if-none-match': '"different-etag"',
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(RECORDING_BYTES)
  })
})

describe('recording If-Range requests', function ifRangeSuite() {
  const handlers = Object.assign(recordingHandlers(), {
    playback_recording: rows(createRecordingRow()),
  })

  it('keeps a bounded range when If-Range matches the current strong ETag', async function run() {
    const app = createArtifactApp({
      session,
      handlers,
      storage: liveRecordingStorage(),
    })

    const response = await getRecording(app, {
      range: 'bytes=0-9',
      'if-range': '"rec-etag-1"',
    })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 0-9/17')
    expect(await response.text()).toBe(RECORDING_BYTES.slice(0, 10))
  })

  const fallbackCases: Array<{
    name: string
    ifRange: string
    storage?: ArtifactStoragePort
  }> = [
    { name: 'nonmatching strong ETag', ifRange: '"different-etag"' },
    { name: 'weak ETag', ifRange: 'W/"rec-etag-1"' },
    { name: 'malformed validator', ifRange: '"rec-etag-1' },
    { name: 'date validator', ifRange: 'Wed, 21 Oct 2015 07:28:00 GMT' },
    {
      name: 'any validator when current ETag is unavailable',
      ifRange: '"rec-etag-1"',
      storage: createStorageFake({
        expectedKey: recordingObjectKey,
        head: { size: RECORDING_BYTES.length, contentType: 'video/webm' },
        objectBytes: toBytes(RECORDING_BYTES),
      }),
    },
  ]

  for (const fallbackCase of fallbackCases) {
    it(`falls back to full response for ${fallbackCase.name}`, async function run() {
      const app = createArtifactApp({
        session,
        handlers,
        storage: fallbackCase.storage ?? liveRecordingStorage(),
      })

      const response = await getRecording(app, {
        range: 'bytes=0-9',
        'if-range': fallbackCase.ifRange,
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-range')).toBeNull()
      expect(response.headers.get('content-length')).toBe(String(RECORDING_BYTES.length))
      expect(await response.text()).toBe(RECORDING_BYTES)
    })
  }
})

describe('GET /api/interviews/:id/artifacts/screenshots/:captureId', function screenshotRouteSuite() {
  function liveScreenshotStorage(): ArtifactStoragePort {
    return createStorageFake({
      expectedKey: screenshotObjectKey,
      head: {
        size: SCREENSHOT_BYTES.length,
        contentType: 'image/png',
        etag: '"shot-etag-1"',
      },
      objectBytes: toBytes(SCREENSHOT_BYTES),
    })
  }

  function screenshotHandlers(): ExecutorHandlers {
    return Object.assign(recordingHandlers(), {
      'id = $2': rows(createScreenshotRow()),
    })
  }

  it('returns 401 without a session', async function run() {
    const app = createArtifactApp({
      session: null,
      handlers: screenshotHandlers(),
      storage: liveScreenshotStorage(),
    })

    const response = await getScreenshot(app)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('streams the screenshot with png headers', async function run() {
    const app = createArtifactApp({
      session,
      handlers: screenshotHandlers(),
      storage: liveScreenshotStorage(),
    })

    const response = await getScreenshot(app)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-length')).toBe(
      String(SCREENSHOT_BYTES.length),
    )
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="artifact.png"',
    )
    expect(response.headers.get('etag')).toBe('"shot-etag-1"')
    expect(await response.text()).toBe(SCREENSHOT_BYTES)
  })
  it('falls back to the screenshot media type when metadata and R2 report text/html', async function run() {
    const app = createArtifactApp({
      session,
      handlers: Object.assign(recordingHandlers(), {
        'id = $2': rows(
          createScreenshotRow({ content_metadata: { contentType: 'text/html' } }),
        ),
      }),
      storage: createStorageFake({
        expectedKey: screenshotObjectKey,
        head: {
          size: SCREENSHOT_BYTES.length,
          contentType: 'text/html',
          etag: '"shot-etag-unsafe"',
        },
        objectBytes: toBytes(SCREENSHOT_BYTES),
      }),
    })

    const response = await getScreenshot(app)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe(SCREENSHOT_BYTES)
  })

  it('streams an unfinalized screenshot as 200 while recordings are withheld', async function run() {
    const app = createArtifactApp({
      session,
      handlers: Object.assign(recordingHandlers(), {
        'id = $2': rows(createScreenshotRow({ finalized_at: null })),
      }),
      storage: liveScreenshotStorage(),
    })

    const response = await getScreenshot(app)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe(SCREENSHOT_BYTES)
  })

  it('returns 400 for a non-uuid capture id', async function run() {
    const app = createArtifactApp({
      session,
      handlers: screenshotHandlers(),
      storage: liveScreenshotStorage(),
    })

    const response = await app.request(
      `/api/interviews/${interviewId}/artifacts/screenshots/not-a-uuid`,
    )

    expect(response.status).toBe(400)
  })

  it('returns 409 not_created when the capture id resolves to no row', async function run() {
    const app = createArtifactApp({
      session,
      handlers: recordingHandlers(),
      storage: liveScreenshotStorage(),
    })

    const response = await getScreenshot(app)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ availability: 'not_created' })
  })

  it('returns 409 expired when the screenshot row is expired', async function run() {
    const app = createArtifactApp({
      session,
      handlers: Object.assign(recordingHandlers(), {
        'id = $2': rows(
          createScreenshotRow({ expires_at: '2026-01-01T00:00:00.000Z' }),
        ),
      }),
      storage: liveScreenshotStorage(),
    })

    const response = await getScreenshot(app)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ availability: 'expired' })
  })
  for (const [state, override] of [
    ['expired', { object_key: null, expires_at: '2026-01-01T00:00:00.000Z' }],
    ['tombstoned', { object_key: null, deleted_at: '2026-03-01T00:00:00.000Z' }],
  ] as const) {
    it(`returns 409 expired for a null-key ${state} screenshot row`, async function run() {
      const app = createArtifactApp({
        session,
        handlers: Object.assign(recordingHandlers(), {
          'id = $2': rows(createScreenshotRow(override)),
        }),
        storage: liveScreenshotStorage(),
      })

      const response = await getScreenshot(app)

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ availability: 'expired' })
    })
  }


  it('returns 409 not_created when a live screenshot row has no storage object', async function run() {
    const app = createArtifactApp({
      session,
      handlers: screenshotHandlers(),
      storage: createStorageFake({
        expectedKey: screenshotObjectKey,
        head: null,
        objectBytes: toBytes(SCREENSHOT_BYTES),
      }),
    })

    const response = await getScreenshot(app)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ availability: 'not_created' })
  })
})

describe('interview detail artifact URL mapping', function detailMappingSuite() {
  function createMappingExecutor(
    recordingRow: ReadableArtifactRow | null,
    screenshotRows: ReadableArtifactRow[],
  ) {
    return createMockQueryExecutor({
      playback_recording: recordingRow === null ? rows() : rows(recordingRow),
      'ORDER BY created_at ASC': rows(...screenshotRows),
    } as ExecutorHandlers)
  }

  function createDetailService(executor: unknown): InterviewService {
    const urlSource = createInterviewArtifactUrlSource(
      new ArtifactReadRepository(executor as never),
      FIXED_NOW,
    )

    return new InterviewService(
      createInterviewRepositoryStub(createInterviewDetail()),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      urlSource,
    )
  }

  it('overwrites legacy recording_url and screenshot_urls with route URLs for live artifacts', async function run() {
    const screenshotRows = [
      createScreenshotRow(),
      createScreenshotRow({
        id: secondScreenshotId,
        object_key: `interviews/${interviewId}/screenshots/${secondScreenshotId}`,
      }),
    ]
    const service = createDetailService(
      createMappingExecutor(createRecordingRow(), screenshotRows),
    )

    const result = await service.getInterview(session, { id: interviewId })

    expect(result.interview.recording_url).toBe(
      `/api/interviews/${interviewId}/artifacts/recording`,
    )
    expect(result.interview.screenshot_urls).toEqual([
      screenshotRouteUrl(interviewId, screenshotId),
      screenshotRouteUrl(interviewId, secondScreenshotId),
    ])
  })
  it('keeps unfinalized screenshots live while withholding unfinalized recordings', async function run() {
    const service = createDetailService(
      createMappingExecutor(
        createRecordingRow({ finalized_at: null }),
        [createScreenshotRow({ finalized_at: null })],
      ),
    )

    const result = await service.getInterview(session, { id: interviewId })

    expect(result.interview.recording_url).toBeNull()
    expect(result.interview.screenshot_urls).toEqual([
      screenshotRouteUrl(interviewId, screenshotId),
    ])
  })


  it('maps expired artifacts to null recording_url and empty screenshot_urls', async function run() {
    const service = createDetailService(
      createMappingExecutor(
        createRecordingRow({ expires_at: '2026-01-01T00:00:00.000Z' }),
        [
          createScreenshotRow({
            expires_at: '2026-01-01T00:00:00.000Z',
          }),
        ],
      ),
    )

    const result = await service.getInterview(session, { id: interviewId })

    expect(result.interview.recording_url).toBeNull()
    expect(result.interview.screenshot_urls).toBeNull()
  })

  it('filters tombstoned screenshots while keeping live ones in row order', async function run() {
    const service = createDetailService(
      createMappingExecutor(createRecordingRow(), [
        createScreenshotRow({
          deleted_at: '2026-03-01T00:00:00.000Z',
        }),
        createScreenshotRow({
          id: secondScreenshotId,
          object_key: `interviews/${interviewId}/screenshots/${secondScreenshotId}`,
        }),
      ]),
    )

    const result = await service.getInterview(session, { id: interviewId })

    expect(result.interview.recording_url).toBe(
      `/api/interviews/${interviewId}/artifacts/recording`,
    )
    expect(result.interview.screenshot_urls).toEqual([
      screenshotRouteUrl(interviewId, secondScreenshotId),
    ])
  })

  it('filters rows with a null object key out of the detail URL mapping', async function run() {
    const service = createDetailService(
      createMappingExecutor(createRecordingRow({ object_key: null }), [
        createScreenshotRow({ object_key: null }),
        createScreenshotRow({
          id: secondScreenshotId,
          object_key: `interviews/${interviewId}/screenshots/${secondScreenshotId}`,
        }),
      ]),
    )

    const result = await service.getInterview(session, { id: interviewId })

    expect(result.interview.recording_url).toBeNull()
    expect(result.interview.screenshot_urls).toEqual([
      screenshotRouteUrl(interviewId, secondScreenshotId),
    ])
  })
})

describe('service-level participant authorization', function serviceAuthSuite() {
  it('rejects a null session with InterviewNotFoundError', async function run() {
    const service = new ArtifactReadService(
      new ArtifactReadRepository(
        createMockQueryExecutor(recordingHandlers()) as never,
      ),
      createInterviewRepositoryStub(createInterviewDetail()),
      liveRecordingStorage(),
      FIXED_NOW,
    )

    await expect(service.streamRecording(null, interviewId)).rejects.toThrow(
      InterviewNotFoundError,
    )
    await expect(
      service.streamScreenshot(null, interviewId, screenshotId),
    ).rejects.toThrow(InterviewNotFoundError)
  })
})
