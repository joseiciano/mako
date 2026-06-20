import type { InterviewDetail } from '@mako/shared'

export type SessionStatus = 'idle' | 'joining' | 'provisioned' | 'error'

export type SessionState = {
  status: SessionStatus
  errorMessage: string | null
}

export const initialSessionState: SessionState = {
  status: 'idle',
  errorMessage: null,
}

export type SessionAction =
  | { type: 'JOIN' }
  | { type: 'PROVISION_SUCCESS' }
  | { type: 'PROVISION_ERROR'; payload: string }
  // TODO: Use for whiteboard/session teardown flow in Story 3.4.
  | { type: 'RESET' }

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'JOIN': {
      if (state.status === 'joining') return state
      return { ...state, status: 'joining', errorMessage: null }
    }

    case 'PROVISION_SUCCESS': {
      return {
        ...state,
        status: 'provisioned',
        errorMessage: null,
      }
    }

    case 'PROVISION_ERROR': {
      return {
        ...state,
        status: 'error',
        errorMessage: action.payload,
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
