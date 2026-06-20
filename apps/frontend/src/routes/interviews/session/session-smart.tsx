import { useReducer, useRef } from 'react'
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
            payload: error.message,
          })
        },
      },
    )
  }

  function handleBackToInterviews() {
    navigate({ to: '/interviews' })
  }

  return (
    <SessionDumb
      interview={interviewQuery.data ?? null}
      isLoading={interviewQuery.isPending}
      status={state.status}
      errorMessage={errorMessage}
      onJoin={handleJoin}
      onBackToInterviews={handleBackToInterviews}
    />
  )
}
