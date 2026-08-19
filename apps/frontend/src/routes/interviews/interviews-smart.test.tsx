import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InterviewsSmart } from './interviews-smart'

const useInterviewsMock = vi.hoisted(function createUseInterviewsMock() {
  return vi.fn()
})

const useCancelInterviewMock = vi.hoisted(
  function createUseCancelInterviewMock() {
    return vi.fn()
  },
)

vi.mock('#/hooks/use-interviews', function mockUseInterviewsModule() {
  return {
    useInterviews: useInterviewsMock,
    useCancelInterview: useCancelInterviewMock,
  }
})

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

const useAccountMock = vi.hoisted(function createUseAccountMock() {
  return vi.fn()
})

vi.mock('#/hooks/use-account', function mockUseAccountModule() {
  return {
    useAccount: useAccountMock,
  }
})

function renderWithQueryClient(element: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  )
}

function createInterviewFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'peer_to_peer',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-04-10T10:30:00.000Z',
    created_at: '2026-04-01T10:00:00.000Z',
    updated_at: '2026-04-01T10:00:00.000Z',
    ...overrides,
  }
}

function mockInterviewsQuery(overrides: Record<string, unknown> = {}) {
  useInterviewsMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  })
}

function mockCancelInterviewMutation(overrides: Record<string, unknown> = {}) {
  const mutateFn = vi.fn()
  useCancelInterviewMock.mockReturnValue({
    mutate: mutateFn,
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    data: undefined,
    ...overrides,
  })
  return mutateFn
}

function mockAccountQuery(overrides: Record<string, unknown> = {}) {
  useAccountMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  })
}

