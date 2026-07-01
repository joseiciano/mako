import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Store, useStore } from '@tanstack/react-store'
import {
  useInterviewDetail,
  useProvisionInterview,
  useStartInterview,
  useEndInterview,
} from '#/hooks/use-interviews'
import type { WhiteboardProvisionHandle } from '#/components/interviews/whiteboard'
import type { ProvisionInterviewResponse } from '@mako/shared'
import type { MediaConnectionConfig, MediaPermissionError } from '#/components/interviews/media'
import {
  clearWhiteboardProvisionHandle,
  createWhiteboardProvisionHandle,
} from '#/components/interviews/whiteboard/whiteboard-provision-store'
import { SessionDumb } from './session-dumb'
import {
  initialSessionState,
  sessionReducer,
  canJoin,
} from './session-flow'
import {
  deriveLifecycleControls,
  deriveSessionTimer,
} from './session-lifecycle'

type SessionSmartProps = {
  interviewId: string
}

const LOAD_INTERVIEW_ERROR_MESSAGE = 'Unable to load interview details. Please try again.'
const JOIN_SESSION_ERROR_MESSAGE = 'Failed to join session. Please try again.'
const START_SESSION_ERROR_MESSAGE = 'Unable to start session. Please try again.'
const END_SESSION_ERROR_MESSAGE = 'Unable to end session. Please try again.'

type SessionLifecycleUiState = {
  lifecycleErrorsByInterviewId: Record<string, string | undefined>
}

const sessionLifecycleUiStore = new Store<SessionLifecycleUiState>({
  lifecycleErrorsByInterviewId: {},
})

function setSessionLifecycleError(interviewId: string, message: string | null) {
  sessionLifecycleUiStore.setState(function updateLifecycleError(state) {
    const lifecycleErrorsByInterviewId = { ...state.lifecycleErrorsByInterviewId }
    if (message === null) {
      delete lifecycleErrorsByInterviewId[interviewId]
    } else {
      lifecycleErrorsByInterviewId[interviewId] = message
    }

    return {
      ...state,
      lifecycleErrorsByInterviewId,
    }
  })
}

