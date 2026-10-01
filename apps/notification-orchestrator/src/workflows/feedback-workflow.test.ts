import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InterviewFeedbackWorkflow,
  STEP_ANALYSIS,
  STEP_ARTIFACT_READINESS,
  STEP_ELIGIBILITY_LOAD,
  STEP_PROCESSING_CLAIM,
  STEP_SCREENSHOT_READINESS,
  STEP_TERMINAL_FAILURE,
  STEP_TERMINAL_UNAVAILABLE,
  STEP_TRANSCRIPTION,
  feedbackWorkflowPayloadSchema,
} from './feedback-workflow'
import type { WorkerBindings } from '../index'
import {
  FeedbackAnalysisRepository,
  FeedbackAnalysisService,
  FeedbackWorkflowRepository,
  InterviewRepository,
  logFeedbackWorkflowEvent,
  TranscriptionService,
  type InterviewFeedbackState,
} from '@mako/shared-backend'

vi.mock('@mako/shared-backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mako/shared-backend')>()
  return {
    ...actual,
    createPostgresConnectionPool: vi.fn(),
    InterviewRepository: vi.fn(),
    FeedbackWorkflowRepository: vi.fn(),
    TranscriptionRepository: vi.fn(),
    TranscriptionChunkRepository: vi.fn(),
    TranscriptionService: vi.fn(),
    FeedbackAnalysisRepository: vi.fn(),
    FeedbackAnalysisService: vi.fn(),
    createWorkersAiTranscriptionAdapter: vi.fn(() => ({})),
    createAiGatewayFeedbackAnalysisAdapter: vi.fn(() => ({})),
    createArtifactStorage: vi.fn(() => ({})),
    createR2BucketPort: vi.fn(() => ({})),
    logFeedbackWorkflowEvent: vi.fn(),
  }
})

const VALID_PAYLOAD = {
  interview_id: '11111111-1111-4111-8111-111111111111',
  schema_version: 1,
}

describe('feedbackWorkflowPayloadSchema', function () {
  it('accepts a valid payload', function () {
    const parsed = feedbackWorkflowPayloadSchema.parse(VALID_PAYLOAD)

    expect(parsed).toEqual(VALID_PAYLOAD)
  })

  it('rejects a payload missing interview_id', function () {
    const { interview_id: _interviewId, ...missingInterviewId } = VALID_PAYLOAD

    const result = feedbackWorkflowPayloadSchema.safeParse(missingInterviewId)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1)
      expect(result.error.issues[0].path).toEqual(['interview_id'])
      expect(result.error.issues[0].message).toContain('Required')
    }
  })

  it('rejects a non-uuid interview_id', function () {
    const result = feedbackWorkflowPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      interview_id: 'not-a-uuid',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1)
      expect(result.error.issues[0].path).toEqual(['interview_id'])
      expect(result.error.issues[0].message).toContain('uuid')
    }
  })

  it('rejects a payload missing schema_version', function () {
    const { schema_version: _schemaVersion, ...missingSchemaVersion } = VALID_PAYLOAD

    const result = feedbackWorkflowPayloadSchema.safeParse(missingSchemaVersion)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1)
      expect(result.error.issues[0].path).toEqual(['schema_version'])
      expect(result.error.issues[0].message).toContain('Required')
    }
  })

  it('rejects a non-positive schema_version', function () {
    const result = feedbackWorkflowPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      schema_version: 0,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1)
      expect(result.error.issues[0].path).toEqual(['schema_version'])
      expect(result.error.issues[0].message).toContain('greater than 0')
    }
  })

  it('rejects unknown keys (strict)', function () {
    const result = feedbackWorkflowPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      unexpected_key: 'should not be allowed',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1)
      expect(result.error.issues[0].message).toContain('Unrecognized')
      expect(result.error.issues[0].message).toContain('unexpected_key')
    }
  })
})

const MOCKED_INTERVIEW_ID = VALID_PAYLOAD.interview_id

