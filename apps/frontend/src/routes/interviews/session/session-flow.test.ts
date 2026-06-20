import { describe, expect, it } from 'vitest'
import {
  sessionReducer,
  initialSessionState,
  canJoin,
  isJoining,
  isProvisioned,
  type SessionAction,
} from './session-flow'
import type { InterviewDetail, ProvisionInterviewResponse } from '@mako/shared'

function makeInterview(overrides?: Partial<InterviewDetail>): InterviewDetail {
  return {
    id: 'int-1',
    scheduler_id: 'sch-1',
    scheduler_alias: 'Bob',
    interviewer_id: 'intv-1',
    interviewer_alias: 'Alice',
    type: 'behavioral',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-06-20T10:00:00Z',
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    created_at: '2026-06-19T10:00:00Z',
    updated_at: '2026-06-19T10:00:00Z',
    ...overrides,
  }
}

function makeProvisionResponse(
  overrides?: Partial<ProvisionInterviewResponse>,
): ProvisionInterviewResponse {
  return {
    mode: 'ai_led',
    realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
    excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
    ...overrides,
  }
}

describe('sessionReducer', function () {
  it('returns initial state on default action', function () {
    const next = sessionReducer(initialSessionState, { type: 'RESET' } as SessionAction)
    expect(next).toEqual(initialSessionState)
  })

  it('SET_INTERVIEW stores interview detail', function () {
    const interview = makeInterview()
    const next = sessionReducer(initialSessionState, {
      type: 'SET_INTERVIEW',
      payload: interview,
    })
    expect(next.interview).toBe(interview)
    expect(next.status).toBe('idle')
  })

  it('FETCH_ERROR transitions to error with message', function () {
    const next = sessionReducer(initialSessionState, {
      type: 'FETCH_ERROR',
      payload: 'Interview not found',
    })
    expect(next.status).toBe('error')
    expect(next.errorMessage).toBe('Interview not found')
  })

  it('JOIN transitions to joining and clears error', function () {
    const state = {
      ...initialSessionState,
      interview: makeInterview(),
      status: 'error' as const,
      errorMessage: 'previous error',
    }
    const next = sessionReducer(state, { type: 'JOIN' })
    expect(next.status).toBe('joining')
    expect(next.errorMessage).toBeNull()
  })

  it('JOIN is idempotent when already joining', function () {
    const state = {
      ...initialSessionState,
      interview: makeInterview(),
      status: 'joining' as const,
    }
    const next = sessionReducer(state, { type: 'JOIN' })
    expect(next).toBe(state)
  })

  it('PROVISION_SUCCESS stores provision data and transitions to provisioned', function () {
    const provision = makeProvisionResponse()
    const state = {
      ...initialSessionState,
      interview: makeInterview(),
      status: 'joining' as const,
    }
    const next = sessionReducer(state, {
      type: 'PROVISION_SUCCESS',
      payload: provision,
    })
    expect(next.status).toBe('provisioned')
    expect(next.provisionData).toBe(provision)
    expect(next.errorMessage).toBeNull()
  })

  it('PROVISION_ERROR stores error message and transitions to error', function () {
    const state = {
      ...initialSessionState,
      interview: makeInterview(),
      status: 'joining' as const,
    }
    const next = sessionReducer(state, {
      type: 'PROVISION_ERROR',
      payload: 'Something went wrong',
    })
    expect(next.status).toBe('error')
    expect(next.errorMessage).toBe('Something went wrong')
  })

  it('RESET returns to initial state', function () {
    const state = {
      ...initialSessionState,
      interview: makeInterview(),
      status: 'provisioned' as const,
      provisionData: makeProvisionResponse(),
      errorMessage: null,
    }
    const next = sessionReducer(state, { type: 'RESET' })
    expect(next).toEqual(initialSessionState)
  })
})

describe('canJoin', function () {
  it('returns true when idle with interview loaded', function () {
    const state = { ...initialSessionState, interview: makeInterview() }
    expect(canJoin(state)).toBe(true)
  })

  it('returns false when no interview', function () {
    expect(canJoin(initialSessionState)).toBe(false)
  })

  it('returns false when already joining', function () {
    const state = {
      ...initialSessionState,
      interview: makeInterview(),
      status: 'joining' as const,
    }
    expect(canJoin(state)).toBe(false)
  })

  it('returns false when provisioned', function () {
    const state = {
      ...initialSessionState,
      interview: makeInterview(),
      status: 'provisioned' as const,
      provisionData: makeProvisionResponse(),
    }
    expect(canJoin(state)).toBe(false)
  })

  it('returns true when error state with interview loaded', function () {
    const state = {
      ...initialSessionState,
      interview: makeInterview(),
      status: 'error' as const,
      errorMessage: 'previous error',
    }
    expect(canJoin(state)).toBe(true)
  })
})

describe('isJoining', function () {
  it('returns true when status is joining', function () {
    const state = { ...initialSessionState, status: 'joining' as const }
    expect(isJoining(state)).toBe(true)
  })

  it('returns false when status is idle', function () {
    expect(isJoining(initialSessionState)).toBe(false)
  })
})

describe('isProvisioned', function () {
  it('returns true when provisioned with provision data', function () {
    const state = {
      ...initialSessionState,
      status: 'provisioned' as const,
      provisionData: makeProvisionResponse(),
    }
    expect(isProvisioned(state)).toBe(true)
  })

  it('returns false when provisioned but no provision data', function () {
    const state = {
      ...initialSessionState,
      status: 'provisioned' as const,
      provisionData: null,
    }
    expect(isProvisioned(state)).toBe(false)
  })

  it('returns false when not provisioned', function () {
    expect(isProvisioned(initialSessionState)).toBe(false)
  })
})