export function SessionSmart({ interviewId }: SessionSmartProps) {
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState)
  const isDispatchingRef = useRef(false)
  const whiteboardProvisionHandleRef = useRef<WhiteboardProvisionHandle | null>(null)
  const provisionDataRef = useRef<ProvisionInterviewResponse | null>(null)
  const isMountedRef = useRef(true)
  const isStartingRef = useRef(false)
  const isEndingRef = useRef(false)

  const interviewQuery = useInterviewDetail(interviewId)
  const provisionMutation = useProvisionInterview()
  const startMutation = useStartInterview()
  const endMutation = useEndInterview()

  const [nowMs, setNowMs] = useState(Date.now())
  const lifecycleErrorMessage = useStore(
    sessionLifecycleUiStore,
    function selectLifecycleError(uiState) {
      return uiState.lifecycleErrorsByInterviewId[interviewId] ?? null
    },
  )

  useEffect(function tickTimer() {
    if (interviewQuery.data?.status !== 'ongoing') return
    const expiresAtMs = interviewQuery.data.expires_at
      ? Date.parse(interviewQuery.data.expires_at)
      : Number.NaN

    if (Number.isNaN(expiresAtMs)) return

    if (Date.now() >= expiresAtMs) {
      setNowMs(expiresAtMs)
      return
    }

    const id = setInterval(function updateTimerNow() {
      const nextNowMs = Date.now()
      setNowMs(Math.min(nextNowMs, expiresAtMs))

      if (nextNowMs >= expiresAtMs) {
        clearInterval(id)
      }
    }, 1000)

    return function cleanup() {
      clearInterval(id)
    }
  }, [interviewQuery.data?.expires_at, interviewQuery.data?.status])

  const participantJoined = state.status === 'provisioned'
  const lifecycleControls = deriveLifecycleControls(
    interviewQuery.data ?? null,
    participantJoined,
  )
  const timer = deriveSessionTimer(interviewQuery.data ?? null, nowMs)

  const queryErrorMessage =
    interviewQuery.isError && state.status === 'idle' ? LOAD_INTERVIEW_ERROR_MESSAGE : null
  const errorMessage = state.errorMessage || queryErrorMessage

  useEffect(function clearProvisionOnUnmount() {
    isMountedRef.current = true
    return function cleanup() {
      isMountedRef.current = false
      clearWhiteboardProvisionHandle(whiteboardProvisionHandleRef.current)
      setSessionLifecycleError(interviewId, null)
    }
  }, [interviewId])

  function handleJoin() {
    if (isDispatchingRef.current || !canJoin(state, interviewQuery.data ?? null)) return

    requestProvision()
  }

  const handleWhiteboardRetry = useCallback(function handleWhiteboardRetry() {
    if (
      isDispatchingRef.current ||
      state.status !== 'provisioned' ||
      state.whiteboardStatus !== 'failed' ||
      !interviewQuery.data
    ) {
      return
    }

    dispatch({ type: 'WHITEBOARD_RECONNECTING' })
  }, [state.status, state.whiteboardStatus, interviewQuery.data])

  function requestProvision() {
    if (isDispatchingRef.current) return

    isDispatchingRef.current = true
    dispatch({ type: 'JOIN' })

    provisionMutation.mutate(
      { id: interviewId },
      {
        onSuccess: function onProvisionSuccess(data) {
          if (!isMountedRef.current) return
          clearWhiteboardProvisionHandle(whiteboardProvisionHandleRef.current)
          whiteboardProvisionHandleRef.current = createWhiteboardProvisionHandle(data)
          provisionDataRef.current = data
          isDispatchingRef.current = false
          dispatch({ type: 'PROVISION_SUCCESS' })
        },
        onError: function onProvisionError() {
          if (!isMountedRef.current) return
          isDispatchingRef.current = false
          dispatch({
            type: 'PROVISION_ERROR',
            payload: JOIN_SESSION_ERROR_MESSAGE,
          })
        },
      },
    )
  }

  const handleWhiteboardConnecting = useCallback(function handleWhiteboardConnecting() {
    dispatch({ type: 'WHITEBOARD_CONNECTING' })
  }, [])

  const handleWhiteboardConnected = useCallback(function handleWhiteboardConnected() {
    dispatch({ type: 'WHITEBOARD_CONNECTED' })
  }, [])

  const handleWhiteboardReconnecting = useCallback(function handleWhiteboardReconnecting() {
    dispatch({ type: 'WHITEBOARD_RECONNECTING' })
  }, [])

  const handleWhiteboardFailed = useCallback(function handleWhiteboardFailed(message: string) {
    dispatch({ type: 'WHITEBOARD_FAILED', payload: message })
  }, [])

  const handleMediaConnecting = useCallback(function handleMediaConnecting() {
    dispatch({ type: 'MEDIA_CONNECTING' })
  }, [])

  const handleMediaConnected = useCallback(function handleMediaConnected() {
    dispatch({ type: 'MEDIA_CONNECTED' })
  }, [])

  const handleMediaWaitingForPeer = useCallback(function handleMediaWaitingForPeer() {
    dispatch({ type: 'MEDIA_WAITING_FOR_PEER' })
  }, [])

  const handleMediaReconnecting = useCallback(function handleMediaReconnecting() {
    dispatch({ type: 'MEDIA_RECONNECTING' })
  }, [])

  const handleMediaFailed = useCallback(function handleMediaFailed(message: string) {
    dispatch({ type: 'MEDIA_FAILED', payload: message })
  }, [])

  const handleMediaPermissionError = useCallback(function handleMediaPermissionError(
    error: MediaPermissionError,
  ) {
    const messages = {
      denied: 'Camera or microphone access was denied. Please check your browser permissions.',
      'device-unavailable': 'Camera or microphone is not available. Please check your devices.',
    }
    dispatch({ type: 'MEDIA_FAILED', payload: messages[error] })
  }, [])

  function handleStartSession() {
    if (!lifecycleControls.canStart || isStartingRef.current || startMutation.isPending) return

    isStartingRef.current = true
    setSessionLifecycleError(interviewId, null)

    startMutation.mutate(
      { id: interviewId },
      {
        onSuccess: function onStartSuccess() {
          if (!isMountedRef.current) return
          isStartingRef.current = false
          setSessionLifecycleError(interviewId, null)
        },
        onError: function onStartError() {
          if (!isMountedRef.current) return
          isStartingRef.current = false
          setSessionLifecycleError(interviewId, START_SESSION_ERROR_MESSAGE)
        },
        onSettled: function onStartSettled() {
          if (isMountedRef.current) {
            isStartingRef.current = false
          }
        },
      },
    )
  }

  function handleEndSession() {
    if (!lifecycleControls.canEnd || isEndingRef.current || endMutation.isPending) return

    isEndingRef.current = true
    setSessionLifecycleError(interviewId, null)

    endMutation.mutate(
      { id: interviewId },
      {
        onSuccess: function onEndSuccess() {
          if (!isMountedRef.current) return
          isEndingRef.current = false
          setSessionLifecycleError(interviewId, null)
        },
        onError: function onEndError() {
          if (!isMountedRef.current) return
          isEndingRef.current = false
          setSessionLifecycleError(interviewId, END_SESSION_ERROR_MESSAGE)
        },
        onSettled: function onEndSettled() {
          if (isMountedRef.current) {
            isEndingRef.current = false
          }
        },
      },
    )
  }

  function handleBackToInterviews() {
    navigate({ to: '/interviews' })
  }

  const provisionData = provisionDataRef.current
  const mediaConfig = useMemo<MediaConnectionConfig | null>(() => {
    if (!provisionData) return null

    return {
      realtimeSessionId: provisionData.realtime.realtime_session_id,
      token: provisionData.realtime.token,
    }
  }, [provisionData])

  return (
    <SessionDumb
      interview={interviewQuery.data ?? null}
      isLoading={interviewQuery.isPending}
      status={state.status}
      errorMessage={errorMessage}
      whiteboardProvisionHandle={
        state.status === 'provisioned' ? whiteboardProvisionHandleRef.current : null
      }
      whiteboardStatus={state.whiteboardStatus}
      whiteboardErrorMessage={state.whiteboardErrorMessage}
      mediaConfig={mediaConfig}
      mediaErrorMessage={state.mediaErrorMessage}
      lifecycleControls={lifecycleControls}
      timer={timer}
      lifecycleErrorMessage={lifecycleErrorMessage}
      isStartingSession={startMutation.isPending}
      isEndingSession={endMutation.isPending}
      onJoin={handleJoin}
      onRetryWhiteboard={handleWhiteboardRetry}
      onWhiteboardConnecting={handleWhiteboardConnecting}
      onWhiteboardConnected={handleWhiteboardConnected}
      onWhiteboardReconnecting={handleWhiteboardReconnecting}
      onWhiteboardFailed={handleWhiteboardFailed}
      onMediaConnecting={handleMediaConnecting}
      onMediaConnected={handleMediaConnected}
      onMediaWaitingForPeer={handleMediaWaitingForPeer}
      onMediaReconnecting={handleMediaReconnecting}
      onMediaFailed={handleMediaFailed}
      onMediaPermissionError={handleMediaPermissionError}
      onStartSession={handleStartSession}
      onEndSession={handleEndSession}
      onBackToInterviews={handleBackToInterviews}
    />
  )
}
