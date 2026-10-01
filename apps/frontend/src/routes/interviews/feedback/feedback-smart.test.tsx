import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackSmart } from './feedback-smart'
import { makeInterview } from '../session/test-helpers'

vi.mock('#/hooks/use-feedback-report', function () {
  return {
    useFeedbackReport: vi.fn(),
  }
})

vi.mock('@tanstack/react-router', function () {
  return {
    useNavigate: vi.fn(),
  }
})

import { useFeedbackReport } from '#/hooks/use-feedback-report'
import { useNavigate } from '@tanstack/react-router'

function mockReport(overrides?: Partial<ReturnType<typeof useFeedbackReport>>): ReturnType<typeof useFeedbackReport> {
  return {
    interview: null,
    isLoading: false,
    errorKind: null,
    isPolling: false,
    hasReachedPollingDeadline: false,
    refresh: vi.fn(),
    ...overrides,
  }
}

const mockNavigate = vi.fn()

beforeEach(function () {
  vi.clearAllMocks()
  vi.mocked(useNavigate).mockReturnValue(mockNavigate)
})

describe('FeedbackSmart', function suite() {
  it('shows loading when the report is loading', function run() {
    vi.mocked(useFeedbackReport).mockReturnValue(mockReport({ isLoading: true }))
    render(<FeedbackSmart interviewId="int-1" />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('resolves recording and screenshot URLs to absolute, authorized API URLs', function run() {
    vi.mocked(useFeedbackReport).mockReturnValue(
      mockReport({
        interview: makeInterview({
          status: 'completed',
          feedback_status: 'ready',
          recording_status: 'ready',
          recording_url: '/api/interviews/int-1/artifacts/recording',
          screenshot_urls: ['/api/interviews/int-1/artifacts/screenshots/a'],
          feedback: {
            schema_version: 1,
            overall_score: 91,
            summary: 'Excellent performance.',
            dimensions: {
              communication: { score: 90, summary: 'Clear.' },
              problem_solving: { score: 92, summary: 'Methodical.' },
              technical_depth: { score: 91, summary: 'Good depth.' },
            },
            strengths: [],
            improvements: [],
          },
        }),
      }),
    )
    render(<FeedbackSmart interviewId="int-1" />)
    const video = screen.getByLabelText(/interview session recording/i)
    expect(video.getAttribute('src')).toContain('/api/interviews/int-1/artifacts/recording')
  })

  it('navigates back to details', async function run() {
    const user = userEvent.setup()
    vi.mocked(useFeedbackReport).mockReturnValue(
      mockReport({ interview: makeInterview({ status: 'completed' }) }),
    )
    render(<FeedbackSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/interviews/$id',
      params: { id: 'int-1' },
    })
  })

  it('navigates to login when unauthenticated', async function run() {
    const user = userEvent.setup()
    vi.mocked(useFeedbackReport).mockReturnValue(mockReport({ errorKind: 'unauthenticated' }))
    render(<FeedbackSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' })
  })

  it('invokes refresh on manual retry', async function run() {
    const user = userEvent.setup()
    const refresh = vi.fn()
    vi.mocked(useFeedbackReport).mockReturnValue(mockReport({ errorKind: 'network', refresh }))
    render(<FeedbackSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(refresh).toHaveBeenCalledOnce()
  })
})
