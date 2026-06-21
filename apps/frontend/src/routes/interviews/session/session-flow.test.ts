import { describe, expect, it } from 'vitest'
import {
  sessionReducer,
  initialSessionState,
  canJoin,
  type SessionAction,
} from './session-flow'
import type { InterviewDetail } from '@mako/shared'

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


describe('sessionReducer', function () {
  it('returns initial state on default action', function () {
    const next = sessionReducer(initialSessionState, { type: 'RESET' } as SessionAction)
    expect(next).toEqual(initialSessionState)
  })

  it('JOIN transitions to joining and clears error', function () {
    const state = {
      ...initialSessionState,
      status: 'error' as const,
      errorMessage: 'previous error',
      whiteboardStatus: 'failed' as const,
      whiteboardErrorMessage: 'previous whiteboard error',
    }
    const next = sessionReducer(state, { type: 'JOIN' })
    expect(next.status).toBe('joining')
    expect(next.errorMessage).toBeNull()
    expect(next.whiteboardStatus).toBe('idle')
    expect(next.whiteboardErrorMessage).toBeNull()
  })

  it('JOIN is idempotent when already joining', function () {
    const state = {
      ...initialSessionState,
      status: 'joining' as const,
    }
    const next = sessionReducer(state, { type: 'JOIN' })
    expect(next).toBe(state)
  })

  it('PROVISION_SUCCESS transitions to provisioned without storing credential payload', function () {
    const state = {
      ...initialSessionState,
      status: 'joining' as const,
    }
    const next = sessionReducer(state, { type: 'PROVISION_SUCCESS' })
    expect(next.status).toBe('provisioned')
    expect('provisionData' in next).toBe(false)
    expect(next.errorMessage).toBeNull()
    expect(next.whiteboardStatus).toBe('idle')
    expect(next.whiteboardErrorMessage).toBeNull()
  })

  it('PROVISION_ERROR stores error message and transitions to error', function () {
    const state = {
      ...initialSessionState,
      status: 'joining' as const,
    }
    const next = sessionReducer(state, {
      type: 'PROVISION_ERROR',
      payload: 'Something went wrong',
    })
    expect(next.status).toBe('error')
    expect(next.errorMessage).toBe('Something went wrong')
    expect(next.whiteboardStatus).toBe('idle')
    expect(next.whiteboardErrorMessage).toBeNull()
  })

  it('tracks whiteboard reconnect lifecycle only after provision', function () {
    const provisioned = {
      ...initialSessionState,
      status: 'provisioned' as const,
    }

    const connecting = sessionReducer(provisioned, { type: 'WHITEBOARD_CONNECTING' })
    expect(connecting.whiteboardStatus).toBe('connecting')

    const connected = sessionReducer(connecting, { type: 'WHITEBOARD_CONNECTED' })
    expect(connected.whiteboardStatus).toBe('connected')

    const reconnecting = sessionReducer(connected, { type: 'WHITEBOARD_RECONNECTING' })
    expect(reconnecting.whiteboardStatus).toBe('reconnecting')

    const failed = sessionReducer(reconnecting, {
      type: 'WHITEBOARD_FAILED',
      payload: 'Whiteboard sync could not recover.',
    })
    expect(failed.whiteboardStatus).toBe('failed')
    expect(failed.whiteboardErrorMessage).toBe('Whiteboard sync could not recover.')
  })

  it('ignores whiteboard lifecycle before provision', function () {
    const next = sessionReducer(initialSessionState, { type: 'WHITEBOARD_CONNECTING' })
    expect(next).toBe(initialSessionState)
  })

  it('RESET returns to initial state', function () {
    const state = {
      ...initialSessionState,
      errorMessage: null,
    }
    const next = sessionReducer(state, { type: 'RESET' })
    expect(next).toEqual(initialSessionState)
  })

})

describe('canJoin', function () {
  it('returns true when idle with interview loaded', function () {
    const state = { ...initialSessionState }
    expect(canJoin(state, makeInterview())).toBe(true)
  })

  it('returns false when no interview', function () {
    expect(canJoin(initialSessionState, null)).toBe(false)
  })

  it('returns false when already joining', function () {
    const state = {
      ...initialSessionState,
      status: 'joining' as const,
    }
    expect(canJoin(state, makeInterview())).toBe(false)
  })

  it('returns false when provisioned', function () {
    const state = {
      ...initialSessionState,
      status: 'provisioned' as const,
    }
    expect(canJoin(state, makeInterview())).toBe(false)
  })

  it('returns true when error state with interview loaded', function () {
    const state = {
      ...initialSessionState,
      status: 'error' as const,
      errorMessage: 'previous error',
    }
    expect(canJoin(state, makeInterview())).toBe(true)
  })

  it('returns false when interview is completed or cancelled', function () {
    const state = { ...initialSessionState }

    expect(canJoin(state, makeInterview({ status: 'completed' }))).toBe(false)
    expect(canJoin(state, makeInterview({ status: 'cancelled' }))).toBe(false)
  })
})
