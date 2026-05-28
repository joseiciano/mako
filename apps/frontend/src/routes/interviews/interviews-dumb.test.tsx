import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { formatScheduledTime } from '#/lib/format-scheduled-time'
import {
  InterviewsDumb,
  formatInterviewType,
  formatInterviewMode,
  formatInterviewStatus,
} from './interviews-dumb'

function createInterviewFixture(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design' as const,
    mode: 'peer_to_peer' as const,
    tier: 'standard' as const,
    status: 'scheduled' as const,
    scheduled_at: '2026-04-10T10:30:00.000Z',
    created_at: '2026-04-01T10:00:00.000Z',
    updated_at: '2026-04-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('InterviewsDumb', function interviewsDumbSuite() {
  it('renders loading state', function run() {
    render(<InterviewsDumb state="loading" />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading interviews...',
    )
  })

  it('renders error state with alert role', function run() {
    render(
      <InterviewsDumb state="error" errorMessage="Failed to load interviews" />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load interviews',
    )
  })

  it('renders empty state with CTA button', function run() {
    const onNavigate = vi.fn()
    render(<InterviewsDumb state="empty" onNavigateToNewInterview={onNavigate} />)

    expect(
      screen.getByText('No interviews found.'),
    ).toBeInTheDocument()
    const ctas = screen.getAllByRole('button', { name: /schedule new interview/i })
    expect(ctas.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(ctas[0]!)
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('renders populated state with upcoming and history sections', function run() {
    const upcoming = [
      createInterviewFixture({
        id: 'upcoming-1',
        status: 'scheduled',
        type: 'coding',
        mode: 'ai_led',
      }),
    ]
    const history = [
      createInterviewFixture({
        id: 'history-1',
        status: 'completed',
        type: 'behavioral',
      }),
      createInterviewFixture({
        id: 'history-2',
        status: 'cancelled',
      }),
    ]

    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={upcoming}
        historyInterviews={history}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Upcoming' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'History' }),
    ).toBeInTheDocument()

    expect(screen.getByText('Coding')).toBeInTheDocument()
    expect(screen.getByText('AI-led')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('shows cancel button only for scheduled interviews', function run() {
    const upcoming = [
      createInterviewFixture({
        id: 'scheduled-1',
        status: 'scheduled',
      }),
      createInterviewFixture({
        id: 'ongoing-1',
        status: 'ongoing',
      }),
    ]

    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={upcoming}
        historyInterviews={[]}
      />,
    )

    expect(
      screen.getByRole('button', { name: /cancel scheduled-1/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /cancel ongoing-1/i }),
    ).not.toBeInTheDocument()
  })

  it('calls onCancelInterview when cancel button is clicked', function run() {
    const onCancel = vi.fn()
    const upcoming = [
      createInterviewFixture({
        id: 'scheduled-1',
        status: 'scheduled',
      }),
    ]

    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={upcoming}
        historyInterviews={[]}
        onCancelInterview={onCancel}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /cancel scheduled-1/i }),
    )
    expect(onCancel).toHaveBeenCalledWith('scheduled-1')
  })

  it('disables cancel button while cancelling', function run() {
    const upcoming = [
      createInterviewFixture({
        id: 'scheduled-1',
        status: 'scheduled',
      }),
    ]

    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={upcoming}
        historyInterviews={[]}
        cancellingInterviewId="scheduled-1"
      />,
    )

    const button = screen.getByRole('button', {
      name: /cancelling/i,
    })
    expect(button).toBeDisabled()
  })

  it('renders success cancel status with status role', function run() {
    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={[]}
        historyInterviews={[]}
        cancelStatus={{
          type: 'success',
          message: 'Interview cancelled successfully.',
        }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Interview cancelled successfully.',
    )
  })

  it('renders error cancel status with alert role', function run() {
    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={[]}
        historyInterviews={[]}
        cancelStatus={{
          type: 'error',
          message: 'Unable to cancel interview.',
        }}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to cancel interview.',
    )
  })

  it('does not show cancel button for history interviews', function run() {
    const history = [
      createInterviewFixture({
        id: 'completed-1',
        status: 'completed',
      }),
      createInterviewFixture({
        id: 'cancelled-1',
        status: 'cancelled',
      }),
    ]

    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={[]}
        historyInterviews={history}
      />,
    )

    expect(
      screen.queryByRole('button', { name: /cancel completed-1/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /cancel cancelled-1/i }),
    ).not.toBeInTheDocument()
  })
})

describe('interviews-dumb formatting helpers', function formattingSuite() {
  it('formats interview type values', function run() {
    expect(formatInterviewType('system_design')).toBe('System Design')
    expect(formatInterviewType('coding')).toBe('Coding')
    expect(formatInterviewType('behavioral')).toBe('Behavioral')
  })

  it('formats interview mode values', function run() {
    expect(formatInterviewMode('peer_to_peer')).toBe('Peer to Peer')
    expect(formatInterviewMode('ai_led')).toBe('AI-led')
  })

  it('formats interview status values', function run() {
    expect(formatInterviewStatus('scheduled')).toBe('Scheduled')
    expect(formatInterviewStatus('ongoing')).toBe('Ongoing')
    expect(formatInterviewStatus('completed')).toBe('Completed')
    expect(formatInterviewStatus('cancelled')).toBe('Cancelled')
  })

  it('formats scheduled time safely', function run() {
    const iso = '2026-04-10T10:30:00.000Z'
    const expected = new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    expect(formatScheduledTime(iso)).toBe(expected)
    expect(formatScheduledTime('not-a-date')).toBe('Unknown scheduled time')
  })
})
