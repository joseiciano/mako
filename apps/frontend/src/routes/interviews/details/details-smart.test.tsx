import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DetailsSmart } from './details-smart'
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

describe('DetailsSmart', function () {
  it('shows loading when interview query is pending', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
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
    render(<DetailsSmart interviewId="int-1" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load/i)
    expect(screen.getByRole('alert')).not.toHaveTextContent('postgres://secret')
  })

  it('shows interview metadata when loaded', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'scheduled' }),
        isPending: false,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
  })

  it('navigates to session on join click', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'scheduled' }),
        isPending: false,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /join session/i }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/interviews/$id/session',
      params: { id: 'int-1' },
    })
  })

  it('navigates to feedback on view feedback click', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'completed' }),
        isPending: false,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /view feedback/i }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/interviews/$id/feedback',
      params: { id: 'int-1' },
    })
  })

  it('navigates back to interviews list on back click', async function () {
    const user = userEvent.setup()
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview(),
        isPending: false,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/interviews' })
  })

  it('enables join for scheduled interviews', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'scheduled' }),
        isPending: false,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
    expect(screen.getByRole('button', { name: /join session/i })).toBeInTheDocument()
  })

  it('enables join for ongoing interviews', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'ongoing' }),
        isPending: false,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
    expect(screen.getByRole('button', { name: /join session/i })).toBeInTheDocument()
  })

  it('disables join for completed interviews', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'completed' }),
        isPending: false,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
    expect(screen.queryByRole('button', { name: /join session/i })).not.toBeInTheDocument()
  })

  it('disables join for cancelled interviews', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'cancelled' }),
        isPending: false,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
    expect(screen.queryByRole('button', { name: /join session/i })).not.toBeInTheDocument()
  })

  it('enables view feedback for completed interviews', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'completed' }),
        isPending: false,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
    expect(screen.getByRole('button', { name: /view feedback/i })).toBeInTheDocument()
  })

  it('disables view feedback for non-completed interviews', function () {
    vi.mocked(useInterviewDetail).mockReturnValue(
      mockUseInterviewDetail({
        data: makeInterview({ status: 'scheduled' }),
        isPending: false,
        isError: false,
        error: null,
      }),
    )
    render(<DetailsSmart interviewId="int-1" />)
    expect(screen.queryByRole('button', { name: /view feedback/i })).not.toBeInTheDocument()
  })
})
