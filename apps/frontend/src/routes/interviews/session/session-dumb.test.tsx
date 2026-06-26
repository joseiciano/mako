import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionDumb, type SessionDumbProps } from './session-dumb'
import { makeInterview } from './test-helpers'

vi.mock('#/components/interviews/whiteboard', function () {
  return {
    WhiteboardSmart: vi.fn(function MockWhiteboardSmart() {
      return <div data-testid="whiteboard-smart-mock" />
    }),
    mapProvisionToWhiteboardConfig: vi.fn(),
  }
})

vi.mock('#/components/interviews/media', function () {
  return {
    MediaSmart: vi.fn(function MockMediaSmart() {
      return <div data-testid="media-smart-mock" />
    }),
  }
})

function makeProps(overrides?: Partial<SessionDumbProps>): SessionDumbProps {
  return {
    interview: null,
    isLoading: false,
    status: 'idle',
    errorMessage: null,
    whiteboardProvisionHandle: null,
    whiteboardStatus: 'idle',
    whiteboardErrorMessage: null,
    mediaConfig: null,
    mediaErrorMessage: null,
    onJoin: vi.fn(),
    onRetryWhiteboard: vi.fn(),
    onWhiteboardConnecting: vi.fn(),
    onWhiteboardConnected: vi.fn(),
    onWhiteboardReconnecting: vi.fn(),
    onWhiteboardFailed: vi.fn(),
    onMediaConnecting: vi.fn(),
    onMediaConnected: vi.fn(),
    onMediaWaitingForPeer: vi.fn(),
    onMediaReconnecting: vi.fn(),
    onMediaFailed: vi.fn(),
    onMediaPermissionError: vi.fn(),
    onBackToInterviews: vi.fn(),
    ...overrides,
  }
}

describe('SessionDumb', function () {
  it('renders back to interviews button', function () {
    render(<SessionDumb {...makeProps()} />)
    expect(screen.getByRole('button', { name: /back to interviews/i })).toBeInTheDocument()
  })

  it('shows loading state when isLoading is true', function () {
    render(<SessionDumb {...makeProps({ isLoading: true })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading interview details/i)
  })

  it('shows joining state', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview(),
          status: 'joining',
        })}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/joining session/i)
  })

  it('shows error message with retry button when interview loaded', async function () {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview(),
          status: 'error',
          errorMessage: 'Something went wrong',
          onJoin,
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    const retryButton = screen.getByRole('button', { name: /retry/i })
    await user.click(retryButton)
    expect(onJoin).toHaveBeenCalledOnce()
  })

  it('shows error without retry when no interview', function () {
    render(
      <SessionDumb
        {...makeProps({
          status: 'error',
          errorMessage: 'Interview not found',
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Interview not found')
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('shows join flow when interview loaded and idle', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview(),
          status: 'idle',
        })}
      />,
    )
    expect(screen.getByText('Ready to Join')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join session/i })).toBeInTheDocument()
  })

  it('shows interview metadata when provisioned', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview(),
          status: 'provisioned',
        })}
      />,
    )
    expect(screen.getByText('Interview Details')).toBeInTheDocument()
    expect(screen.getByText('Behavioral')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('renders whiteboard smart when provisioned', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview(),
          status: 'provisioned',
          whiteboardProvisionHandle: 'whiteboard-handle-1',
        })}
      />,
    )
    expect(screen.getByTestId('whiteboard-smart-mock')).toBeInTheDocument()
  })

  it('renders media smart when provisioned', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview(),
          status: 'provisioned',
          mediaConfig: {
            realtimeSessionId: 'rt-1',
            token: 'token-1',
          },
        })}
      />,
    )
    expect(screen.getByTestId('media-smart-mock')).toBeInTheDocument()
  })

  it('shows media error message when provisioned media fails', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview(),
          status: 'provisioned',
          mediaErrorMessage: 'Camera or microphone access was denied.',
        })}
      />,
    )

    expect(screen.getByRole('alert', { name: /media error/i })).toHaveTextContent(
      'Camera or microphone access was denied.',
    )
  })

  it('does not render whiteboard when not provisioned', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview(),
          status: 'idle',
        })}
      />,
    )
    expect(screen.queryByTestId('whiteboard-smart-mock')).not.toBeInTheDocument()
  })

  it('does not render media when not provisioned', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview(),
          status: 'idle',
        })}
      />,
    )
    expect(screen.queryByTestId('media-smart-mock')).not.toBeInTheDocument()
  })

  it('calls onJoin when join button clicked', async function () {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview(),
          status: 'idle',
          onJoin,
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /join session/i }))
    expect(onJoin).toHaveBeenCalledOnce()
  })

  it('calls onBackToInterviews when back button clicked', async function () {
    const user = userEvent.setup()
    const onBackToInterviews = vi.fn()
    render(
      <SessionDumb
        {...makeProps({ onBackToInterviews })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /back to interviews/i }))
    expect(onBackToInterviews).toHaveBeenCalledOnce()
  })
})
