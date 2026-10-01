import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FeedbackStatus, InterviewDetail } from '@mako/shared'
import { ApiError } from '../lib/http-transport'
import {
  feedbackStatusQueryKey,
  fetchFeedbackStatus,
  interviewDetailQueryKey,
  useInterviewDetail,
} from './use-interviews'

/** Base delay before the first feedback-status poll retry. */
export const feedbackPollBaseDelayMs = 3000
/** Upper bound on the backoff delay between feedback-status polls. */
export const feedbackPollMaxDelayMs = 20000
/** Multiplier applied to the delay after each poll attempt. */
export const feedbackPollBackoffMultiplier = 1.5
/** Client-side ceiling on how long automatic polling keeps running. */
export const feedbackPollDeadlineMs = 5 * 60 * 1000

const pollingFeedbackStatuses = new Set<FeedbackStatus>(['pending', 'processing'])

export type FeedbackReportErrorKind = 'not-found' | 'unauthenticated' | 'network'

export type UseFeedbackReportResult = {
  interview: InterviewDetail | null
  isLoading: boolean
  errorKind: FeedbackReportErrorKind | null
  isPolling: boolean
  hasReachedPollingDeadline: boolean
  refresh: () => void
}

/**
 * Computes the next feedback-status poll delay (ms) for a given attempt
 * count, using bounded exponential backoff.
 */
export function computeFeedbackPollDelayMs(attempt: number): number {
  const delay = feedbackPollBaseDelayMs * feedbackPollBackoffMultiplier ** Math.max(attempt, 0)
  return Math.min(feedbackPollMaxDelayMs, Math.round(delay))
}

export function isPollingFeedbackStatus(status: FeedbackStatus | undefined): boolean {
  return status !== undefined && pollingFeedbackStatuses.has(status)
}

/**
 * Drives the post-interview feedback report: reuses the canonical interview
 * detail query for the full report payload, and narrowly polls the
 * lightweight feedback-status route while a report is pending/processing so
 * the UI learns about completion without re-downloading the full detail
 * (including transcript) on every tick.
 *
 * Polling uses bounded backoff, never runs in the background tab, pauses
 * while the document is hidden, and stops automatically after a client-side
 * deadline in favor of a manual refresh that never mutates server state.
 */
export function useFeedbackReport(interviewId: string): UseFeedbackReportResult {
  const queryClient = useQueryClient()
  const interviewQuery = useInterviewDetail(interviewId)
  const interview = interviewQuery.data ?? null
  const feedbackStatus = interview?.feedback_status
  const shouldPoll = isPollingFeedbackStatus(feedbackStatus)

  const attemptRef = useRef(0)
  const invalidatedOnReadyRef = useRef(false)
  const hasReachedDeadlineRef = useRef(false)
  const [hasReachedPollingDeadline, setHasReachedPollingDeadline] = useState(false)
  const [isDocumentHidden, setIsDocumentHidden] = useState(function getInitialVisibility() {
    return typeof document === 'undefined' ? false : document.hidden
  })

  useEffect(function trackDocumentVisibility() {
    if (typeof document === 'undefined') return

    function handleVisibilityChange() {
      setIsDocumentHidden(document.hidden)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return function cleanup() {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Arm a client-side deadline for however long polling is active; once it
  // fires, automatic polling stops in favor of the manual refresh action.
  useEffect(function armPollingDeadline() {
    hasReachedDeadlineRef.current = false
    setHasReachedPollingDeadline(false)

    if (!shouldPoll) return

    const timeoutId = setTimeout(function markDeadlineReached() {
      hasReachedDeadlineRef.current = true
      setHasReachedPollingDeadline(true)
    }, feedbackPollDeadlineMs)

    return function cleanup() {
      clearTimeout(timeoutId)
    }
  }, [shouldPoll, interviewId])

  const statusQuery = useQuery({
    queryKey: feedbackStatusQueryKey(interviewId),
    queryFn: function getFeedbackStatusQuery({ signal }) {
      attemptRef.current += 1
      return fetchFeedbackStatus(fetch, interviewId, signal)
    },
    enabled: shouldPoll,
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: function computeNextPollInterval() {
      if (!shouldPoll || isDocumentHidden || hasReachedDeadlineRef.current) {
        return false
      }
      return computeFeedbackPollDelayMs(attemptRef.current)
    },
  })

  useEffect(function invalidateDetailWhenReady() {
    if (!statusQuery.data) return

    if (statusQuery.data.feedback_status === 'ready') {
      if (!invalidatedOnReadyRef.current) {
        invalidatedOnReadyRef.current = true
        void queryClient.invalidateQueries({
          queryKey: interviewDetailQueryKey(interviewId),
        })
      }
      return
    }

    invalidatedOnReadyRef.current = false
  }, [statusQuery.data, interviewId, queryClient])

  const refresh = useCallback(function refresh() {
    attemptRef.current = 0
    hasReachedDeadlineRef.current = false
    setHasReachedPollingDeadline(false)
    void interviewQuery.refetch()
    if (shouldPoll) {
      void statusQuery.refetch()
    }
  }, [interviewQuery, shouldPoll, statusQuery])

  return {
    interview,
    isLoading: interviewQuery.isPending,
    errorKind: deriveFeedbackReportErrorKind(interviewQuery.error),
    isPolling: shouldPoll && !hasReachedPollingDeadline && !isDocumentHidden,
    hasReachedPollingDeadline,
    refresh,
  }
}

function deriveFeedbackReportErrorKind(error: unknown): FeedbackReportErrorKind | null {
  if (!error) return null

  if (error instanceof ApiError) {
    if (error.status === 404) return 'not-found'
    if (error.status === 401) return 'unauthenticated'
  }

  return 'network'
}
