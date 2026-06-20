import { useReducer, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useInterviewDetail, useProvisionInterview } from '#/hooks/use-interviews'
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

  const interviewQuery = useInterviewDetail(interviewId)
  const provisionMutation = useProvisionInterview()

  useEffect(
    function syncInterviewToState() {
      if (interviewQuery.data) {
        dispatch({ type: 'SET_INTERVIEW', payload: interviewQuery.data })
      }
    },
    [interviewQuery.data],
  )

  useEffect(
    function syncQueryErrorToState() {
      if (interviewQuery.isError) {
        dispatch({ type: 'FETCH_ERROR', payload: interviewQuery.error.message })
      }
    },
    [interviewQuery.isError, interviewQuery.error],
  )

  const handleJoin = useCallback(
    function handleJoin() {
      if (isDispatchingRef.current) return
      if (!canJoin(state)) return

      isDispatchingRef.current = true
      dispatch({ type: 'JOIN' })

      provisionMutation.mutate(
        { id: interviewId },
        {
          onSuccess: function onProvisionSuccess(data) {
            dispatch({ type: 'PROVISION_SUCCESS', payload: data })
            isDispatchingRef.current = false
          },
          onError: function onProvisionError(error) {
            dispatch({
              type: 'PROVISION_ERROR',
              payload: error.message,
            })
            isDispatchingRef.current = false
          },
        },
      )
    },
    [state.status, state.interview, interviewId, provisionMutation],
  )

  const handleBackToInterviews = useCallback(
    function handleBackToInterviews() {
      navigate({ to: '/interviews' })
    },
    [navigate],
  )



  return (
    <SessionDumb
      interview={state.interview}
      status={state.status}
      provisionData={state.provisionData}
      errorMessage={state.errorMessage}
      onJoin={handleJoin}
      onBackToInterviews={handleBackToInterviews}
    />
  )
}