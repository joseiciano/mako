import type { InterviewDetail, ProvisionInterviewResponse } from '@mako/shared'

export type SessionStatus = 'idle' | 'joining' | 'provisioned' | 'error'

export type SessionState = {
  interview: InterviewDetail | null
  status: SessionStatus
  provisionData: ProvisionInterviewResponse | null
  errorMessage: string | null
}

export const initialSessionState: SessionState = {
  interview: null,
  status: 'idle',
  provisionData: null,
  errorMessage: null,
}

export type SessionAction =
  | { type: 'SET_INTERVIEW'; payload: InterviewDetail }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'JOIN' }
  | { type: 'PROVISION_SUCCESS'; payload: ProvisionInterviewResponse }
  | { type: 'PROVISION_ERROR'; payload: string }
  | { type: 'RESET' }

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'SET_INTERVIEW': {
      return { ...state, interview: action.payload }
    }

    case 'FETCH_ERROR': {
      return {
        ...state,
        status: 'error',
        errorMessage: action.payload,
      }
    }

    case 'JOIN': {
      if (state.status === 'joining') return state
      return { ...state, status: 'joining', errorMessage: null }
    }

    case 'PROVISION_SUCCESS': {
      return {
        ...state,
        status: 'provisioned',
        provisionData: action.payload,
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

export function canJoin(state: SessionState): boolean {
  return (state.status === 'idle' || state.status === 'error') && state.interview !== null
}

export function isJoining(state: SessionState): boolean {
  return state.status === 'joining'
}

export function isProvisioned(state: SessionState): boolean {
  return state.status === 'provisioned' && state.provisionData !== null
}