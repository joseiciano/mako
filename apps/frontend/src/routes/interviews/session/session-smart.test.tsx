import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionSmart } from './session-smart'
import { makeInterview } from './test-helpers'

vi.mock('#/hooks/use-interviews', function () {
  return {
    useInterviewDetail: vi.fn(),
    useProvisionInterview: vi.fn(),
    useStartInterview: vi.fn(),
    useEndInterview: vi.fn(),
    useAIChat: vi.fn(),
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

vi.mock('#/components/interviews/media', function () {
  return {
    MediaSmart: vi.fn(function MediaSmart(props: any) {
      return (
        <section data-testid="media-smart">
          <h2>Media</h2>
          <p>Media ready</p>
          <button onClick={props.onReconnect} type="button">
            Retry media
          </button>
        </section>
      )
    }),
  }
})

import {
  useInterviewDetail,
  useProvisionInterview,
  useStartInterview,
  useEndInterview,
  useAIChat,
} from '#/hooks/use-interviews'
import { useNavigate } from '@tanstack/react-router'
import { WhiteboardSmart } from '#/components/interviews/whiteboard'
import { MediaSmart } from '#/components/interviews/media'

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
const mockStartMutate = vi.fn()
const mockEndMutate = vi.fn()
const mockAiChatMutate = vi.fn()

function mockUseAIChat(
  overrides: Partial<ReturnType<typeof useAIChat>>,
): ReturnType<typeof useAIChat> {
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
  } as unknown as ReturnType<typeof useAIChat>
}

function mockUseStartInterview(
  overrides: Partial<ReturnType<typeof useStartInterview>>,
): ReturnType<typeof useStartInterview> {
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
  } as unknown as ReturnType<typeof useStartInterview>
}

function mockUseEndInterview(
  overrides: Partial<ReturnType<typeof useEndInterview>>,
): ReturnType<typeof useEndInterview> {
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
  } as unknown as ReturnType<typeof useEndInterview>
}

