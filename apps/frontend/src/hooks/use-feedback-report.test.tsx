import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeInterview } from '../routes/interviews/session/test-helpers'
import { ApiError } from '../lib/http-transport'
import {
  computeFeedbackPollDelayMs,
  feedbackPollDeadlineMs,
  isPollingFeedbackStatus,
  useFeedbackReport,
} from './use-feedback-report'

vi.mock('./use-interviews', async function mockUseInterviews() {
  const actual = await vi.importActual<typeof import('./use-interviews')>('./use-interviews')
  return {
    ...actual,
    useInterviewDetail: vi.fn(),
    fetchFeedbackStatus: vi.fn(),
  }
})

import { fetchFeedbackStatus, interviewDetailQueryKey, useInterviewDetail } from './use-interviews'

const interviewId = '11111111-1111-4111-8111-111111111111'

function mockUseInterviewDetail(
  overrides: Partial<ReturnType<typeof useInterviewDetail>>,
): ReturnType<typeof useInterviewDetail> {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useInterviewDetail>
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

describe('computeFeedbackPollDelayMs', function suite() {
  it('grows with each attempt and never exceeds the max delay', function run() {
    const first = computeFeedbackPollDelayMs(0)
    const second = computeFeedbackPollDelayMs(1)
    const far = computeFeedbackPollDelayMs(50)

    expect(second).toBeGreaterThan(first)
    expect(far).toBeLessThanOrEqual(20000)
  })
})

describe('isPollingFeedbackStatus', function suite() {
  it('is true only for pending and processing', function run() {
    expect(isPollingFeedbackStatus('pending')).toBe(true)
    expect(isPollingFeedbackStatus('processing')).toBe(true)
    expect(isPollingFeedbackStatus('ready')).toBe(false)
    expect(isPollingFeedbackStatus('failed')).toBe(false)
    expect(isPollingFeedbackStatus('not_started')).toBe(false)
    expect(isPollingFeedbackStatus(undefined)).toBe(false)
  })
})

describe('useFeedbackReport', function suite() {
  beforeEach(function setup() {
    vi.useFakeTimers()
    vi.mocked(fetchFeedbackStatus).mockReset()
    vi.mocked(useInterviewDetail).mockReset()
  })

  afterEach(function teardown() {
    vi.useRealTimers()
  })

  it('does not poll feedback-status when the report is already ready', async function run() {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'completed', feedback_status: 'ready' }),
      }),
    )

    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useFeedbackReport(interviewId), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async function flush() {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.isPolling).toBe(false)
    expect(fetchFeedbackStatus).not.toHaveBeenCalled()
  })

  it('polls feedback-status while processing and invalidates detail once ready', async function run() {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'completed', feedback_status: 'processing' }),
      }),
    )
    let callCount = 0
    vi.mocked(fetchFeedbackStatus).mockImplementation(async function respond() {
      callCount += 1
      return callCount < 2
        ? {
            feedback_status: 'processing',
            feedback_unavailable_reason: null,
            feedback_error_code: null,
            schema_version: null,
            prompt_version: null,
            updated_at: '2026-04-13T11:00:00.000Z',
          }
        : {
            feedback_status: 'ready',
            feedback_unavailable_reason: null,
            feedback_error_code: null,
            schema_version: 1,
            prompt_version: 'feedback-v1-2026-04-01',
            updated_at: '2026-04-13T11:05:00.000Z',
          }
    })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useFeedbackReport(interviewId), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async function flushInitialFetch() {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchFeedbackStatus).toHaveBeenCalledTimes(1)
    expect(result.current.isPolling).toBe(true)

    await act(async function flushUntilReady() {
      await vi.advanceTimersByTimeAsync(60000)
    })

    expect(vi.mocked(fetchFeedbackStatus).mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: interviewDetailQueryKey(interviewId),
    })
  })

  it('stops automatic polling after the client deadline and exposes the terminal state', async function run() {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'completed', feedback_status: 'processing' }),
      }),
    )
    vi.mocked(fetchFeedbackStatus).mockResolvedValue({
      feedback_status: 'processing',
      feedback_unavailable_reason: null,
      feedback_error_code: null,
      schema_version: null,
      prompt_version: null,
      updated_at: '2026-04-13T11:00:00.000Z',
    })

    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useFeedbackReport(interviewId), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async function flushInitialFetch() {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchFeedbackStatus).toHaveBeenCalledTimes(1)

    await act(async function passDeadline() {
      await vi.advanceTimersByTimeAsync(feedbackPollDeadlineMs + 5000)
    })

    expect(result.current.hasReachedPollingDeadline).toBe(true)
    expect(result.current.isPolling).toBe(false)

    const callsAtDeadline = vi.mocked(fetchFeedbackStatus).mock.calls.length
    await act(async function keepAdvancingPastDeadline() {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(vi.mocked(fetchFeedbackStatus).mock.calls.length).toBe(callsAtDeadline)
  })

  it('pauses polling while the document is hidden', async function run() {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'completed', feedback_status: 'processing' }),
      }),
    )
    vi.mocked(fetchFeedbackStatus).mockResolvedValue({
      feedback_status: 'processing',
      feedback_unavailable_reason: null,
      feedback_error_code: null,
      schema_version: null,
      prompt_version: null,
      updated_at: '2026-04-13T11:00:00.000Z',
    })

    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useFeedbackReport(interviewId), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async function flushInitialFetch() {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchFeedbackStatus).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    act(function notifyHidden() {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current.isPolling).toBe(false)

    const callsWhileHidden = vi.mocked(fetchFeedbackStatus).mock.calls.length
    await act(async function advanceWhileHidden() {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(vi.mocked(fetchFeedbackStatus).mock.calls.length).toBe(callsWhileHidden)

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    act(function notifyVisible() {
      document.dispatchEvent(new Event('visibilitychange'))
    })
  })

  it('derives a not-found error kind from a 404 ApiError', function run() {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({ error: new ApiError('Interview not found', 404) }),
    )
    const { result } = renderHook(() => useFeedbackReport(interviewId), {
      wrapper: makeWrapper(makeQueryClient()),
    })
    expect(result.current.errorKind).toBe('not-found')
  })

  it('derives an unauthenticated error kind from a 401 ApiError', function run() {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({ error: new ApiError('Unauthenticated', 401) }),
    )
    const { result } = renderHook(() => useFeedbackReport(interviewId), {
      wrapper: makeWrapper(makeQueryClient()),
    })
    expect(result.current.errorKind).toBe('unauthenticated')
  })

  it('derives a network error kind from any other failure', function run() {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({ error: new Error('boom') }),
    )
    const { result } = renderHook(() => useFeedbackReport(interviewId), {
      wrapper: makeWrapper(makeQueryClient()),
    })
    expect(result.current.errorKind).toBe('network')
  })

  it('refresh re-fetches detail and status without mutating server state', async function run() {
    const refetchDetail = vi.fn()
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'completed', feedback_status: 'processing' }),
        refetch: refetchDetail,
      }),
    )
    vi.mocked(fetchFeedbackStatus).mockResolvedValue({
      feedback_status: 'processing',
      feedback_unavailable_reason: null,
      feedback_error_code: null,
      schema_version: null,
      prompt_version: null,
      updated_at: '2026-04-13T11:00:00.000Z',
    })

    const { result } = renderHook(() => useFeedbackReport(interviewId), {
      wrapper: makeWrapper(makeQueryClient()),
    })

    await act(async function flushInitialFetch() {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchFeedbackStatus).toHaveBeenCalledTimes(1)

    await act(async function triggerManualRefresh() {
      result.current.refresh()
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(refetchDetail).toHaveBeenCalled()
    expect(vi.mocked(fetchFeedbackStatus).mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
