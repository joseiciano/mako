import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionSmart } from './session-smart'
import type { InterviewDetail } from '@mako/shared'

vi.mock('#/hooks/use-interviews', function () {
  return {
    useInterviewDetail: vi.fn(),
    useProvisionInterview: vi.fn(),
  }
})

vi.mock('@tanstack/react-router', function () {
  return {
    useNavigate: vi.fn(),
  }
})

vi.mock('#/components/interviews/whiteboard', function () {
  return {
    WhiteboardSmart: vi.fn(function WhiteboardSmart(props: any) {
      return (
        <section data-testid="whiteboard-smart">
          <h2>Whiteboard</h2>
          <p>Whiteboard ready</p>
          <button onClick={props.onRetryJoin} type="button">
            Retry join
          </button>
        </section>
      )
    }),
  }
})

import { useInterviewDetail, useProvisionInterview } from '#/hooks/use-interviews'
import { useNavigate } from '@tanstack/react-router'
import { WhiteboardSmart } from '#/components/interviews/whiteboard'

function makeInterview(overrides?: Partial<InterviewDetail>): InterviewDetail {
  return {
    id: 'int-1',
    scheduler_id: 'sch-1',
    scheduler_alias: 'Bob',
    interviewer_id: 'intv-1',
    interviewer_alias: 'Alice',
    type: 'behavioral',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-06-20T10:00:00Z',
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    created_at: '2026-06-19T10:00:00Z',
    updated_at: '2026-06-19T10:00:00Z',
    ...overrides,
  }
}

function mockUseInterviewDetail(
  overrides: Partial<ReturnType<typeof useInterviewDetail>>,
): ReturnType<typeof useInterviewDetail> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    fetchStatus: 'idle',
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: false,
    refetch: vi.fn(),
    status: 'pending',
    ...overrides,
  } as unknown as ReturnType<typeof useInterviewDetail>
}

function mockUseProvisionInterview(
  overrides: Partial<ReturnType<typeof useProvisionInterview>>,
): ReturnType<typeof useProvisionInterview> {
  return {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isIdle: true,
    isPaused: false,
    isPending: false,
    isSuccess: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    status: 'idle',
    submittedAt: 0,
    variables: undefined,
    ...overrides,
  } as unknown as ReturnType<typeof useProvisionInterview>
}

const mockNavigate = vi.fn()
const mockMutate = vi.fn()

beforeEach(function () {
  vi.clearAllMocks()
  vi.mocked(useNavigate).mockReturnValue(mockNavigate)
  vi.mocked(useProvisionInterview).mockReturnValue(mockUseProvisionInterview({
    mutate: mockMutate,
    isPending: false,
  }))
})