beforeEach(function () {
  vi.clearAllMocks()
  vi.mocked(useNavigate).mockReturnValue(mockNavigate)
  vi.mocked(useProvisionInterview).mockReturnValue(mockUseProvisionInterview({
    mutate: mockMutate,
    isPending: false,
  }))
  vi.mocked(useStartInterview).mockReturnValue(mockUseStartInterview({
    mutate: mockStartMutate,
    isPending: false,
  }))
  vi.mocked(useEndInterview).mockReturnValue(mockUseEndInterview({
    mutate: mockEndMutate,
    isPending: false,
  }))
  vi.mocked(useAIChat).mockReturnValue(mockUseAIChat({
    mutate: mockAiChatMutate,
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

  it('ignores provision errors after unmount', async function () {
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

    const { unmount } = render(<SessionSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /join session/i }))
    unmount()

    expect(function callErrorAfterUnmount() {
      errorCallback?.(new Error('Network failed'))
    }).not.toThrow()
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

    // MediaSmart should also be rendered
    expect(MediaSmart).toHaveBeenCalled()
    const mediaProps = vi.mocked(MediaSmart).mock.calls.at(-1)?.[0]
    expect(mediaProps).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          realtimeSessionId: 'rt-1',
          token: 'token-1',
        }),
      }),
    )
  })

  it('keeps media config object stable across session re-renders', async function () {
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
      expect(MediaSmart).toHaveBeenCalled()
    })

    const firstConfig = vi.mocked(MediaSmart).mock.calls.at(-1)?.[0].config
    const mediaProps = vi.mocked(MediaSmart).mock.calls.at(-1)?.[0]

    act(function triggerMediaStateChange() {
      mediaProps?.onConnecting?.()
    })

    const latestConfig = vi.mocked(MediaSmart).mock.calls.at(-1)?.[0].config
    expect(latestConfig).toBe(firstConfig)
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

  it('passes media config to MediaSmart without exposing sensitive values in UI', async function () {
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
      mode: 'peer_to_peer',
      realtime: { realtime_session_id: 'rt-session-123', token: 'rt-token-abc' },
      excalidraw: { excalidraw_room_id: 'wb-room-123', excalidraw_key: 'wb-key-abc' },
    })

    await waitFor(function () {
      expect(screen.getByTestId('media-smart')).toBeInTheDocument()
    })

    const mediaProps = vi.mocked(MediaSmart).mock.calls.at(-1)?.[0]
    expect(mediaProps?.config?.realtimeSessionId).toBe('rt-session-123')
    expect(mediaProps?.config?.token).toBe('rt-token-abc')

    // Sensitive values should not appear in the rendered DOM
    expect(screen.queryByText('rt-token-abc')).not.toBeInTheDocument()
    expect(screen.queryByText('wb-key-abc')).not.toBeInTheDocument()
  })

  describe('lifecycle controls', function () {
    function renderAndProvision(
      interview: ReturnType<typeof makeInterview>,
    ): { provisionSuccessCallback: (data: any) => void } {
      let provisionSuccessCallback: ((data: any) => void) | undefined

      vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
        data: interview,
        isPending: false,
        isError: false,
        error: null,
      }))
      vi.mocked(useProvisionInterview).mockReturnValue(mockUseProvisionInterview({
        mutate: vi.fn(function mockProvisionMutate(_params: any, options: any) {
          provisionSuccessCallback = options.onSuccess
        }),
        isPending: false,
      }))

      render(<SessionSmart interviewId="int-1" />)

      // Click join to trigger provision
      const joinButton = screen.getByRole('button', { name: /join session/i })
      act(function provision() {
        joinButton.click()
      })

      return {
        provisionSuccessCallback: provisionSuccessCallback!,
      }
    }

    it('shows start button when provisioned and scheduled', function () {
      const { provisionSuccessCallback } = renderAndProvision(
        makeInterview({ status: 'scheduled' }),
      )

      act(function triggerSuccess() {
        provisionSuccessCallback({
          mode: 'ai_led',
          realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
          excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
        })
      })

      expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument()
      expect(screen.queryByText(/join the interview environment before starting/i)).not.toBeInTheDocument()
    })

    it('shows helper message when scheduled but not provisioned', function () {
      vi.mocked(useInterviewDetail).mockReturnValue(mockUseInterviewDetail({
        data: makeInterview({ status: 'scheduled' }),
        isPending: false,
        isError: false,
        error: null,
      }))

      render(<SessionSmart interviewId="int-1" />)

      expect(screen.getByText(/join the interview environment before starting/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument()
    })

    it('calls start mutation on start click', async function () {
      const user = userEvent.setup()
      const { provisionSuccessCallback } = renderAndProvision(
        makeInterview({ status: 'scheduled' }),
      )

      act(function triggerSuccess() {
        provisionSuccessCallback({
          mode: 'ai_led',
          realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
          excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
        })
      })

      await user.click(screen.getByRole('button', { name: /start session/i }))

      expect(mockStartMutate).toHaveBeenCalledWith(
        { id: 'int-1' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
          onSettled: expect.any(Function),
        }),
      )
    })

    it('ignores duplicate start clicks while mutation is in flight', function () {
      const { provisionSuccessCallback } = renderAndProvision(
        makeInterview({ status: 'scheduled' }),
      )

      act(function triggerSuccess() {
        provisionSuccessCallback({
          mode: 'ai_led',
          realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
          excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
        })
      })

      const startButton = screen.getByRole('button', { name: /start session/i })
      act(function clickTwice() {
        startButton.click()
        startButton.click()
      })

      expect(mockStartMutate).toHaveBeenCalledTimes(1)
    })

    it('shows safe lifecycle error when start mutation fails', async function () {
      const user = userEvent.setup()

      let startErrorCallback: ((error: Error) => void) | undefined
      vi.mocked(useStartInterview).mockReturnValue(mockUseStartInterview({
        mutate: vi.fn(function mockStartMutate(_params: any, options: any) {
          startErrorCallback = options.onError
        }),
        isPending: false,
      }))

      const { provisionSuccessCallback } = renderAndProvision(
        makeInterview({ status: 'scheduled' }),
      )

      act(function triggerSuccess() {
        provisionSuccessCallback({
          mode: 'ai_led',
          realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
          excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
        })
      })

      await user.click(screen.getByRole('button', { name: /start session/i }))

      startErrorCallback?.(new Error('postgres://secret@internal-db.local could not start'))

      await waitFor(function () {
        expect(screen.getByRole('alert')).toHaveTextContent('Unable to start session. Please try again.')
      })
      expect(screen.getByRole('alert')).not.toHaveTextContent('postgres://secret')
    })

    it('shows end button and timer when ongoing and provisioned', function () {
      const { provisionSuccessCallback } = renderAndProvision(
        makeInterview({
          status: 'ongoing',
          started_at: '2026-06-20T09:00:00Z',
          expires_at: '2026-06-20T10:00:00Z',
          warning_at: '2026-06-20T09:45:00Z',
        }),
      )

      act(function triggerSuccess() {
        provisionSuccessCallback({
          mode: 'ai_led',
          realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
          excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
        })
      })

      expect(screen.getByRole('button', { name: /end session/i })).toBeInTheDocument()
    })

    it('calls end mutation on end click', async function () {
      const user = userEvent.setup()
      const { provisionSuccessCallback } = renderAndProvision(
        makeInterview({
          status: 'ongoing',
          started_at: '2026-06-20T09:00:00Z',
          expires_at: '2026-06-20T10:00:00Z',
          warning_at: '2026-06-20T09:45:00Z',
        }),
      )

      act(function triggerSuccess() {
        provisionSuccessCallback({
          mode: 'ai_led',
          realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
          excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
        })
      })

      await user.click(screen.getByRole('button', { name: /end session/i }))

      expect(mockEndMutate).toHaveBeenCalledWith(
        { id: 'int-1' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
          onSettled: expect.any(Function),
        }),
      )
    })

    it('ignores duplicate end clicks while mutation is in flight', function () {
      const { provisionSuccessCallback } = renderAndProvision(
        makeInterview({
          status: 'ongoing',
          started_at: '2026-06-20T09:00:00Z',
          expires_at: '2026-06-20T10:00:00Z',
          warning_at: '2026-06-20T09:45:00Z',
        }),
      )

      act(function triggerSuccess() {
        provisionSuccessCallback({
          mode: 'ai_led',
          realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
          excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
        })
      })

      const endButton = screen.getByRole('button', { name: /end session/i })
      act(function clickTwice() {
        endButton.click()
        endButton.click()
      })

      expect(mockEndMutate).toHaveBeenCalledTimes(1)
    })

    it('shows safe lifecycle error when end mutation fails', async function () {
      const user = userEvent.setup()

      let endErrorCallback: ((error: Error) => void) | undefined
      vi.mocked(useEndInterview).mockReturnValue(mockUseEndInterview({
        mutate: vi.fn(function mockEndMutate(_params: any, options: any) {
          endErrorCallback = options.onError
        }),
        isPending: false,
      }))

      const { provisionSuccessCallback } = renderAndProvision(
        makeInterview({
          status: 'ongoing',
          started_at: '2026-06-20T09:00:00Z',
          expires_at: '2026-06-20T10:00:00Z',
          warning_at: '2026-06-20T09:45:00Z',
        }),
      )

      act(function triggerSuccess() {
        provisionSuccessCallback({
          mode: 'ai_led',
          realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
          excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
        })
      })

      await user.click(screen.getByRole('button', { name: /end session/i }))

      endErrorCallback?.(new Error('postgres://secret@internal-db.local could not end'))

      await waitFor(function () {
        expect(screen.getByText('Unable to end session. Please try again.')).toBeInTheDocument()
      })
      expect(screen.queryByText(/postgres:\/\/secret/)).not.toBeInTheDocument()
    })
  })
})
