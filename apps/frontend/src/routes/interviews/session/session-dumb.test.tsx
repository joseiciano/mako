import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionDumb, type SessionDumbProps } from './session-dumb'
import type { InterviewDetail } from '@mako/shared'

vi.mock('#/components/interviews/whiteboard', function () {
  return {
    WhiteboardSmart: vi.fn(function MockWhiteboardSmart() {
      return <div data-testid="whiteboard-smart-mock" />
    }),
    mapProvisionToWhiteboardConfig: vi.fn(),
  }
})

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

function makeProps(overrides?: Partial<SessionDumbProps>): SessionDumbProps {
  return {
    interview: null,
    isLoading: false,
    status: 'idle',
    errorMessage: null,
    whiteboardProvision: null,
    whiteboardStatus: 'idle',
    whiteboardErrorMessage: null,
    onJoin: vi.fn(),
    onRetryWhiteboard: vi.fn(),
    onWhiteboardConnecting: vi.fn(),
    onWhiteboardConnected: vi.fn(),
    onWhiteboardReconnecting: vi.fn(),
    onWhiteboardFailed: vi.fn(),
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
          whiteboardProvision: {
            mode: 'peer_to_peer',
            realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
            excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
          },
        })}
      />,
    )
    expect(screen.getByTestId('whiteboard-smart-mock')).toBeInTheDocument()
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
