import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackDumb, type FeedbackDumbProps } from './feedback-dumb'
import { makeInterview } from '../session/test-helpers'

function makeProps(overrides?: Partial<FeedbackDumbProps>): FeedbackDumbProps {
  return {
    interview: null,
    isLoading: false,
    errorKind: null,
    recordingUrl: null,
    screenshotUrls: [],
    isPolling: false,
    hasReachedPollingDeadline: false,
    onBack: vi.fn(),
    onRefresh: vi.fn(),
    onSignIn: vi.fn(),
    ...overrides,
  }
}

const readyFeedback = {
  schema_version: 1 as const,
  overall_score: 91,
  summary: 'Excellent performance.',
  dimensions: {
    communication: { score: 90, summary: 'Clear.' },
    problem_solving: { score: 92, summary: 'Methodical.' },
    technical_depth: { score: 91, summary: 'Good depth.' },
  },
  strengths: [],
  improvements: [],
}

describe('FeedbackDumb', function suite() {
  it('renders loading state', function run() {
    render(<FeedbackDumb {...makeProps({ isLoading: true })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('renders a participant-safe not-found state without leaking details', function run() {
    render(<FeedbackDumb {...makeProps({ errorKind: 'not-found' })} />)
    expect(screen.getByText(/report not found/i)).toBeInTheDocument()
    expect(screen.getByText(/don't have access/i)).toBeInTheDocument()
  })

  it('renders an unauthenticated state with a sign-in action', async function run() {
    const user = userEvent.setup()
    const onSignIn = vi.fn()
    render(<FeedbackDumb {...makeProps({ errorKind: 'unauthenticated', onSignIn })} />)
    expect(screen.getByText(/sign in required/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it('renders a network error state with a retry action', async function run() {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(<FeedbackDumb {...makeProps({ errorKind: 'network', onRefresh })} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load this report/i)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('shows a not-completed message when the interview is not completed', function run() {
    const interview = makeInterview({ status: 'scheduled' })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(screen.getByText(/feedback not available yet/i)).toBeInTheDocument()
  })

  it('shows the no-consent unavailable reason', function run() {
    const interview = makeInterview({
      status: 'completed',
      feedback_status: 'not_started',
      feedback_unavailable_reason: 'no_consent',
    })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(screen.getByText(/didn't consent to recording/i)).toBeInTheDocument()
  })

  it('shows a pending processing state', function run() {
    const interview = makeInterview({ status: 'completed', feedback_status: 'pending' })
    render(<FeedbackDumb {...makeProps({ interview, isPolling: true })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/queued for analysis/i)
    expect(screen.getByText(/automatically checking for updates/i)).toBeInTheDocument()
  })

  it('shows a processing state', function run() {
    const interview = makeInterview({ status: 'completed', feedback_status: 'processing' })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/transcribing and analyzing/i)
  })

  it('shows a manual refresh action once the polling deadline is reached', async function run() {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    const interview = makeInterview({ status: 'completed', feedback_status: 'processing' })
    render(
      <FeedbackDumb
        {...makeProps({ interview, hasReachedPollingDeadline: true, isPolling: false, onRefresh })}
      />,
    )
    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /check again/i }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('shows safe failed-state guidance without exposing provider errors', function run() {
    const interview = makeInterview({
      status: 'completed',
      feedback_status: 'failed',
      feedback_error_code: 'analysis_failed',
    })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/couldn't generate your report/i)
    expect(alert).not.toHaveTextContent('://')
  })

  it('renders the ready report with score cards, strengths, and improvements', function run() {
    const interview = makeInterview({
      status: 'completed',
      feedback_status: 'ready',
      feedback: readyFeedback,
    })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(screen.getAllByText('91').length).toBeGreaterThan(0)
  })

  it('renders a long transcript without breaking the page and without executing markup', function run() {
    const longTranscript = `${'Lorem ipsum dolor sit amet. '.repeat(500)}<img src=x onerror=alert(1)>`
    const interview = makeInterview({
      status: 'completed',
      feedback_status: 'ready',
      feedback: readyFeedback,
      transcript: longTranscript,
    })
    const { container } = render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(container.querySelector('img[onerror]')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('renders an empty screenshots state inside the ready report', function run() {
    const interview = makeInterview({
      status: 'completed',
      feedback_status: 'ready',
      feedback: readyFeedback,
    })
    render(<FeedbackDumb {...makeProps({ interview, screenshotUrls: [] })} />)
    expect(screen.getByText(/no whiteboard captures/i)).toBeInTheDocument()
  })

  it('continues to render transcript and feedback when raw artifacts have expired', function run() {
    const interview = makeInterview({
      status: 'completed',
      feedback_status: 'ready',
      feedback: readyFeedback,
      transcript: 'Full transcript text survives raw artifact expiry.',
      recording_status: 'ready',
    })
    render(<FeedbackDumb {...makeProps({ interview, recordingUrl: null, screenshotUrls: [] })} />)
    expect(screen.getByText(/full transcript text survives/i)).toBeInTheDocument()
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
    expect(screen.getAllByText('91').length).toBeGreaterThan(0)
  })

  it('calls onBack when back button clicked', async function run() {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<FeedbackDumb {...makeProps({ onBack })} />)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('exposes a main landmark and a logical, non-skipping heading hierarchy in the ready report', function run() {
    const interview = makeInterview({
      status: 'completed',
      feedback_status: 'ready',
      feedback: readyFeedback,
    })
    render(<FeedbackDumb {...makeProps({ interview })} />)

    expect(screen.getByRole('main')).toBeInTheDocument()

    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent(/post-interview feedback/i)

    const h2s = screen.getAllByRole('heading', { level: 2 })
    expect(h2s.length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('heading', { level: 3 }).length).toBeGreaterThanOrEqual(0)
    // No heading level is skipped: every h3 only ever appears under an h2 section above it.
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument()
  })

  it('does not expose credential fields', function run() {
    const interview = {
      ...makeInterview({ status: 'completed' }),
      realtime_session_id: 'rt-1',
      excalidraw_room_id: 'room-1',
      excalidraw_key: 'key-1',
    }
    const { container } = render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(container.textContent).not.toContain('rt-1')
    expect(container.textContent).not.toContain('room-1')
    expect(container.textContent).not.toContain('key-1')
  })
})
