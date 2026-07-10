import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  buildTimerWarningLog,
  buildTimerCompletedLog,
  SessionTimerWorkflow,
} from './session-timer-workflow'

describe('buildTimerWarningLog', function () {
  it('returns structured object with safe fields only', function () {
    const log = buildTimerWarningLog({
      interview_id: 'interview-1',
      warning_at: '2026-07-09T10:55:00.000Z',
      expires_at: '2026-07-09T11:00:00.000Z',
    })

    expect(log).toEqual({
      event: 'timer_warning',
      interview_id: 'interview-1',
      warning_at: '2026-07-09T10:55:00.000Z',
      expires_at: '2026-07-09T11:00:00.000Z',
      source: 'workflow',
    })
  })

  it('does not include sensitive fields', function () {
    const log = buildTimerWarningLog({
      interview_id: 'interview-1',
      warning_at: '2026-07-09T10:55:00.000Z',
      expires_at: '2026-07-09T11:00:00.000Z',
    })

    expect(log).not.toHaveProperty('realtime_session_id')
    expect(log).not.toHaveProperty('excalidraw_key')
    expect(log).not.toHaveProperty('excalidraw_room_id')
    expect(log).not.toHaveProperty('token')
  })
})

describe('buildTimerCompletedLog', function () {
  it('returns structured object with safe fields only', function () {
    const log = buildTimerCompletedLog({
      interview_id: 'interview-1',
      expires_at: '2026-07-09T11:00:00.000Z',
      outcome: 'completed',
      reason: 'timer_expired',
    })

    expect(log).toEqual({
      event: 'timer_completed',
      interview_id: 'interview-1',
      expires_at: '2026-07-09T11:00:00.000Z',
      outcome: 'completed',
      reason: 'timer_expired',
      source: 'workflow',
    })
  })

  it('logs outcome not_found with safe context when interview is missing', function () {
    const log = buildTimerCompletedLog({
      interview_id: 'interview-missing',
      expires_at: '2026-07-09T11:00:00.000Z',
      outcome: 'not_found',
      reason: 'interview not found',
    })

    expect(log.outcome).toBe('not_found')
    expect(log.reason).toBe('interview not found')
    expect(log.source).toBe('workflow')
  })

  it('logs already_completed outcome with timer_expired reason', function () {
    const log = buildTimerCompletedLog({
      interview_id: 'interview-1',
      expires_at: '2026-07-09T11:00:00.000Z',
      outcome: 'already_completed',
      reason: 'timer_expired',
    })

    expect(log.outcome).toBe('already_completed')
    expect(log.reason).toBe('timer_expired')
  })

  it('does not include sensitive fields', function () {
    const log = buildTimerCompletedLog({
      interview_id: 'interview-1',
      expires_at: '2026-07-09T11:00:00.000Z',
      outcome: 'completed',
      reason: 'timer_expired',
    })

    expect(log).not.toHaveProperty('realtime_session_id')
    expect(log).not.toHaveProperty('excalidraw_key')
    expect(log).not.toHaveProperty('excalidraw_room_id')
    expect(log).not.toHaveProperty('token')
  })
})

