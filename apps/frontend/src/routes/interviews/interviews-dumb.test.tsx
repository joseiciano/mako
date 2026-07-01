import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { formatScheduledTime } from '#/lib/format-scheduled-time'
import { InterviewsDumb } from './interviews-dumb'

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
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
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

  it('shows join button for scheduled interviews in upcoming', function run() {
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
      screen.getByRole('button', { name: /join session scheduled-1/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /join session ongoing-1/i }),
    ).toBeInTheDocument()
  })

  it('does not show join button for completed or cancelled interviews', function run() {
    const upcoming = [
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
        upcomingInterviews={upcoming}
        historyInterviews={[]}
      />,
    )

    expect(
      screen.queryByRole('button', { name: /join session completed-1/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /join session cancelled-1/i }),
    ).not.toBeInTheDocument()
  })

  it('calls onNavigateToSession when join button is clicked', function run() {
    const onNavigate = vi.fn()
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
        onNavigateToSession={onNavigate}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /join session scheduled-1/i }),
    )
    expect(onNavigate).toHaveBeenCalledWith('scheduled-1')
  })

  it('shows details button for upcoming and history interviews', function run() {
    const upcoming = [createInterviewFixture({ id: 'scheduled-1' })]
    const history = [
      createInterviewFixture({ id: 'completed-1', status: 'completed' }),
    ]

    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={upcoming}
        historyInterviews={history}
      />,
    )

    expect(
      screen.getByRole('button', { name: /view details scheduled-1/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /view details completed-1/i }),
    ).toBeInTheDocument()
  })

  it('calls onNavigateToDetails when details button is clicked', function run() {
    const onNavigate = vi.fn()
    const upcoming = [createInterviewFixture({ id: 'scheduled-1' })]

    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={upcoming}
        historyInterviews={[]}
        onNavigateToDetails={onNavigate}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /view details scheduled-1/i }),
    )
    expect(onNavigate).toHaveBeenCalledWith('scheduled-1')
  })

  it('shows feedback button only for completed interviews', function run() {
    const history = [
      createInterviewFixture({ id: 'completed-1', status: 'completed' }),
      createInterviewFixture({ id: 'cancelled-1', status: 'cancelled' }),
    ]

    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={[]}
        historyInterviews={history}
      />,
    )

    expect(
      screen.getByRole('button', { name: /view feedback completed-1/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /view feedback cancelled-1/i }),
    ).not.toBeInTheDocument()
  })

  it('calls onNavigateToFeedback when feedback button is clicked', function run() {
    const onNavigate = vi.fn()
    const history = [
      createInterviewFixture({ id: 'completed-1', status: 'completed' }),
    ]

    render(
      <InterviewsDumb
        state="populated"
        upcomingInterviews={[]}
        historyInterviews={history}
        onNavigateToFeedback={onNavigate}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /view feedback completed-1/i }),
    )
    expect(onNavigate).toHaveBeenCalledWith('completed-1')
  })

  it('join button renders with correct column class when only join is shown', function run() {
    // When showCancel is not active (history table uses InterviewTable without showCancel),
    // the join button should use the rounded-r-lg class.
    // Test that join column gets correct class when shared with cancel column.
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
      />,
    )

    // Both showCancel and showJoin are passed; join column gets px-3 py-3 (not rounded)
    // because cancel button follows and gets the rounded class
    const button = screen.getByRole('button', { name: /join session scheduled-1/i })
    expect(button.closest('td')?.className).not.toContain('rounded-r-lg')
  })
})

describe('interviews-dumb formatting helpers', function formattingSuite() {
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
