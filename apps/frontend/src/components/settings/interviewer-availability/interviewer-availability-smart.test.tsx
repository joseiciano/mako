import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InterviewerAvailabilitySmart } from './interviewer-availability-smart'

const navigateMock = vi.hoisted(function createNavigateMock() {
  return vi.fn()
})

const useAccountMock = vi.hoisted(function createUseAccountMock() {
  return vi.fn()
})

const usePremiumSlotsMock = vi.hoisted(function createUsePremiumSlotsMock() {
  return vi.fn()
})

const usePublishPremiumSlotMock = vi.hoisted(function createUsePublishMock() {
  return vi.fn()
})

const useCancelPremiumSlotMock = vi.hoisted(function createUseCancelMock() {
  return vi.fn()
})

vi.mock('@tanstack/react-router', function mockTanstackRouter() {
  return {
    Navigate: function Navigate(props: { to: string }) {
      return <div data-testid="navigate">Navigate to {props.to}</div>
    },
    useNavigate: function useNavigate() {
      return navigateMock
    },
  }
})

vi.mock('#/hooks/use-account', function mockUseAccount() {
  return {
    useAccount: useAccountMock,
  }
})

vi.mock('#/hooks/use-premium-availability', function mockUsePremiumAvailability() {
  return {
    usePremiumSlots: usePremiumSlotsMock,
    usePublishPremiumSlot: usePublishPremiumSlotMock,
    useCancelPremiumSlot: useCancelPremiumSlotMock,
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

describe('InterviewerAvailabilitySmart', function suite() {
  beforeEach(function resetMocks() {
    useAccountMock.mockReset()
    usePremiumSlotsMock.mockReset()
    usePublishPremiumSlotMock.mockReset()
    useCancelPremiumSlotMock.mockReset()
  })

  it('renders loading state while account query is pending', function run() {
    useAccountMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    renderWithQueryClient(<InterviewerAvailabilitySmart />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('does not fetch owner slots before eligibility resolves', function run() {
    useAccountMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    renderWithQueryClient(<InterviewerAvailabilitySmart />)
    expect(usePremiumSlotsMock).toHaveBeenCalledWith({ enabled: false })
  })

  it('renders account error when account query fails', function run() {
    useAccountMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Account fetch failed'),
    })

    renderWithQueryClient(<InterviewerAvailabilitySmart />)
    expect(screen.getByRole('alert').textContent).toContain('Account fetch failed')
  })

  it('redirects non-verified interviewers to settings', function run() {
    useAccountMock.mockReturnValue({
      data: { isVerifiedInterviewer: false },
      isLoading: false,
      isError: false,
      error: null,
    })

    renderWithQueryClient(<InterviewerAvailabilitySmart />)
    expect(screen.getByTestId('navigate').textContent).toContain('/settings')
  })

  it('renders retryable error when slots query fails', function run() {
    useAccountMock.mockReturnValue({
      data: { isVerifiedInterviewer: true },
      isLoading: false,
      isError: false,
      error: null,
    })

    const refetchMock = vi.fn()
    usePremiumSlotsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: refetchMock,
    })

    usePublishPremiumSlotMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    })

    useCancelPremiumSlotMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    })

    renderWithQueryClient(<InterviewerAvailabilitySmart />)
    expect(screen.getByRole('alert').textContent).toContain('Network error')
    const retryButton = screen.getByRole('button', { name: /Retry/i })
    retryButton.click()
    expect(refetchMock).toHaveBeenCalled()
  })

  it('does not render empty inventory when slots query errors', function run() {
    useAccountMock.mockReturnValue({
      data: { isVerifiedInterviewer: true },
      isLoading: false,
      isError: false,
      error: null,
    })

    usePremiumSlotsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Server error'),
      refetch: vi.fn(),
    })

    usePublishPremiumSlotMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    })

    useCancelPremiumSlotMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    })

    renderWithQueryClient(<InterviewerAvailabilitySmart />)
    expect(screen.queryByText(/No premium slots published yet/)).toBeNull()
  })

  it('focuses publish error alert after failed publish', async function run() {
    useAccountMock.mockReturnValue({
      data: { isVerifiedInterviewer: true },
      isLoading: false,
      isError: false,
      error: null,
    })

    usePremiumSlotsMock.mockReturnValue({
      data: { slots: [], policy: { leadTimeMinutes: 60, horizonDays: 90 } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const mutateAsyncMock = vi.fn().mockRejectedValue(new Error('Time conflict detected'))
    usePublishPremiumSlotMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      variables: undefined,
    })

    useCancelPremiumSlotMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    })

    renderWithQueryClient(<InterviewerAvailabilitySmart />)

    const input = screen.getByLabelText('Start Time') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-08-08T10:00' } })
    const form = screen.getByRole('button', { name: 'Publish Slot' }).closest('form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await waitFor(function () {
      expect(screen.getByRole('alert').textContent).toContain('Time conflict detected')
    })

    expect(screen.getByRole('alert')).toHaveFocus()
  })

  it('clears publish error after successful publish', async function run() {
    useAccountMock.mockReturnValue({
      data: { isVerifiedInterviewer: true },
      isLoading: false,
      isError: false,
      error: null,
    })

    usePremiumSlotsMock.mockReturnValue({
      data: { slots: [], policy: { leadTimeMinutes: 60, horizonDays: 90 } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const mutateAsyncMock = vi.fn().mockResolvedValueOnce(undefined)
    usePublishPremiumSlotMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      variables: undefined,
    })

    useCancelPremiumSlotMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    })

    renderWithQueryClient(<InterviewerAvailabilitySmart />)

    const input = screen.getByLabelText('Start Time') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-08-08T10:00' } })
    const form = screen.getByRole('button', { name: 'Publish Slot' }).closest('form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await waitFor(function () {
      expect(mutateAsyncMock).toHaveBeenCalled()
    })

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reconciles cancel 409 by refetching slots and showing claimed message', async function run() {
    useAccountMock.mockReturnValue({
      data: { isVerifiedInterviewer: true },
      isLoading: false,
      isError: false,
      error: null,
    })

    const refetchMock = vi.fn().mockResolvedValue(undefined)
    usePremiumSlotsMock.mockReturnValue({
      data: {
        slots: [
          {
            id: 'slot-1',
            interviewerId: 'user-1',
            interviewType: 'system_design',
            startTime: '2026-08-08T10:00:00.000Z',
            endTime: '2026-08-08T11:00:00.000Z',
            status: 'available',
            createdAt: '2026-08-07T20:00:00.000Z',
            updatedAt: '2026-08-07T20:00:00.000Z',
          },
        ],
        policy: { leadTimeMinutes: 60, horizonDays: 90 },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    })

    usePublishPremiumSlotMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    })

    const mutateAsyncMock = vi.fn().mockRejectedValue(
      new Error('A claimed premium slot cannot be cancelled.'),
    )
    useCancelPremiumSlotMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      variables: undefined,
    })

    renderWithQueryClient(<InterviewerAvailabilitySmart />)

    const cancelButton = screen.getByRole('button', { name: /Cancel slot/ })
    cancelButton.click()

    await waitFor(function () {
      expect(refetchMock).toHaveBeenCalled()
    })

    expect(screen.getByRole('alert').textContent).toContain('claimed by another user')
  })
})