function buildInterviewState(
  overrides: Partial<Pick<InterviewFeedbackState, 'feedback_status' | 'mode'>> = {},
): InterviewFeedbackState {
  return {
    id: MOCKED_INTERVIEW_ID,
    status: 'completed',
    recording_status: 'ready',
    feedback_status: 'pending',
    feedback_unavailable_reason: null,
    screenshots_finalized_at: '2026-08-08T00:00:00.000Z',
    type: 'behavioral',
    mode: 'ai_led',
    tier: 'standard',
    scheduler_alias: 'scheduler-1',
    ...overrides,
  }
}

function createMockEnv(overrides: Partial<WorkerBindings> = {}): WorkerBindings {
  return {
    HYPERDRIVE: { connectionString: 'postgres://test' },
    NOTIFICATION_QUEUE: {} as never,
    AI: {} as never,
    RECORDINGS_BUCKET: {} as never,
    SCREENSHOTS_BUCKET: {} as never,
    CLOUDFLARE_ACCOUNT_ID: 'account-1',
    CLOUDFLARE_API_TOKEN: 'token-1',
    ...overrides,
  }
}

function createMockEvent(payload: { interview_id: string; schema_version: number }) {
  return {
    payload,
    timestamp: new Date(),
    instanceId: 'feedback-v1-test-instance',
    workflowName: 'feedback-workflow',
  }
}

function createMockExecutionContext(): ExecutionContext {
  return {} as ExecutionContext
}

function createWorkflow(env: WorkerBindings = createMockEnv()) {
  return new InterviewFeedbackWorkflow(createMockExecutionContext(), env)
}

type TrackingStepResult = { name: string; result?: unknown; error?: unknown }

/**
 * A step.do harness that actually honors `WorkflowStepConfig.retries.limit`
 * so tests can exercise bounded-retry exhaustion, and stops immediately on a
 * `NonRetryableError`-shaped rejection (name === 'FeedbackWorkflowSignal'),
 * mirroring real Workflows semantics closely enough for unit tests.
 */
function createTrackingStep() {
  const steps: TrackingStepResult[] = []

  const step = {
    async do(name: string, configOrCallback: unknown, maybeCallback?: unknown) {
      const isConfig = typeof configOrCallback !== 'function'
      const config = isConfig
        ? (configOrCallback as { retries?: { limit: number } } | undefined)
        : undefined
      const callback = (isConfig ? maybeCallback : configOrCallback) as (ctx: {
        attempt: number
      }) => Promise<unknown>
      const limit = config?.retries?.limit ?? 0

      let lastError: unknown
      for (let attempt = 1; attempt <= limit + 1; attempt += 1) {
        try {
          const result = await callback({ attempt })
          steps.push({ name, result })
          return result
        } catch (error) {
          lastError = error
          if (error instanceof Error && error.name === 'FeedbackWorkflowSignal') {
            break
          }
        }
      }
      steps.push({ name, error: lastError })
      throw lastError
    },
    async sleep() {},
    async sleepUntil() {},
  }

  return {
    step: step as unknown as import('cloudflare:workers').WorkflowStep,
    steps,
  }
}

function stepResult(steps: TrackingStepResult[], name: string): unknown {
  return steps.find((step) => step.name === name)?.result
}

function stepRan(steps: TrackingStepResult[], name: string): boolean {
  return steps.some((step) => step.name === name)
}

function mockInterviewState(state: InterviewFeedbackState | null) {
  const getInterviewFeedbackState = vi.fn().mockResolvedValue(state)
  vi.mocked(InterviewRepository).mockImplementation(
    () =>
      ({
        getInterviewFeedbackState,
      }) as unknown as InstanceType<typeof InterviewRepository>,
  )
  return getInterviewFeedbackState
}

type MockWorkflowRepositoryOverrides = Partial<{
  claimProcessing: ReturnType<typeof vi.fn>
  listRecordingJobs: ReturnType<typeof vi.fn>
  getScreenshotFinalizationState: ReturnType<typeof vi.fn>
  refreshHeartbeat: ReturnType<typeof vi.fn>
  markFailed: ReturnType<typeof vi.fn>
  markUnavailable: ReturnType<typeof vi.fn>
}>

