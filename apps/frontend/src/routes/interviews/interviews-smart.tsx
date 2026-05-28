import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { InterviewListItem } from '@mako/shared'
import {
  useInterviews,
  useCancelInterview,
} from '#/hooks/use-interviews'
import {
  InterviewsDumb,
  type CancelStatus,
} from './interviews-dumb'

export function InterviewsSmart() {
  const interviewsQuery = useInterviews()
  const cancelInterviewMutation = useCancelInterview()
  const navigate = useNavigate()
  const [cancelStatus, setCancelStatus] = useState<CancelStatus | null>(null)
  const [cancellingInterviewId, setCancellingInterviewId] = useState<
    string | null
  >(null)

  const handleNavigateToNewInterview = useCallback(
    function handleNavigateToNewInterview() {
      navigate({ to: '/interviews/new' })
    },
    [navigate],
  )

  const { upcoming, history } = useMemo(function splitInterviews() {
    const all = interviewsQuery.data ?? []

    return all.reduce<{
      upcoming: InterviewListItem[]
      history: InterviewListItem[]
    }>(
      function partition(acc, interview) {
        if (interview.status === 'scheduled' || interview.status === 'ongoing') {
          acc.upcoming.push(interview)
        } else {
          acc.history.push(interview)
        }

        return acc
      },
      { upcoming: [], history: [] },
    )
  }, [interviewsQuery.data])

  const handleCancelInterview = useCallback(
    function handleCancelInterview(id: string) {
      setCancellingInterviewId(id)
      setCancelStatus(null)

      cancelInterviewMutation.mutate(
        { id },
        {
          onSuccess: function onCancelSuccess() {
            setCancelStatus({
              type: 'success',
              message: 'Interview cancelled successfully.',
            })
            setCancellingInterviewId(null)
          },
          onError: function onCancelError(error) {
            setCancelStatus({
              type: 'error',
              message: error.message,
            })
            setCancellingInterviewId(null)
          },
        },
      )
    },
    [cancelInterviewMutation],
  )

  if (interviewsQuery.isPending) {
    return (
      <InterviewsDumb
        state="loading"
        onNavigateToNewInterview={handleNavigateToNewInterview}
      />
    )
  }

  if (interviewsQuery.isError) {
    return (
      <InterviewsDumb
        state="error"
        errorMessage={interviewsQuery.error.message}
        onNavigateToNewInterview={handleNavigateToNewInterview}
      />
    )
  }

  if (!interviewsQuery.data) {
    return (
      <InterviewsDumb
        state="error"
        errorMessage="Unable to load interviews."
        onNavigateToNewInterview={handleNavigateToNewInterview}
      />
    )
  }

  if (upcoming.length === 0 && history.length === 0) {
    return (
      <InterviewsDumb
        state="empty"
        onNavigateToNewInterview={handleNavigateToNewInterview}
      />
    )
  }

  return (
    <InterviewsDumb
      state="populated"
      upcomingInterviews={upcoming}
      historyInterviews={history}
      cancelStatus={cancelStatus}
      cancellingInterviewId={cancellingInterviewId}
      onCancelInterview={handleCancelInterview}
      onNavigateToNewInterview={handleNavigateToNewInterview}
    />
  )
}
