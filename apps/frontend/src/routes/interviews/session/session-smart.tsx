import { useCallback, useReducer, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useInterviewDetail, useProvisionInterview } from '#/hooks/use-interviews'
import type { ProvisionInterviewResponse } from '@mako/shared'
import { SessionDumb } from './session-dumb'
import {
  initialSessionState,
  sessionReducer,
  canJoin,
} from './session-flow'

type SessionSmartProps = {
  interviewId: string
}

export function SessionSmart({ interviewId }: SessionSmartProps) {
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState)
  const isDispatchingRef = useRef(false)
  const provisionDataRef = useRef<ProvisionInterviewResponse | null>(null)

  const interviewQuery = useInterviewDetail(interviewId)
  const provisionMutation = useProvisionInterview()

  // Sanitize query error: cap at 200 chars, only surface when join flow is idle
  const rawQueryError =
    interviewQuery.isError && state.status === 'idle'
      ? interviewQuery.error.message.slice(0, 200)
      : null
  const errorMessage = state.errorMessage || rawQueryError

  function handleJoin() {
    if (isDispatchingRef.current || !canJoin(state, interviewQuery.data ?? null)) return

    requestProvision()
  }

  function handleWhiteboardRetry() {
    if (
      isDispatchingRef.current ||
      state.status !== 'provisioned' ||
      state.whiteboardStatus !== 'failed' ||
      !interviewQuery.data
    ) {
      return
    }

    dispatch({ type: 'WHITEBOARD_RECONNECTING' })
  }

  function requestProvision() {
    if (isDispatchingRef.current) return

    isDispatchingRef.current = true
    dispatch({ type: 'JOIN' })

    provisionMutation.mutate(
      { id: interviewId },
      {
        onSuccess: function onProvisionSuccess(data) {
          provisionDataRef.current = data
          isDispatchingRef.current = false
          dispatch({ type: 'PROVISION_SUCCESS' })
        },
        onError: function onProvisionError(error) {
          isDispatchingRef.current = false
          dispatch({
            type: 'PROVISION_ERROR',
            payload: error.message.slice(0, 200),
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

  function handleBackToInterviews() {
    navigate({ to: '/interviews' })
  }

  return (
    <SessionDumb
      interview={interviewQuery.data ?? null}
      isLoading={interviewQuery.isPending}
      status={state.status}
      errorMessage={errorMessage}
      whiteboardProvision={
        state.status === 'provisioned' ? provisionDataRef.current : null
      }
      whiteboardStatus={state.whiteboardStatus}
      whiteboardErrorMessage={state.whiteboardErrorMessage}
      onJoin={handleJoin}
      onRetryWhiteboard={handleWhiteboardRetry}
      onWhiteboardConnecting={handleWhiteboardConnecting}
      onWhiteboardConnected={handleWhiteboardConnected}
      onWhiteboardReconnecting={handleWhiteboardReconnecting}
      onWhiteboardFailed={handleWhiteboardFailed}
      onBackToInterviews={handleBackToInterviews}
    />
  )
}
