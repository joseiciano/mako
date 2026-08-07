import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackSmart } from './feedback-smart'
import { makeInterview } from '../session/test-helpers'

vi.mock('#/hooks/use-interviews', function () {
  return {
    useInterviewDetail: vi.fn(),
  }
})

vi.mock('@tanstack/react-router', function () {
  return {
    useNavigate: vi.fn(),
  }
})

import { useInterviewDetail } from '#/hooks/use-interviews'
import { useNavigate } from '@tanstack/react-router'

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

const mockNavigate = vi.fn()

beforeEach(function () {
  vi.clearAllMocks()
  vi.mocked(useNavigate).mockReturnValue(mockNavigate)
})

describe('FeedbackSmart', function () {
  it('shows loading when interview query is pending', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({ data: undefined, isPending: true }),
    )
    render(<FeedbackSmart interviewId="int-1" />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('shows safe error when interview query fails', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error('postgres://secret@internal-db.local failed'),
      }),
    )
    render(<FeedbackSmart interviewId="int-1" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load feedback/i)
    expect(screen.getByRole('alert')).not.toHaveTextContent('postgres://secret')
  })

  it('renders completed feedback', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({
          status: 'completed',
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
        isPending: false,
      }),
    )
    render(<FeedbackSmart interviewId="int-1" />)
    expect(screen.getByText('91')).toBeInTheDocument()
  })

  it('navigates back to details', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({ data: makeInterview({ status: 'completed' }) }),
    )
    render(<FeedbackSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/interviews/$id',
      params: { id: 'int-1' },
    })
  })
})
