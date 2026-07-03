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
    lifecycleControls: {
      canStart: false,
      canEnd: false,
      isTerminal: false,
      terminalMessage: null,
      helperMessage: null,
    },
    timer: {
      kind: 'not-started',
      label: 'Not started',
      remainingLabel: null,
      isWarning: false,
    },
    lifecycleErrorMessage: null,
    isStartingSession: false,
    isEndingSession: false,
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
    onStartSession: vi.fn(),
    onEndSession: vi.fn(),
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

  it('shows start button when scheduled and joined', async function () {
    const user = userEvent.setup()
    const onStartSession = vi.fn()
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview({ status: 'scheduled' }),
          status: 'provisioned',
          lifecycleControls: {
            canStart: true,
            canEnd: false,
            isTerminal: false,
            terminalMessage: null,
            helperMessage: null,
          },
          onStartSession,
        })}
      />,
    )
    const startButton = screen.getByRole('button', { name: /start session/i })
    expect(startButton).toBeInTheDocument()
    await user.click(startButton)
    expect(onStartSession).toHaveBeenCalledOnce()
  })

  it('shows helper message when scheduled but not joined', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview({ status: 'scheduled' }),
          status: 'idle',
          lifecycleControls: {
            canStart: false,
            canEnd: false,
            isTerminal: false,
            terminalMessage: null,
            helperMessage: 'Join the interview environment before starting the session.',
          },
        })}
      />,
    )
    expect(screen.getByText(/join the interview environment before starting/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument()
  })

  it('shows timer and end button when ongoing', async function () {
    const user = userEvent.setup()
    const onEndSession = vi.fn()
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview({ status: 'ongoing' }),
          status: 'provisioned',
          lifecycleControls: {
            canStart: false,
            canEnd: true,
            isTerminal: false,
            terminalMessage: null,
            helperMessage: null,
          },
          timer: {
            kind: 'running',
            label: 'In progress',
            remainingLabel: '15:00',
            isWarning: false,
          },
          onEndSession,
        })}
      />,
    )
    expect(screen.getByText('15:00')).toBeInTheDocument()
    const endButton = screen.getByRole('button', { name: /end session/i })
    expect(endButton).toBeInTheDocument()
    await user.click(endButton)
    expect(onEndSession).toHaveBeenCalledOnce()
  })

  it('shows warning copy when timer is in warning state', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview({ status: 'ongoing' }),
          status: 'provisioned',
          lifecycleControls: {
            canStart: false,
            canEnd: true,
            isTerminal: false,
            terminalMessage: null,
            helperMessage: null,
          },
          timer: {
            kind: 'running',
            label: 'Ending soon',
            remainingLabel: '5:00',
            isWarning: true,
          },
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/session ending soon/i)
  })

  it('shows expired copy when timer is expired', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview({ status: 'ongoing' }),
          status: 'provisioned',
          lifecycleControls: {
            canStart: false,
            canEnd: false,
            isTerminal: false,
            terminalMessage: null,
            helperMessage: null,
          },
          timer: {
            kind: 'expired',
            label: 'Session time has expired.',
            remainingLabel: '0:00',
            isWarning: true,
          },
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/session time has expired/i)
  })

  it('shows terminal copy for completed with no actions', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview({ status: 'completed' }),
          status: 'idle',
          lifecycleControls: {
            canStart: false,
            canEnd: false,
            isTerminal: true,
            terminalMessage: 'This session is complete. Lifecycle actions are no longer available.',
            helperMessage: null,
          },
          timer: {
            kind: 'completed',
            label: 'Completed',
            remainingLabel: null,
            isWarning: false,
          },
        })}
      />,
    )
      expect(screen.getByText(/this session is complete/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /end session/i })).not.toBeInTheDocument()
  })

  it('shows terminal copy for cancelled with no actions', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview({ status: 'cancelled' }),
          status: 'idle',
          lifecycleControls: {
            canStart: false,
            canEnd: false,
            isTerminal: true,
            terminalMessage: 'This interview was cancelled. Lifecycle actions are unavailable.',
            helperMessage: null,
          },
          timer: {
            kind: 'cancelled',
            label: 'Cancelled',
            remainingLabel: null,
            isWarning: false,
          },
        })}
      />,
    )
      expect(screen.getByText(/this interview was cancelled/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /end session/i })).not.toBeInTheDocument()
  })

  it('renders lifecycle error alert with retry guidance', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview({ status: 'scheduled' }),
          status: 'provisioned',
          lifecycleErrorMessage: 'Unable to start interview session. Please try again.',
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to start interview session/i)
  })

  it('disables start button and shows pending text while starting', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview({ status: 'scheduled' }),
          status: 'provisioned',
          lifecycleControls: {
            canStart: true,
            canEnd: false,
            isTerminal: false,
            terminalMessage: null,
            helperMessage: null,
          },
          isStartingSession: true,
        })}
      />,
    )
    const button = screen.getByRole('button', { name: /starting session/i })
    expect(button).toBeDisabled()
  })

  it('disables end button and shows pending text while ending', function () {
    render(
      <SessionDumb
        {...makeProps({
          interview: makeInterview({ status: 'ongoing' }),
          status: 'provisioned',
          lifecycleControls: {
            canStart: false,
            canEnd: true,
            isTerminal: false,
            terminalMessage: null,
            helperMessage: null,
          },
          isEndingSession: true,
        })}
      />,
    )
    const button = screen.getByRole('button', { name: /ending session/i })
    expect(button).toBeDisabled()
  })
})
