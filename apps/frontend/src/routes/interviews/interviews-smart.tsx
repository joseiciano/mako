import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { InterviewListItem } from '@mako/shared'
import {
  useInterviews,
  useCancelInterview,
} from '#/hooks/use-interviews'
import { useAccount } from '#/hooks/use-account'
import {
  InterviewsDumb,
  type CancelStatus,
} from './interviews-dumb'

export const genericCancelSuccessMessage = 'Interview cancelled successfully.'
export const schedulerCancelNoRefundMessage =
  'Your premium interview was cancelled. Scheduler-initiated cancellations are not refunded.'
export const interviewerCancelRefundedMessage =
  'Premium interview cancelled. The scheduler\u2019s credit was refunded.'
export const interviewerSchedulerCancelledMessage =
  'Premium interview cancelled by the scheduler.'

export function buildCancelSuccessMessage(
  interview:
    | Pick<
        InterviewListItem,
        | 'booking_channel'
        | 'scheduler_id'
        | 'interviewer_id'
        | 'cancellation_reason'
      >
    | undefined,
  currentUserId: string | undefined,
): string {
  if (interview?.booking_channel !== 'verified_interviewer' || !currentUserId) {
    return genericCancelSuccessMessage
  }

  if (
    interview.cancellation_reason === 'interviewer_cancelled' ||
    interview.cancellation_reason === 'interviewer_account_deleted'
  ) {
    return interviewerCancelRefundedMessage
  }

  if (interview.scheduler_id === currentUserId) {
    return schedulerCancelNoRefundMessage
  }

  if (interview.interviewer_id === currentUserId) {
    if (interview.cancellation_reason === null) {
      return interviewerSchedulerCancelledMessage
    }
    return interviewerCancelRefundedMessage
  }

  return genericCancelSuccessMessage
}

export function InterviewsSmart() {
  const interviewsQuery = useInterviews()
  const cancelInterviewMutation = useCancelInterview()
  const accountQuery = useAccount()
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

  const handleNavigateToSession = useCallback(
    function handleNavigateToSession(id: string) {
      navigate({ to: '/interviews/$id/session', params: { id } })
    },
    [navigate],
  )

  const handleNavigateToDetails = useCallback(
    function handleNavigateToDetails(id: string) {
      navigate({ to: '/interviews/$id', params: { id } })
    },
    [navigate],
  )

  const handleNavigateToFeedback = useCallback(
    function handleNavigateToFeedback(id: string) {
      navigate({ to: '/interviews/$id/feedback', params: { id } })
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
            const cancelledInterview = interviewsQuery.data?.find(
              function findCancelledInterview(interview) {
                return interview.id === id
              },
            )
            setCancelStatus({
              type: 'success',
              message: buildCancelSuccessMessage(
                cancelledInterview,
                accountQuery.data?.id,
              ),
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
    [cancelInterviewMutation, interviewsQuery.data, accountQuery.data],
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
      onNavigateToDetails={handleNavigateToDetails}
      onNavigateToSession={handleNavigateToSession}
      onNavigateToFeedback={handleNavigateToFeedback}
    />
  )
}
