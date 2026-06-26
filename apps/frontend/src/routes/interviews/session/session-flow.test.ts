import { describe, expect, it } from 'vitest'
import {
  sessionReducer,
  initialSessionState,
  canJoin,
  type SessionAction,
} from './session-flow'
import { makeInterview } from './test-helpers'

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
      mediaStatus: 'failed' as const,
      mediaErrorMessage: 'previous media error',
    }
    const next = sessionReducer(state, { type: 'JOIN' })
    expect(next.status).toBe('joining')
    expect(next.errorMessage).toBeNull()
    expect(next.whiteboardStatus).toBe('idle')
    expect(next.whiteboardErrorMessage).toBeNull()
    expect(next.mediaStatus).toBe('pre-join')
    expect(next.mediaErrorMessage).toBeNull()
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
    expect(next.mediaStatus).toBe('pre-join')
    expect(next.mediaErrorMessage).toBeNull()
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
    expect(next.mediaStatus).toBe('pre-join')
    expect(next.mediaErrorMessage).toBeNull()
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

  it('tracks media connection lifecycle only after provision', function () {
    const provisioned = {
      ...initialSessionState,
      status: 'provisioned' as const,
    }

    const connecting = sessionReducer(provisioned, { type: 'MEDIA_CONNECTING' })
    expect(connecting.mediaStatus).toBe('connecting')
    expect(connecting.mediaErrorMessage).toBeNull()

    const connected = sessionReducer(connecting, { type: 'MEDIA_CONNECTED' })
    expect(connected.mediaStatus).toBe('connected')
    expect(connected.mediaErrorMessage).toBeNull()

    const waitingForPeer = sessionReducer(connected, { type: 'MEDIA_WAITING_FOR_PEER' })
    expect(waitingForPeer.mediaStatus).toBe('waiting-for-peer')
    expect(waitingForPeer.mediaErrorMessage).toBeNull()

    const reconnecting = sessionReducer(waitingForPeer, { type: 'MEDIA_RECONNECTING' })
    expect(reconnecting.mediaStatus).toBe('reconnecting')
    expect(reconnecting.mediaErrorMessage).toBeNull()

    const failed = sessionReducer(reconnecting, {
      type: 'MEDIA_FAILED',
      payload: 'Media connection lost',
    })
    expect(failed.mediaStatus).toBe('failed')
    expect(failed.mediaErrorMessage).toBe('Media connection lost')
  })

  it('ignores media lifecycle before provision', function () {
    const next = sessionReducer(initialSessionState, { type: 'MEDIA_CONNECTING' })
    expect(next).toBe(initialSessionState)
  })

  it('ignores media lifecycle when in error state', function () {
    const errorState = {
      ...initialSessionState,
      status: 'error' as const,
      errorMessage: 'Some error',
    }
    const next = sessionReducer(errorState, { type: 'MEDIA_CONNECTED' })
    expect(next).toBe(errorState)
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