function mockWorkflowRepository(overrides: MockWorkflowRepositoryOverrides = {}) {
  const mockRepository = {
    claimProcessing: vi.fn().mockResolvedValue(true),
    listRecordingJobs: vi
      .fn()
      .mockResolvedValue([{ recording_type: 'participant_track', finalization_status: 'finalized', error_code: null }]),
    getScreenshotFinalizationState: vi
      .fn()
      .mockResolvedValue({ screenshots_finalized_at: '2026-08-08T00:00:00.000Z' }),
    refreshHeartbeat: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    markUnavailable: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
  vi.mocked(FeedbackWorkflowRepository).mockImplementation(
    () => mockRepository as unknown as InstanceType<typeof FeedbackWorkflowRepository>,
  )
  return mockRepository
}

const READY_TRACKS = [{ participantRole: 'candidate', objectKey: 'k', contentType: 'audio/mp4', size: 10 }]

type MockTranscriptionServiceOverrides = Partial<{
  checkReadiness: ReturnType<typeof vi.fn>
  transcribeAndPersist: ReturnType<typeof vi.fn>
}>

function mockTranscriptionService(overrides: MockTranscriptionServiceOverrides = {}) {
  const mockService = {
    checkReadiness: vi.fn().mockResolvedValue({ outcome: 'ready', tracks: READY_TRACKS }),
    transcribeAndPersist: vi
      .fn()
      .mockResolvedValue({ outcome: 'persisted', transcript: '[Candidate]\nHello world.' }),
    ...overrides,
  }
  vi.mocked(TranscriptionService).mockImplementation(
    () => mockService as unknown as InstanceType<typeof TranscriptionService>,
  )
  return mockService
}

const VALID_FEEDBACK = {
  schema_version: 1,
  overall_score: 80,
  summary: 'Solid session.',
  dimensions: {
    communication: { score: 80, summary: 'Clear.' },
    problem_solving: { score: 80, summary: 'Methodical.' },
    technical_depth: { score: 80, summary: 'Solid.' },
  },
  strengths: [],
  improvements: [],
}

type MockAnalysisServiceOverrides = Partial<{ run: ReturnType<typeof vi.fn> }>

function mockAnalysisService(overrides: MockAnalysisServiceOverrides = {}) {
  const mockService = {
    run: vi.fn().mockResolvedValue({ outcome: 'persisted', feedback: VALID_FEEDBACK }),
    ...overrides,
  }
  vi.mocked(FeedbackAnalysisService).mockImplementation(
    () => mockService as unknown as InstanceType<typeof FeedbackAnalysisService>,
  )
  return mockService
}

function mockAnalysisRepositoryScreenshots(
  rows: Array<{ content_size_bytes: number | null }>,
) {
  vi.mocked(FeedbackAnalysisRepository).mockImplementation(
    () =>
      ({
        listFinalizedScreenshots: vi.fn().mockResolvedValue(rows),
      }) as unknown as InstanceType<typeof FeedbackAnalysisRepository>,
  )
}

/** Wires up a fully "happy path" set of mocks; individual tests override pieces. */
function mockHappyPath() {
  mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
  const workflowRepository = mockWorkflowRepository()
  const transcriptionService = mockTranscriptionService()
  const analysisService = mockAnalysisService()
  return { workflowRepository, transcriptionService, analysisService }
}

describe('InterviewFeedbackWorkflow', function () {
  beforeEach(function () {
    vi.clearAllMocks()
  })

  afterEach(function () {
    vi.restoreAllMocks()
  })

  describe('loadEligibility step', function () {
    it('returns skipped/not_found when interview does not exist', async function () {
      const getInterviewFeedbackState = mockInterviewState(null)
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(getInterviewFeedbackState).toHaveBeenCalledWith(MOCKED_INTERVIEW_ID)
      expect(result).toEqual({ status: 'skipped', reason: 'not_found' })
      expect(steps).toEqual([
        { name: STEP_ELIGIBILITY_LOAD, result: { eligible: false, reason: 'not_found' } },
      ])
    })

    it('returns skipped/already_ready when feedback_status is ready', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'ready' }))
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', reason: 'already_ready' })
    })

    it('returns skipped/already_processing when feedback_status is processing', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'processing' }))
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', reason: 'already_processing' })
    })

    it('returns skipped/previously_failed when feedback_status is failed', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'failed' }))
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', reason: 'previously_failed' })
    })

    it('returns skipped/not_pending when feedback_status is not_started', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'not_started' }))
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', reason: 'not_pending' })
    })

    it('logs the received event with the schema version before any step runs', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'ready' }))
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(logFeedbackWorkflowEvent).toHaveBeenCalledWith(
        'received',
        expect.objectContaining({ interviewId: MOCKED_INTERVIEW_ID, schemaVersion: 1 }),
      )
    })
  })

  describe('claimWork step', function () {
    it('returns skipped/already_claimed when the claim fails', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository({ claimProcessing: vi.fn().mockResolvedValue(false) })
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', reason: 'already_claimed' })
      expect(workflowRepository.claimProcessing).toHaveBeenCalledWith(
        MOCKED_INTERVIEW_ID,
        expect.any(String),
        expect.any(String),
      )
      expect(steps.map((entry) => entry.name)).toEqual([STEP_ELIGIBILITY_LOAD, STEP_PROCESSING_CLAIM])
    })

    it('logs the claimed event once the claim succeeds', async function () {
      mockHappyPath()
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(logFeedbackWorkflowEvent).toHaveBeenCalledWith(
        'claimed',
        expect.objectContaining({ interviewId: MOCKED_INTERVIEW_ID }),
      )
    })
  })

  describe('happy path', function () {
    it('runs every step through to a ready result', async function () {
      const { workflowRepository, transcriptionService, analysisService } = mockHappyPath()
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'ready',
        interview_id: MOCKED_INTERVIEW_ID,
        attempt_id: expect.any(String),
      })
      expect(steps.map((entry) => entry.name)).toEqual([
        STEP_ELIGIBILITY_LOAD,
        STEP_PROCESSING_CLAIM,
        STEP_ARTIFACT_READINESS,
        STEP_SCREENSHOT_READINESS,
        'feedback-heartbeat-pre-transcription',
        STEP_TRANSCRIPTION,
        'feedback-heartbeat-pre-analysis',
        STEP_ANALYSIS,
      ])
      expect(transcriptionService.transcribeAndPersist).toHaveBeenCalledWith({
        interviewId: MOCKED_INTERVIEW_ID,
        attemptId: expect.any(String),
        tracks: READY_TRACKS,
      })
      expect(analysisService.run).toHaveBeenCalledWith({
        interviewId: MOCKED_INTERVIEW_ID,
        attemptId: expect.any(String),
      })
      expect(workflowRepository.markFailed).not.toHaveBeenCalled()
      expect(workflowRepository.markUnavailable).not.toHaveBeenCalled()
      expect(logFeedbackWorkflowEvent).toHaveBeenCalledWith(
        'transcribed',
        expect.objectContaining({ transcriptChars: '[Candidate]\nHello world.'.length }),
      )
      expect(logFeedbackWorkflowEvent).toHaveBeenCalledWith(
        'analysis_started',
        expect.objectContaining({ interviewId: MOCKED_INTERVIEW_ID }),
      )
      expect(logFeedbackWorkflowEvent).toHaveBeenCalledWith(
        'ready',
        expect.objectContaining({ interviewId: MOCKED_INTERVIEW_ID, schemaVersion: 1 }),
      )
    })

    it('skips transcription and uses the reused transcript when one already exists', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      mockWorkflowRepository()
      const transcriptionService = mockTranscriptionService({
        checkReadiness: vi.fn().mockResolvedValue({ outcome: 'reused', transcript: '[Candidate]\nReused.' }),
      })
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result.status).toBe('ready')
      expect(stepRan(steps, STEP_TRANSCRIPTION)).toBe(false)
      expect(stepRan(steps, STEP_SCREENSHOT_READINESS)).toBe(false)
      expect(transcriptionService.transcribeAndPersist).not.toHaveBeenCalled()
    })

    it('continues with an empty/unfinalized screenshot set rather than failing', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      mockWorkflowRepository({
        getScreenshotFinalizationState: vi.fn().mockResolvedValue({ screenshots_finalized_at: null }),
      })
      mockTranscriptionService()
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result.status).toBe('ready')
    })

    it('emits duration and aggregate screenshot count/byte telemetry without content', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      mockWorkflowRepository()
      mockTranscriptionService()
      mockAnalysisService()
      mockAnalysisRepositoryScreenshots([{ content_size_bytes: 1000 }, { content_size_bytes: 2000 }])
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(logFeedbackWorkflowEvent).toHaveBeenCalledWith(
        'analysis_started',
        expect.objectContaining({ screenshotCount: 2, screenshotBytes: 3000 }),
      )
      expect(logFeedbackWorkflowEvent).toHaveBeenCalledWith(
        'transcribed',
        expect.objectContaining({ durationMs: expect.any(Number) }),
      )
      expect(logFeedbackWorkflowEvent).toHaveBeenCalledWith(
        'ready',
        expect.objectContaining({ durationMs: expect.any(Number) }),
      )
    })
  })

  describe('artifact readiness: no_recording / format / mapping', function () {
    it('transitions to not_started/no_recording when no interview_recordings rows exist', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository({ listRecordingJobs: vi.fn().mockResolvedValue([]) })
      mockTranscriptionService()
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'not_started',
        interview_id: MOCKED_INTERVIEW_ID,
        unavailable_reason: 'no_recording',
      })
      expect(workflowRepository.markUnavailable).toHaveBeenCalledWith(
        MOCKED_INTERVIEW_ID,
        expect.any(String),
        'no_recording',
      )
      expect(logFeedbackWorkflowEvent).toHaveBeenCalledWith(
        'unavailable',
        expect.objectContaining({ unavailableReason: 'no_recording' }),
      )
    })

    it('transitions to not_started/unsupported_format on a terminal mapping_error', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository({
        listRecordingJobs: vi
          .fn()
          .mockResolvedValue([{ recording_type: 'participant_track', finalization_status: 'failed', error_code: 'mapping_error' }]),
      })
      mockTranscriptionService()
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'not_started',
        interview_id: MOCKED_INTERVIEW_ID,
        unavailable_reason: 'unsupported_format',
      })
      expect(workflowRepository.markUnavailable).toHaveBeenCalledWith(
        MOCKED_INTERVIEW_ID,
        expect.any(String),
        'unsupported_format',
      )
    })

    it('transitions to not_started/unsupported_format when the track content type is unsupported', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository()
      mockTranscriptionService({
        checkReadiness: vi.fn().mockResolvedValue({ outcome: 'unsupported_format' }),
      })
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'not_started',
        interview_id: MOCKED_INTERVIEW_ID,
        unavailable_reason: 'unsupported_format',
      })
      expect(workflowRepository.markUnavailable).toHaveBeenCalled()
    })

    it('fails fast with assets_not_ready on a terminal infrastructure failure, without exhausting the wait budget', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository({
        listRecordingJobs: vi
          .fn()
          .mockResolvedValue([{ recording_type: 'participant_track', finalization_status: 'failed', error_code: 'provider_error' }]),
      })
      const transcriptionService = mockTranscriptionService()
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'failed',
        interview_id: MOCKED_INTERVIEW_ID,
        error_code: 'assets_not_ready',
      })
      expect(workflowRepository.markFailed).toHaveBeenCalledWith(
        MOCKED_INTERVIEW_ID,
        expect.any(String),
        'assets_not_ready',
      )
      // Only one attempt was made; the infrastructure failure is deterministic.
      expect(steps.filter((s) => s.name === STEP_ARTIFACT_READINESS)).toHaveLength(1)
      expect(transcriptionService.checkReadiness).not.toHaveBeenCalled()
    })
  })

  describe('artifact readiness: bounded waiting', function () {
    it('retries while not_ready and eventually surfaces assets_not_ready once the bounded wait is exhausted', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository()
      mockTranscriptionService({ checkReadiness: vi.fn().mockResolvedValue({ outcome: 'not_ready' }) })
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'failed',
        interview_id: MOCKED_INTERVIEW_ID,
        error_code: 'assets_not_ready',
      })
      expect(workflowRepository.markFailed).toHaveBeenCalledWith(
        MOCKED_INTERVIEW_ID,
        expect.any(String),
        'assets_not_ready',
      )
      // waiting_for_assets is emitted on every attempt while not ready.
      const waitingCalls = vi
        .mocked(logFeedbackWorkflowEvent)
        .mock.calls.filter(([event]) => event === 'waiting_for_assets')
      expect(waitingCalls.length).toBeGreaterThan(1)
    })

    it('proceeds once a later attempt reports ready', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      mockWorkflowRepository()
      let calls = 0
      const transcriptionService = mockTranscriptionService({
        checkReadiness: vi.fn().mockImplementation(async () => {
          calls += 1
          return calls < 3 ? { outcome: 'not_ready' } : { outcome: 'ready', tracks: READY_TRACKS }
        }),
      })
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result.status).toBe('ready')
      expect(transcriptionService.checkReadiness).toHaveBeenCalledTimes(3)
    })

    it('stops immediately (skipped/stale) when another attempt has already claimed the interview', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository()
      mockTranscriptionService({ checkReadiness: vi.fn().mockResolvedValue({ outcome: 'stale' }) })
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', interview_id: MOCKED_INTERVIEW_ID, reason: 'stale' })
      expect(workflowRepository.markFailed).not.toHaveBeenCalled()
      expect(workflowRepository.markUnavailable).not.toHaveBeenCalled()
      expect(steps.filter((s) => s.name === STEP_ARTIFACT_READINESS)).toHaveLength(1)
    })
  })

  describe('heartbeat / stale-attempt fencing', function () {
    it('stops before transcription when the heartbeat refresh reports a stale attempt', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository({ refreshHeartbeat: vi.fn().mockResolvedValue(false) })
      const transcriptionService = mockTranscriptionService()
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', interview_id: MOCKED_INTERVIEW_ID, reason: 'stale' })
      expect(transcriptionService.transcribeAndPersist).not.toHaveBeenCalled()
      expect(workflowRepository.markFailed).not.toHaveBeenCalled()
    })
  })

  describe('transcription outcomes', function () {
    it('marks failed/transcription_failed when transcription cannot produce usable output', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository()
      mockTranscriptionService({
        transcribeAndPersist: vi.fn().mockResolvedValue({ outcome: 'failed', error_code: 'transcription_failed' }),
      })
      const analysisService = mockAnalysisService()
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'failed',
        interview_id: MOCKED_INTERVIEW_ID,
        error_code: 'transcription_failed',
      })
      expect(workflowRepository.markFailed).toHaveBeenCalledWith(
        MOCKED_INTERVIEW_ID,
        expect.any(String),
        'transcription_failed',
      )
      expect(analysisService.run).not.toHaveBeenCalled()
      expect(logFeedbackWorkflowEvent).toHaveBeenCalledWith(
        'failed',
        expect.objectContaining({ errorCode: 'transcription_failed', durationMs: expect.any(Number) }),
      )
    })

    it('stops (skipped/stale) when transcription persistence detects a replaced attempt', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository()
      mockTranscriptionService({
        transcribeAndPersist: vi.fn().mockResolvedValue({ outcome: 'stale' }),
      })
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', interview_id: MOCKED_INTERVIEW_ID, reason: 'stale' })
      expect(workflowRepository.markFailed).not.toHaveBeenCalled()
    })
  })

  describe('analysis outcomes', function () {
    it('recovers and succeeds when a transient failure precedes a later successful attempt', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      mockWorkflowRepository()
      mockTranscriptionService()
      let calls = 0
      const analysisService = mockAnalysisService({
        run: vi.fn().mockImplementation(async () => {
          calls += 1
          return calls < 2
            ? { outcome: 'failed', error_code: 'analysis_failed' }
            : { outcome: 'persisted', feedback: VALID_FEEDBACK }
        }),
      })
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'ready',
        interview_id: MOCKED_INTERVIEW_ID,
        attempt_id: expect.any(String),
      })
      expect(analysisService.run).toHaveBeenCalledTimes(2)
    })

    it('marks failed/analysis_failed once the bounded analysis retry budget is exhausted', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository()
      mockTranscriptionService()
      const analysisService = mockAnalysisService({
        run: vi.fn().mockResolvedValue({ outcome: 'failed', error_code: 'analysis_failed' }),
      })
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'failed',
        interview_id: MOCKED_INTERVIEW_ID,
        error_code: 'analysis_failed',
      })
      expect(workflowRepository.markFailed).toHaveBeenCalledWith(
        MOCKED_INTERVIEW_ID,
        expect.any(String),
        'analysis_failed',
      )
      expect(analysisService.run.mock.calls.length).toBeGreaterThan(1)
      const retryingCalls = vi
        .mocked(logFeedbackWorkflowEvent)
        .mock.calls.filter(([event]) => event === 'retrying')
      expect(retryingCalls.length).toBeGreaterThan(0)
    })

    it('marks failed/invalid_feedback once the bounded retry budget is exhausted on schema-invalid output', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository()
      mockTranscriptionService()
      mockAnalysisService({
        run: vi.fn().mockResolvedValue({ outcome: 'invalid', error_code: 'invalid_feedback' }),
      })
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'failed',
        interview_id: MOCKED_INTERVIEW_ID,
        error_code: 'invalid_feedback',
      })
      expect(workflowRepository.markFailed).toHaveBeenCalledWith(
        MOCKED_INTERVIEW_ID,
        expect.any(String),
        'invalid_feedback',
      )
    })

    it('treats a reused (already-ready) report as success without re-persisting', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      mockWorkflowRepository()
      mockTranscriptionService()
      mockAnalysisService({ run: vi.fn().mockResolvedValue({ outcome: 'reused', feedback: VALID_FEEDBACK }) })
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result.status).toBe('ready')
    })

    it('stops (skipped/stale) when analysis detects a replaced attempt', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository()
      mockTranscriptionService()
      mockAnalysisService({ run: vi.fn().mockResolvedValue({ outcome: 'stale' }) })
      const workflow = createWorkflow()
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', interview_id: MOCKED_INTERVIEW_ID, reason: 'stale' })
      expect(workflowRepository.markFailed).not.toHaveBeenCalled()
    })
  })

  describe('missing infrastructure configuration', function () {
    it('marks failed/internal_error when the Workers AI binding is missing', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflowRepository = mockWorkflowRepository()
      mockTranscriptionService()
      mockAnalysisService()
      const workflow = createWorkflow(createMockEnv({ AI: undefined }))
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'failed',
        interview_id: MOCKED_INTERVIEW_ID,
        error_code: 'internal_error',
      })
      expect(workflowRepository.markFailed).toHaveBeenCalledWith(
        MOCKED_INTERVIEW_ID,
        expect.any(String),
        'internal_error',
      )
    })

    it('marks failed/internal_error when the recordings bucket binding is missing', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      mockWorkflowRepository()
      mockTranscriptionService()
      mockAnalysisService()
      const workflow = createWorkflow(createMockEnv({ RECORDINGS_BUCKET: undefined }))
      const { step } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'failed',
        interview_id: MOCKED_INTERVIEW_ID,
        error_code: 'internal_error',
      })
    })
  })

  describe('terminal write step names', function () {
    it('uses the terminal-unavailable step name for not_started transitions', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      mockWorkflowRepository({ listRecordingJobs: vi.fn().mockResolvedValue([]) })
      mockTranscriptionService()
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(stepRan(steps, STEP_TERMINAL_UNAVAILABLE)).toBe(true)
      expect(stepRan(steps, STEP_TERMINAL_FAILURE)).toBe(false)
    })

    it('uses the terminal-failure step name for failed transitions', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      mockWorkflowRepository()
      mockTranscriptionService({
        transcribeAndPersist: vi.fn().mockResolvedValue({ outcome: 'failed', error_code: 'transcription_failed' }),
      })
      mockAnalysisService()
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(stepRan(steps, STEP_TERMINAL_FAILURE)).toBe(true)
      expect(stepRan(steps, STEP_TERMINAL_UNAVAILABLE)).toBe(false)
    })
  })
})