describe('SessionTimerWorkflow', function () {
  afterEach(function () {
    vi.restoreAllMocks()
  })

  it('emits timer_warning structured log via console.info', async function () {
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => {})

    const workflow = new SessionTimerWorkflow(createMockContext(), { DB: createEmptyDbBinding() })
    const step = createTrackingStep()
    const warningAt = new Date(Date.now() + 60_000).toISOString()
    const expiresAt = new Date(Date.now() + 120_000).toISOString()

    await workflow.run(
      {
        payload: {
          interview_id: 'interview-1',
          started_at: new Date().toISOString(),
          expires_at: expiresAt,
          warning_at: warningAt,
        },
        timestamp: new Date(),
        instanceId: 'instance-1',
        workflowName: 'session-timer',
      },
      step,
    )

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'timer_warning',
        interview_id: 'interview-1',
        source: 'workflow',
      }),
    )

    const warningLog = consoleInfoSpy.mock.calls.find(
      (call) => (call[0] as { event: string }).event === 'timer_warning',
    )
    expect(warningLog).toBeDefined()
    expect(warningLog![0]).not.toHaveProperty('realtime_session_id')
    expect(warningLog![0]).not.toHaveProperty('excalidraw_key')
    expect(warningLog![0]).not.toHaveProperty('excalidraw_room_id')
    expect(warningLog![0]).not.toHaveProperty('token')
  })

  it('emits timer_completed with not_found when interview does not exist', async function () {
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => {})

    const workflow = new SessionTimerWorkflow(createMockContext(), { DB: createEmptyDbBinding() })
    const step = createTrackingStep()
    const expiresAt = new Date(Date.now() + 120_000).toISOString()

    await workflow.run(
      {
        payload: {
          interview_id: 'interview-nonexistent',
          started_at: new Date().toISOString(),
          expires_at: expiresAt,
          warning_at: new Date().toISOString(),
        },
        timestamp: new Date(),
        instanceId: 'instance-1',
        workflowName: 'session-timer',
      },
      step,
    )

    const completedLog = consoleInfoSpy.mock.calls.find(
      (call) => (call[0] as { event: string }).event === 'timer_completed',
    )
    expect(completedLog).toBeDefined()
    expect(completedLog![0]).toEqual(
      expect.objectContaining({
        event: 'timer_completed',
        interview_id: 'interview-nonexistent',
        outcome: 'not_found',
        reason: 'interview not found',
        source: 'workflow',
      }),
    )
    expect(completedLog![0]).not.toHaveProperty('realtime_session_id')
    expect(completedLog![0]).not.toHaveProperty('excalidraw_key')
    expect(completedLog![0]).not.toHaveProperty('excalidraw_room_id')
    expect(completedLog![0]).not.toHaveProperty('token')
  })

  it('emits timer_completed with already_completed when transition returns already_completed', async function () {
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => {})

    const workflow = new SessionTimerWorkflow(
      createMockContext(),
      { DB: createAlreadyCompletedDbBinding('11111111-1111-4111-8111-111111111111') },
    )
    const step = createTrackingStep()
    const expiresAt = new Date(Date.now() + 120_000).toISOString()

    await workflow.run(
      {
        payload: {
          interview_id: '11111111-1111-4111-8111-111111111111',
          started_at: new Date().toISOString(),
          expires_at: expiresAt,
          warning_at: new Date().toISOString(),
        },
        timestamp: new Date(),
        instanceId: 'instance-1',
        workflowName: 'session-timer',
      },
      step,
    )

    const completedLog = consoleInfoSpy.mock.calls.find(
      (call) => (call[0] as { event: string }).event === 'timer_completed',
    )
    expect(completedLog).toBeDefined()
    expect(completedLog![0]).toEqual(
      expect.objectContaining({
        event: 'timer_completed',
        interview_id: '11111111-1111-4111-8111-111111111111',
        outcome: 'already_completed',
        reason: 'timer_expired',
        source: 'workflow',
      }),
    )
  })

  it('emits no sensitive fields in any workflow log', async function () {
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => {})

    const workflow = new SessionTimerWorkflow(createMockContext(), { DB: createEmptyDbBinding() })
    const step = createTrackingStep()
    const expiresAt = new Date(Date.now() + 120_000).toISOString()

    await workflow.run(
      {
        payload: {
          interview_id: 'interview-safe-check',
          started_at: new Date().toISOString(),
          expires_at: expiresAt,
          warning_at: new Date().toISOString(),
        },
        timestamp: new Date(),
        instanceId: 'instance-1',
        workflowName: 'session-timer',
      },
      step,
    )

    for (const call of consoleInfoSpy.mock.calls) {
      const log = call[0] as Record<string, unknown>
      expect(log).not.toHaveProperty('realtime_session_id')
      expect(log).not.toHaveProperty('excalidraw_key')
      expect(log).not.toHaveProperty('excalidraw_room_id')
      expect(log).not.toHaveProperty('token')
    }
  })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockContext(): any {
  return {
    waitUntil(_promise: Promise<unknown>) {},
    passThroughOnException() {},
    props: {},
    tracing: undefined,
  }
}

function createTrackingStep() {
  const doCallbacks: Array<{ name: string; callback: () => Promise<unknown> }> = []
  const sleepUntilCalls: Array<{ label: string; timestamp: Date }> = []

  const step = {
    doCallbacks,
    sleepUntilCalls,
    async do(name: string, callback: () => Promise<unknown>) {
      doCallbacks.push({ name, callback })
      return callback()
    },
    async sleepUntil(label: string, timestamp: Date) {
      sleepUntilCalls.push({ label, timestamp })
    },
    async sleep(_label: string, _duration: string | number) {},
  }

  return step as unknown as import('cloudflare:workers').WorkflowStep
}

function createEmptyDbBinding() {
  return {
    async query(_statementText: string, ..._statementValues: readonly unknown[]) {
      return { rows: [] }
    },
  }
}

function createAlreadyCompletedDbBinding(interviewId: string) {
  const completedInterview = {
    id: interviewId,
    scheduler_id: '11111111-1111-4111-8111-111111111111',
    scheduler_alias: 'Scheduler',
    interviewer_id: null,
    interviewer_alias: 'Interviewer',
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'completed',
    scheduled_at: '2026-07-09T10:00:00.000Z',
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    started_at: '2026-07-09T10:00:00.000Z',
    expires_at: '2026-07-09T11:00:00.000Z',
    warning_at: '2026-07-09T10:55:00.000Z',
    created_at: '2026-07-09T09:00:00.000Z',
    updated_at: '2026-07-09T10:00:00.000Z',
  }

  return {
    async query(statementText: string, ...statementValues: readonly unknown[]) {
      // Transaction control
      if (statementText.includes('BEGIN;') || statementText.includes('COMMIT;') || statementText.includes('ROLLBACK;')) {
        return { rows: [] }
      }

      // UPDATE with status = 'ongoing' guard — returns empty because status is 'completed'
      if (statementText.includes("UPDATE interviews") && statementText.includes("status = 'ongoing'")) {
        return { rows: [] }
      }

      // Any SELECT FROM interviews — return the completed interview
      if (statementText.includes('FROM interviews') && statementText.includes('WHERE id')) {
        return { rows: [completedInterview] }
      }

      return { rows: [] }
    },
  }
}
