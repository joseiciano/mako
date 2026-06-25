import type { InterviewDetail } from '@mako/shared'
import type { WhiteboardConnectionStatus } from '#/components/interviews/whiteboard'
import type { MediaConnectionStatus } from '#/components/interviews/media'

export type SessionStatus = 'idle' | 'joining' | 'provisioned' | 'error'

export type SessionState = {
  status: SessionStatus
  errorMessage: string | null
  whiteboardStatus: WhiteboardConnectionStatus
  whiteboardErrorMessage: string | null
  mediaStatus: MediaConnectionStatus
  mediaErrorMessage: string | null
}

export const initialSessionState: SessionState = {
  status: 'idle',
  errorMessage: null,
  whiteboardStatus: 'idle',
  whiteboardErrorMessage: null,
  mediaStatus: 'pre-join',
  mediaErrorMessage: null,
}

export type SessionAction =
  | { type: 'JOIN' }
  | { type: 'PROVISION_SUCCESS' }
  | { type: 'PROVISION_ERROR'; payload: string }
  | { type: 'WHITEBOARD_CONNECTING' }
  | { type: 'WHITEBOARD_CONNECTED' }
  | { type: 'WHITEBOARD_RECONNECTING' }
  | { type: 'WHITEBOARD_FAILED'; payload: string }
  | { type: 'MEDIA_CONNECTING' }
  | { type: 'MEDIA_CONNECTED' }
  | { type: 'MEDIA_WAITING_FOR_PEER' }
  | { type: 'MEDIA_RECONNECTING' }
  | { type: 'MEDIA_FAILED'; payload: string }
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
        mediaStatus: 'pre-join',
        mediaErrorMessage: null,
      }
    }

    case 'PROVISION_SUCCESS': {
      return {
        ...state,
        status: 'provisioned',
        errorMessage: null,
        whiteboardStatus: 'idle',
        whiteboardErrorMessage: null,
        mediaStatus: 'pre-join',
        mediaErrorMessage: null,
      }
    }

    case 'PROVISION_ERROR': {
      return {
        ...state,
        status: 'error',
        errorMessage: action.payload,
        whiteboardStatus: 'idle',
        whiteboardErrorMessage: null,
        mediaStatus: 'pre-join',
        mediaErrorMessage: null,
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

    case 'MEDIA_CONNECTING': {
      if (state.status !== 'provisioned') return state
      return { ...state, mediaStatus: 'connecting', mediaErrorMessage: null }
    }

    case 'MEDIA_CONNECTED': {
      if (state.status !== 'provisioned') return state
      return { ...state, mediaStatus: 'connected', mediaErrorMessage: null }
    }

    case 'MEDIA_WAITING_FOR_PEER': {
      if (state.status !== 'provisioned') return state
      return { ...state, mediaStatus: 'waiting-for-peer', mediaErrorMessage: null }
    }

    case 'MEDIA_RECONNECTING': {
      if (state.status !== 'provisioned') return state
      return { ...state, mediaStatus: 'reconnecting', mediaErrorMessage: null }
    }

    case 'MEDIA_FAILED': {
      if (state.status !== 'provisioned') return state
      return {
        ...state,
        mediaStatus: 'failed',
        mediaErrorMessage: action.payload,
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
