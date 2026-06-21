import type { InterviewDetail } from '@mako/shared'

export type SessionStatus = 'idle' | 'joining' | 'provisioned' | 'error'
export type WhiteboardConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export type SessionState = {
  status: SessionStatus
  errorMessage: string | null
  whiteboardStatus: WhiteboardConnectionStatus
  whiteboardErrorMessage: string | null
}

export const initialSessionState: SessionState = {
  status: 'idle',
  errorMessage: null,
  whiteboardStatus: 'idle',
  whiteboardErrorMessage: null,
}

export type SessionAction =
  | { type: 'JOIN' }
  | { type: 'PROVISION_SUCCESS' }
  | { type: 'PROVISION_ERROR'; payload: string }
  | { type: 'WHITEBOARD_CONNECTING' }
  | { type: 'WHITEBOARD_CONNECTED' }
  | { type: 'WHITEBOARD_RECONNECTING' }
  | { type: 'WHITEBOARD_FAILED'; payload: string }
  | { type: 'RESET' }

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'JOIN': {
      if (state.status === 'joining') return state
      return {
        ...state,
        status: 'joining',
        errorMessage: null,
        whiteboardStatus: 'idle',
        whiteboardErrorMessage: null,
      }
    }

    case 'PROVISION_SUCCESS': {
      return {
        ...state,
        status: 'provisioned',
        errorMessage: null,
        whiteboardStatus: 'idle',
        whiteboardErrorMessage: null,
      }
    }

    case 'PROVISION_ERROR': {
      return {
        ...state,
        status: 'error',
        errorMessage: action.payload,
        whiteboardStatus: 'idle',
        whiteboardErrorMessage: null,
      }
    }

    case 'WHITEBOARD_CONNECTING': {
      if (state.status !== 'provisioned') return state
      return { ...state, whiteboardStatus: 'connecting', whiteboardErrorMessage: null }
    }

    case 'WHITEBOARD_CONNECTED': {
      if (state.status !== 'provisioned') return state
      return { ...state, whiteboardStatus: 'connected', whiteboardErrorMessage: null }
    }

    case 'WHITEBOARD_RECONNECTING': {
      if (state.status !== 'provisioned') return state
      return { ...state, whiteboardStatus: 'reconnecting', whiteboardErrorMessage: null }
    }

    case 'WHITEBOARD_FAILED': {
      if (state.status !== 'provisioned') return state
      return {
        ...state,
        whiteboardStatus: 'failed',
        whiteboardErrorMessage: action.payload,
      }
    }

    case 'RESET': {
      return initialSessionState
    }

    default: {
      return state
    }
  }
}

export function canJoin(state: SessionState, interview: InterviewDetail | null): boolean {
  return (
    (state.status === 'idle' || state.status === 'error') &&
    interview !== null &&
    (interview.status === 'scheduled' || interview.status === 'ongoing')
  )
}