describe('SessionSmart', function () {
  it('shows loading when interview query is pending', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    }))
    render(<SessionSmart interviewId="int-1" />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('shows error when interview query fails', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('postgres://secret@internal-db.local/query failed'),
    }))
    render(<SessionSmart interviewId="int-1" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load interview details. Please try again.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('postgres://secret')
  })

  it('shows join flow when interview loaded', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: makeInterview(),
      isPending: false,
      isError: false,
      error: null,
    }))
    render(<SessionSmart interviewId="int-1" />)
    expect(screen.getByText('Ready to Join')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join session/i })).toBeInTheDocument()
  })

  it('calls navigate to /interviews on back button click', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
    }))
    render(<SessionSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /back to interviews/i }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/interviews' })
  })

  it('calls provision mutation on join click', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: makeInterview(),
      isPending: false,
      isError: false,
      error: null,
    }))
    render(<SessionSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /join session/i }))
    expect(mockMutate).toHaveBeenCalledWith(
      { id: 'int-1' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('shows safe copy when provision mutation fails', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: makeInterview(),
      isPending: false,
      isError: false,
      error: null,
    }))

    let errorCallback: ((error: Error) => void) | undefined
    vi.mocked(useProvisionInterview).mockReturnValue(mockUseProvisionInterview({
      mutate: vi.fn(function mockMutate(_params: any, options: any) {
        errorCallback = options.onError
      }),
      isPending: false,
    }))

    render(<SessionSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /join session/i }))

    errorCallback?.(new Error('SQL failed at postgres://secret@internal-db.local'))

    await waitFor(function () {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to join session. Please try again.')
    })
    expect(screen.getByRole('alert')).not.toHaveTextContent('postgres://secret')
  })

  it('ignores rapid duplicate join clicks while provision is in flight', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: makeInterview(),
      isPending: false,
      isError: false,
      error: null,
    }))

    render(<SessionSmart interviewId="int-1" />)

    const joinButton = screen.getByRole('button', { name: /join session/i })
    act(function clickTwiceBeforeRerender() {
      fireEvent.click(joinButton)
      fireEvent.click(joinButton)
    })

    expect(mockMutate).toHaveBeenCalledTimes(1)
  })

  it('shows joining state after join dispatched', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: makeInterview(),
      isPending: false,
      isError: false,
      error: null,
    }))
    vi.mocked(useProvisionInterview).mockReturnValue(mockUseProvisionInterview({
      mutate: vi.fn(),
      isPending: true,
    }))
    render(<SessionSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /join session/i }))
    expect(screen.getByText('Joining session...')).toBeInTheDocument()
  })

  it('shows provisioned state after provision success', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: makeInterview(),
      isPending: false,
      isError: false,
      error: null,
    }))

    let successCallback: ((data: any) => void) | undefined
    vi.mocked(useProvisionInterview).mockReturnValue(mockUseProvisionInterview({
      mutate: vi.fn(function mockMutate(_params: any, options: any) {
        successCallback = options.onSuccess
      }),
      isPending: false,
    }))

    render(<SessionSmart interviewId="int-1" />)

    // Trigger the mutation to capture the success callback
    await user.click(screen.getByRole('button', { name: /join session/i }))

    // Simulate successful provision
    successCallback?.({
      mode: 'ai_led',
      realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
      excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
    })

    // Wait for React to process the dispatch and re-render
    await waitFor(function () {
      expect(screen.getByText('Whiteboard')).toBeInTheDocument()
    })
    expect(WhiteboardSmart).toHaveBeenCalled()
    const whiteboardProps = vi.mocked(WhiteboardSmart).mock.calls.at(-1)?.[0]
    expect(whiteboardProps).toEqual(
      expect.objectContaining({
        provisionedWhiteboardHandle: expect.any(String),
      }),
    )
    expect(JSON.stringify(whiteboardProps)).not.toContain('token-1')
    expect(JSON.stringify(whiteboardProps)).not.toContain('key-1')
    expect(screen.queryByText('key-1')).not.toBeInTheDocument()
    expect(screen.queryByText('token-1')).not.toBeInTheDocument()
  })

  it('does not reprovision during transient whiteboard reconnecting state', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: makeInterview(),
      isPending: false,
      isError: false,
      error: null,
    }))

    let successCallback: ((data: any) => void) | undefined
    vi.mocked(useProvisionInterview).mockReturnValue(mockUseProvisionInterview({
      mutate: vi.fn(function mockMutate(_params: any, options: any) {
        successCallback = options.onSuccess
      }),
      isPending: false,
    }))

    render(<SessionSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /join session/i }))
    successCallback?.({
      mode: 'ai_led',
      realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
      excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
    })

    await waitFor(function () {
      expect(screen.getByTestId('whiteboard-smart')).toBeInTheDocument()
    })

    const firstCallCount = vi.mocked(useProvisionInterview().mutate).mock.calls.length
    const whiteboardProps = vi.mocked(WhiteboardSmart).mock.calls.at(-1)?.[0]
    act(function reconnecting() {
      whiteboardProps?.onReconnecting()
    })

    expect(vi.mocked(useProvisionInterview().mutate).mock.calls.length).toBe(firstCallCount)
  })

  it('dispatches WHITEBOARD_RECONNECTING when retry button clicked in provisioned failed state', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: makeInterview(),
      isPending: false,
      isError: false,
      error: null,
    }))

    let successCallback: ((data: any) => void) | undefined
    vi.mocked(useProvisionInterview).mockReturnValue(mockUseProvisionInterview({
      mutate: vi.fn(function mockMutate(_params: any, options: any) {
        successCallback = options.onSuccess
      }),
      isPending: false,
    }))

    render(<SessionSmart interviewId="int-1" />)

    // Join and provision successfully
    await user.click(screen.getByRole('button', { name: /join session/i }))
    successCallback?.({
      mode: 'ai_led',
      realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
      excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
    })

    await waitFor(function () {
      expect(screen.getByTestId('whiteboard-smart')).toBeInTheDocument()
    })

    // Simulate whiteboard failure via the WhiteboardSmart onFailed callback
    const whiteboardProps = vi.mocked(WhiteboardSmart).mock.calls.at(-1)?.[0]
    act(function triggerWhiteboardFailed() {
      whiteboardProps?.onFailed('Connection lost')
    })

    // Wait for retry button (always visible in mock, but wait for re-render)
    await waitFor(function () {
      expect(screen.getByRole('button', { name: /retry join/i })).toBeInTheDocument()
    })

    // Click retry — invokes handleWhiteboardRetry which dispatches WHITEBOARD_RECONNECTING
    await user.click(screen.getByRole('button', { name: /retry join/i }))

    // WhiteboardSmart receives updated props with reconnecting status
    const updatedProps = vi.mocked(WhiteboardSmart).mock.calls.at(-1)?.[0]
    expect(updatedProps).toEqual(
      expect.objectContaining({
        connectionStatus: 'reconnecting',
      }),
    )
  })

  it('recovers from transient provision failure on retry', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: makeInterview(),
      isPending: false,
      isError: false,
      error: null,
    }))

    let mutateCallCount = 0
    let successCallback: ((data: any) => void) | undefined
    let errorCallback: ((error: Error) => void) | undefined
    vi.mocked(useProvisionInterview).mockReturnValue(mockUseProvisionInterview({
      mutate: vi.fn(function mockMutate(_params: any, options: any) {
        mutateCallCount += 1
        if (mutateCallCount === 1) {
          errorCallback = options.onError
        } else {
          successCallback = options.onSuccess
        }
      }),
      isPending: false,
    }))

    render(<SessionSmart interviewId="int-1" />)

    // First attempt fails
    await user.click(screen.getByRole('button', { name: /join session/i }))
    errorCallback?.(new Error('Network timeout'))

    await waitFor(function () {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to join session. Please try again.')
    })

    // Retry succeeds
    await user.click(screen.getByRole('button', { name: /retry/i }))
    successCallback?.({
      mode: 'ai_led',
      realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
      excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
    })

    await waitFor(function () {
      expect(screen.getByTestId('whiteboard-smart')).toBeInTheDocument()
    })

    expect(mutateCallCount).toBe(2)
  })

  it('does not show join CTA after successful provisioning', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
      data: makeInterview(),
      isPending: false,
      isError: false,
      error: null,
    }))

    let successCallback: ((data: any) => void) | undefined
    vi.mocked(useProvisionInterview).mockReturnValue(mockUseProvisionInterview({
      mutate: vi.fn(function mockMutate(_params: any, options: any) {
        successCallback = options.onSuccess
      }),
      isPending: false,
    }))

    render(<SessionSmart interviewId="int-1" />)

    // Join and provision successfully
    await user.click(screen.getByRole('button', { name: /join session/i }))
    successCallback?.({
      mode: 'ai_led',
      realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
      excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
    })

    await waitFor(function () {
      expect(screen.getByTestId('whiteboard-smart')).toBeInTheDocument()
    })

    // Join button should not be present after provisioning
    expect(screen.queryByRole('button', { name: /join session/i })).not.toBeInTheDocument()
  })
})
