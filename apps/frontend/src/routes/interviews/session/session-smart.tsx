import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useInterviewDetail, useProvisionInterview } from '#/hooks/use-interviews'
import type { WhiteboardProvisionHandle } from '#/components/interviews/whiteboard'
import type { ProvisionInterviewResponse } from '@mako/shared'
import type { MediaConnectionConfig } from '#/components/interviews/media'
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

type SessionSmartProps = {
  interviewId: string
}

const LOAD_INTERVIEW_ERROR_MESSAGE = 'Unable to load interview details. Please try again.'
const JOIN_SESSION_ERROR_MESSAGE = 'Failed to join session. Please try again.'

export function SessionSmart({ interviewId }: SessionSmartProps) {
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState)
  const isDispatchingRef = useRef(false)
  const whiteboardProvisionHandleRef = useRef<WhiteboardProvisionHandle | null>(null)
  const provisionDataRef = useRef<ProvisionInterviewResponse | null>(null)
  const isMountedRef = useRef(true)

  const interviewQuery = useInterviewDetail(interviewId)
  const provisionMutation = useProvisionInterview()

  const queryErrorMessage =
    interviewQuery.isError && state.status === 'idle' ? LOAD_INTERVIEW_ERROR_MESSAGE : null
  const errorMessage = state.errorMessage || queryErrorMessage

  useEffect(function clearProvisionOnUnmount() {
    isMountedRef.current = true
    return function cleanup() {
      isMountedRef.current = false
      clearWhiteboardProvisionHandle(whiteboardProvisionHandleRef.current)
    }
  }, [])

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
    error: 'denied' | 'system-denied' | 'device-unavailable',
  ) {
    const messages = {
      denied: 'Camera or microphone access was denied. Please check your browser permissions.',
      'system-denied': 'Camera or microphone access was blocked by your system. Please check system preferences.',
      'device-unavailable': 'Camera or microphone is not available. Please check your devices.',
    }
    dispatch({ type: 'MEDIA_FAILED', payload: messages[error] })
  }, [])

  function handleBackToInterviews() {
    navigate({ to: '/interviews' })
  }

  const mediaConfig: MediaConnectionConfig | null = provisionDataRef.current
    ? {
        realtimeSessionId: provisionDataRef.current.realtime.realtime_session_id,
        token: provisionDataRef.current.realtime.token,
      }
    : null

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
      mediaStatus={state.mediaStatus}
      mediaErrorMessage={state.mediaErrorMessage}
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
      onBackToInterviews={handleBackToInterviews}
    />
  )
}
