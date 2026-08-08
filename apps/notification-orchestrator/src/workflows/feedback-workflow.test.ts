import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InterviewFeedbackWorkflow,
  STEP_ARTIFACT_READINESS,
  STEP_ELIGIBILITY_LOAD,
  STEP_PROCESSING_CLAIM,
  feedbackWorkflowPayloadSchema,
} from './feedback-workflow'
import type { WorkerBindings } from '../index'
import {
  InterviewRepository,
  createPostgresConnectionPool,
  type InterviewFeedbackState,
} from '@mako/shared-backend'

vi.mock('@mako/shared-backend', () => ({
  createPostgresConnectionPool: vi.fn(),
  createSqlQuery: (text: string, values: readonly unknown[] = []) => ({ text, values }),
  InterviewRepository: vi.fn(),
}))

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
  overrides: Partial<Pick<InterviewFeedbackState, 'feedback_status'>> = {},
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

function createMockEnv(): WorkerBindings {
  return {
    HYPERDRIVE: { connectionString: 'postgres://test' },
    NOTIFICATION_QUEUE: {} as never,
  }
}

function createMockEvent(payload: { interview_id: string; schema_version: number }) {
  return {
    payload,
    timestamp: new Date(),
    instanceId: 'test-instance',
    workflowName: 'feedback-workflow',
  }
}

function createMockExecutionContext(): ExecutionContext {
  return {} as ExecutionContext
}

function createWorkflow(env: WorkerBindings = createMockEnv()) {
  return new InterviewFeedbackWorkflow(createMockExecutionContext(), env)
}

type TrackingStepResult = { name: string; result?: unknown }

function createTrackingStep() {
  const steps: TrackingStepResult[] = []
  const step = {
    async do(name: string, callback: () => Promise<unknown>) {
      const result = await callback()
      steps.push({ name, result })
      return result
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

function createMockPool(
  queryHandler: (text: string, values: unknown[]) => { rows: unknown[]; rowCount: number },
) {
  return {
    connect() {
      return Promise.resolve({
        query(text: string, values: unknown[]) {
          return Promise.resolve(queryHandler(text, values))
        },
        release() {
          return Promise.resolve()
        },
      })
    },
  }
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

function mockClaimQuery(rowCount: number) {
  const queries: Array<{ text: string; values: unknown[] }> = []
  const pool = createMockPool((text, values) => {
    queries.push({ text, values })
    return {
      rows: rowCount > 0 ? [{ id: MOCKED_INTERVIEW_ID }] : [],
      rowCount,
    }
  })
  vi.mocked(createPostgresConnectionPool).mockReturnValue(
    pool as unknown as ReturnType<typeof createPostgresConnectionPool>,
  )
  return queries
}

describe('InterviewFeedbackWorkflow', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    // The query executor is created eagerly in run(), so every run needs a pool.
    vi.mocked(createPostgresConnectionPool).mockReturnValue(
      createMockPool(() => ({ rows: [], rowCount: 0 })) as unknown as ReturnType<
        typeof createPostgresConnectionPool
      >,
    )
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
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', reason: 'already_ready' })
      expect(steps).toEqual([
        { name: STEP_ELIGIBILITY_LOAD, result: { eligible: false, reason: 'already_ready' } },
      ])
    })

    it('returns skipped/already_processing when feedback_status is processing', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'processing' }))
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', reason: 'already_processing' })
      expect(steps).toEqual([
        { name: STEP_ELIGIBILITY_LOAD, result: { eligible: false, reason: 'already_processing' } },
      ])
    })

    it('returns skipped/previously_failed when feedback_status is failed', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'failed' }))
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', reason: 'previously_failed' })
      expect(steps).toEqual([
        { name: STEP_ELIGIBILITY_LOAD, result: { eligible: false, reason: 'previously_failed' } },
      ])
    })

    it('returns skipped/not_pending when feedback_status is not_started', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'not_started' }))
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', reason: 'not_pending' })
      expect(steps).toEqual([
        { name: STEP_ELIGIBILITY_LOAD, result: { eligible: false, reason: 'not_pending' } },
      ])
    })

    it('returns eligible when feedback_status is pending and proceeds to claim', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      const eligibility = stepResult(steps, STEP_ELIGIBILITY_LOAD)
      expect(eligibility).toEqual({
        eligible: true,
        interview: expect.objectContaining({
          id: MOCKED_INTERVIEW_ID,
          status: 'completed',
          recording_status: 'ready',
          feedback_status: 'pending',
          type: 'behavioral',
          mode: 'ai_led',
          tier: 'standard',
          scheduler_alias: 'scheduler-1',
        }),
      })

      // With the claim update matching zero rows the workflow bails out.
      expect(result).toEqual({ status: 'skipped', reason: 'already_claimed' })
    })
  })

  describe('claimWork step', function () {
    it('returns skipped/already_claimed when the claim update matches no row', async function () {
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const queries = mockClaimQuery(0)
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({ status: 'skipped', reason: 'already_claimed' })
      expect(stepResult(steps, STEP_PROCESSING_CLAIM)).toEqual({
        claimed: false,
        attempt_id: null,
      })

      expect(queries).toHaveLength(1)
      expect(queries[0].text).toContain('UPDATE interviews')
      expect(queries[0].text).toContain("feedback_status = 'pending'")
      expect(queries[0].text).toContain('RETURNING id')
      expect(queries[0].values[0]).toBe(MOCKED_INTERVIEW_ID)
    })

    it('returns processing status when the claim succeeds', async function () {
      vi.spyOn(console, 'info').mockImplementation(() => {})
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      const queries = mockClaimQuery(1)
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      const result = await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(result).toEqual({
        status: 'processing',
        interview_id: MOCKED_INTERVIEW_ID,
        attempt_id: expect.any(String),
        next_step: 'artifact_readiness',
      })
      expect(stepResult(steps, STEP_PROCESSING_CLAIM)).toEqual({
        claimed: true,
        attempt_id: expect.any(String),
      })
      expect(queries).toHaveLength(1)
      expect(steps.map((entry) => entry.name)).toEqual([
        STEP_ELIGIBILITY_LOAD,
        STEP_PROCESSING_CLAIM,
        STEP_ARTIFACT_READINESS,
      ])
    })
  })

  describe('artifactReadiness step', function () {
    it('emits a structured console.info log with the event name', async function () {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      mockInterviewState(buildInterviewState({ feedback_status: 'pending' }))
      mockClaimQuery(1)
      const workflow = createWorkflow()
      const { step, steps } = createTrackingStep()

      await workflow.run(createMockEvent(VALID_PAYLOAD), step)

      expect(infoSpy).toHaveBeenCalledTimes(1)
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'feedback_artifact_readiness_step',
          interview_id: MOCKED_INTERVIEW_ID,
          attempt_id: expect.any(String),
          source: 'workflow',
        }),
      )
      expect(stepResult(steps, STEP_ARTIFACT_READINESS)).toEqual({
        artifacts_ready: false,
        reason: 'awaiting_implementation',
      })
    })
  })
})