describe('InterviewsSmart', function interviewsSmartSuite() {
  beforeEach(function resetMocks() {
    useInterviewsMock.mockReset()
    useCancelInterviewMock.mockReset()
    useAccountMock.mockReset()
    mockAccountQuery({ data: { id: 'demo-user' } })
    mockNavigate.mockClear()
  })

  it('renders loading state while interviews query is pending', function run() {
    mockInterviewsQuery({ isPending: true })
    mockCancelInterviewMutation()

    renderWithQueryClient(<InterviewsSmart />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading interviews...',
    )
  })

  it('renders error state when interviews query fails', function run() {
    mockInterviewsQuery({
      isError: true,
      error: new Error('Network error'),
    })
    mockCancelInterviewMutation()

    renderWithQueryClient(<InterviewsSmart />)

    expect(screen.getByRole('alert')).toHaveTextContent('Network error')
  })

  it('renders empty state when no interviews exist', function run() {
    mockInterviewsQuery({ data: [] })
    mockCancelInterviewMutation()

    renderWithQueryClient(<InterviewsSmart />)

    expect(screen.getByText('No interviews found.')).toBeInTheDocument()
  })

  it('navigates to new interview page when schedule button is clicked', function run() {
    mockInterviewsQuery({ data: [] })
    mockCancelInterviewMutation()

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getAllByRole('button', { name: /schedule new interview/i })[0]!,
    )

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/interviews/new' })
  })

  it('navigates to interview details when details button is clicked', function run() {
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'scheduled-1',
          status: 'scheduled',
        }),
      ],
    })
    mockCancelInterviewMutation()

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getByRole('button', { name: /view details scheduled-1/i }),
    )

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/interviews/$id',
      params: { id: 'scheduled-1' },
    })
  })

  it('navigates to interview feedback when feedback button is clicked', function run() {
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'completed-1',
          status: 'completed',
        }),
      ],
    })
    mockCancelInterviewMutation()

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getByRole('button', { name: /view feedback completed-1/i }),
    )

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/interviews/$id/feedback',
      params: { id: 'completed-1' },
    })
  })

  it('renders populated state with upcoming and history sections', function run() {
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'upcoming-1',
          status: 'scheduled',
        }),
        createInterviewFixture({
          id: 'history-1',
          status: 'completed',
        }),
      ],
    })
    mockCancelInterviewMutation()

    renderWithQueryClient(<InterviewsSmart />)

    expect(
      screen.getByRole('heading', { name: 'Upcoming' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'History' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('calls cancel mutation when cancel button is clicked', async function run() {
    const mutateFn = mockCancelInterviewMutation()
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'scheduled-1',
          status: 'scheduled',
        }),
      ],
    })

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getByRole('button', { name: /cancel scheduled-1/i }),
    )

    await waitFor(function () {
      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'scheduled-1' },
        expect.any(Object),
      )
    })
  })

  it('shows success status after cancel succeeds', async function run() {
    const mutateFn = mockCancelInterviewMutation()
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'scheduled-1',
          status: 'scheduled',
        }),
      ],
    })

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getByRole('button', { name: /cancel scheduled-1/i }),
    )

    const mutateOptions = mutateFn.mock.calls[0]?.[1] as {
      onSuccess?: () => void
    }
    mutateOptions?.onSuccess?.()

    await waitFor(function () {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Interview cancelled successfully.',
      )
    })
  })

  it('shows error status after cancel fails', async function run() {
    const mutateFn = mockCancelInterviewMutation()
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'scheduled-1',
          status: 'scheduled',
        }),
      ],
    })

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getByRole('button', { name: /cancel scheduled-1/i }),
    )

    const mutateOptions = mutateFn.mock.calls[0]?.[1] as {
      onError?: (error: Error) => void
    }
    mutateOptions?.onError?.(new Error('Cancel failed'))

    await waitFor(function () {
      expect(screen.getByRole('alert')).toHaveTextContent('Cancel failed')
    })
  })

  it('renders fallback error when query settles without data', function run() {
    mockInterviewsQuery({ data: undefined })
    mockCancelInterviewMutation()

    renderWithQueryClient(<InterviewsSmart />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to load interviews.',
    )
  })

  it('shows no-refund message when scheduler cancels a verified_interviewer booking', async function run() {
    const mutateFn = mockCancelInterviewMutation()
    mockAccountQuery({ data: { id: 'scheduler-user' } })
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'premium-1',
          status: 'scheduled',
          booking_channel: 'verified_interviewer',
          scheduler_id: 'scheduler-user',
          interviewer_id: 'interviewer-user',
        }),
      ],
    })

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getByRole('button', { name: /cancel premium-1/i }),
    )

    const mutateOptions = mutateFn.mock.calls[0]?.[1] as {
      onSuccess?: () => void
    }
    mutateOptions?.onSuccess?.()

    await waitFor(function () {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Your premium interview was cancelled. Scheduler-initiated cancellations are not refunded.',
      )
    })
    expect(screen.getByRole('status')).not.toHaveTextContent(
      /credit was refunded/i,
    )
  })

  it('shows refunded message when interviewer cancels a verified_interviewer booking', async function run() {
    const mutateFn = mockCancelInterviewMutation()
    mockAccountQuery({ data: { id: 'interviewer-user' } })
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'premium-1',
          status: 'scheduled',
          booking_channel: 'verified_interviewer',
          scheduler_id: 'scheduler-user',
          interviewer_id: 'interviewer-user',
          cancellation_reason: 'interviewer_cancelled',
        }),
      ],
    })

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getByRole('button', { name: /cancel premium-1/i }),
    )

    const mutateOptions = mutateFn.mock.calls[0]?.[1] as {
      onSuccess?: () => void
    }
    mutateOptions?.onSuccess?.()

    await waitFor(function () {
      expect(screen.getByRole('status')).toHaveTextContent(/credit was refunded/i)
    })
  })

  it('shows refunded message when the scheduler views an interviewer-account-deletion refund', async function run() {
    const mutateFn = mockCancelInterviewMutation()
    mockAccountQuery({ data: { id: 'scheduler-user' } })
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'premium-1',
          status: 'scheduled',
          booking_channel: 'verified_interviewer',
          scheduler_id: 'scheduler-user',
          interviewer_id: 'interviewer-user',
          cancellation_reason: 'interviewer_account_deleted',
        }),
      ],
    })

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getByRole('button', { name: /cancel premium-1/i }),
    )

    const mutateOptions = mutateFn.mock.calls[0]?.[1] as {
      onSuccess?: () => void
    }
    mutateOptions?.onSuccess?.()

    await waitFor(function () {
      expect(screen.getByRole('status')).toHaveTextContent(/credit was refunded/i)
    })
  })

  it('shows refunded message when an interviewer self-cancels a verified_interviewer booking with null cancellation_reason', async function run() {
    const mutateFn = mockCancelInterviewMutation()
    mockAccountQuery({ data: { id: 'interviewer-user' } })
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'premium-1',
          status: 'scheduled',
          booking_channel: 'verified_interviewer',
          scheduler_id: 'scheduler-user',
          interviewer_id: 'interviewer-user',
          cancellation_reason: 'interviewer_cancelled',
        }),
      ],
    })

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getByRole('button', { name: /cancel premium-1/i }),
    )

    const mutateOptions = mutateFn.mock.calls[0]?.[1] as {
      onSuccess?: () => void
    }
    mutateOptions?.onSuccess?.()

    await waitFor(function () {
      expect(screen.getByRole('status')).toHaveTextContent(/credit was refunded/i)
    })
  })

  it('keeps generic message when current user role is unknown on a verified_interviewer cancel', async function run() {
    const mutateFn = mockCancelInterviewMutation()
    mockAccountQuery({ data: undefined })
    mockInterviewsQuery({
      data: [
        createInterviewFixture({
          id: 'premium-1',
          status: 'scheduled',
          booking_channel: 'verified_interviewer',
          scheduler_id: 'scheduler-user',
          interviewer_id: 'interviewer-user',
        }),
      ],
    })

    renderWithQueryClient(<InterviewsSmart />)

    fireEvent.click(
      screen.getByRole('button', { name: /cancel premium-1/i }),
    )

    const mutateOptions = mutateFn.mock.calls[0]?.[1] as {
      onSuccess?: () => void
    }
    mutateOptions?.onSuccess?.()

    await waitFor(function () {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Interview cancelled successfully.',
      )
    })
  })
})
