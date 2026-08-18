import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, type ReactNode } from 'react'
import type { PremiumMarketplaceSlot } from '@mako/shared'

const mockLinkSpy = vi.hoisted(() =>
  vi.fn(function MockLink(props: {
    to: string
    children: ReactNode
    className?: string
  }) {
    return (
      <a href={props.to} className={props.className}>
        {props.children}
      </a>
    )
  }),
)

vi.mock('@tanstack/react-router', function () {
  return { Link: mockLinkSpy }
})
import { SCHEDULE_DRAFT_V2_STORAGE_KEY } from './schedule-flow'
import {
  classifyClaimError,
  PremiumMarketplaceSmart,
  replayedClaims,
} from './premium-marketplace-smart'
import {
  PremiumMarketplaceDumb,
  type PremiumMarketplaceDumbProps,
} from './premium-marketplace-dumb'
import { clearVerifiedInterviewerClaim } from './schedule-draft-storage'
import { formatScheduledTime } from '#/lib/format-scheduled-time'

const slotFixture: PremiumMarketplaceSlot = {
  slotId: '11111111-1111-4111-8111-111111111111',
  interviewType: 'system_design',
  startTime: '2026-08-08T10:00:00.000Z',
  endTime: '2026-08-08T11:00:00.000Z',
  interviewer: {
    displayName: 'Interviewer-Red',
    image: 'https://example.com/avatar.png',
    isVerified: true,
  },
}

const secondSlotFixture: PremiumMarketplaceSlot = {
  slotId: '22222222-2222-4222-8222-222222222222',
  interviewType: 'system_design',
  startTime: '2026-08-09T10:00:00.000Z',
  endTime: '2026-08-09T11:00:00.000Z',
  interviewer: {
    displayName: 'Interviewer-Blue',
    image: null,
    isVerified: true,
  },
}

const claimResponseFixture = {
  interview: {
    id: '44444444-4444-4444-8444-444444444444',
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: '33333333-3333-4333-8333-333333333333',
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'peer_to_peer',
    booking_channel: 'verified_interviewer',
    tier: 'premium',
    status: 'scheduled',
    scheduled_at: '2026-08-08T10:00:00.000Z',
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    recording_status: 'not_started',
    transcript: null,
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    screenshots_finalized_at: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: '2026-08-07T20:00:00.000Z',
    updated_at: '2026-08-07T20:00:00.000Z',
  },
}

const slotId = '11111111-1111-4111-8111-111111111111'
const idempotencyKey = '66666666-6666-4666-8666-666666666666'

let mockMarketplaceSlots: PremiumMarketplaceSlot[] = []
let mockMarketplaceIsLoading = false
let mockMarketplaceIsError = false
let mockMarketplaceRefetch: ReturnType<typeof vi.fn> = vi.fn()
let mockAccountCredits: number | null = 1
const mockClaimMutate = vi.fn()
let mockClaimIsPending = false
let mockClaimStatus: 'idle' | 'pending' | 'success' | 'error' = 'idle'
let mockClaimData: unknown = null
let mockClaimError: Error | null = null
const mockClaimReset = vi.fn()

function resolveClaimAsSuccess(
  data: typeof claimResponseFixture = claimResponseFixture,
) {
  mockClaimStatus = 'success'
  mockClaimData = data
  mockClaimError = null
}

function rejectClaimAsError(message: string) {
  mockClaimStatus = 'error'
  mockClaimData = null
  mockClaimError = new Error(message)
}

vi.mock('#/hooks/use-premium-marketplace', async function mockMarketplaceHooks(
  importOriginal,
) {
  const actual = await importOriginal<
    typeof import('#/hooks/use-premium-marketplace')
  >()
  return {
    ...actual,
    usePremiumMarketplace: function useMockedMarketplace() {
      return {
        data: mockMarketplaceIsError
          ? undefined
          : {
              slots: mockMarketplaceSlots,
              pagination: { limit: 25, offset: 0, hasMore: false },
              policy: { leadTimeMinutes: 60, horizonDays: 90, priceCredits: 1 },
            },
        isLoading: mockMarketplaceIsLoading,
        isError: mockMarketplaceIsError,
        isSuccess: !mockMarketplaceIsLoading && !mockMarketplaceIsError,
        refetch: mockMarketplaceRefetch,
      }
    },
    useClaimPremiumSlot: function useMockedClaimSlot() {
      return {
        mutate: mockClaimMutate,
        reset: mockClaimReset,
        get isPending() {
          return mockClaimIsPending
        },
        get status() {
          return mockClaimStatus
        },
        get isSuccess() {
          return mockClaimStatus === 'success'
        },
        get isError() {
          return mockClaimStatus === 'error'
        },
        get data() {
          return mockClaimData
        },
        get error() {
          return mockClaimError
        },
      }
    },
  }
})

vi.mock('#/hooks/use-account', function mockAccountHook() {
  return {
    useAccount: function useMockedAccount() {
      return {
        isSuccess: mockAccountCredits !== null,
        isLoading: false,
        isError: false,
        data:
          mockAccountCredits === null
            ? undefined
            : { id: 'demo-user', credits: mockAccountCredits },
      }
    },
  }
})

function persistedClaim(
  overrides: Partial<{
    slotId: string
    idempotencyKey: string
    startedAt: string
  }> = {},
) {
  return JSON.stringify({
    version: 'v2',
    branch: 'verified_interviewer',
    slotId,
    idempotencyKey,
    startedAt: '2026-08-08T09:00:00.000Z',
    ...overrides,
  })
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('premium marketplace phase 3', function premiumMarketplaceSuite() {
  describe('classifyClaimError', function classifySuite() {
    it('maps every exact 409 literal to its failure kind', function run() {
      expect(
        classifyClaimError(new Error('PREMIUM_SLOT_ALREADY_CLAIMED')),
      ).toBe('already_claimed')
      expect(
        classifyClaimError(new Error('PREMIUM_INTERVIEWER_INELIGIBLE')),
      ).toBe('interviewer_ineligible')
      expect(classifyClaimError(new Error('INSUFFICIENT_CREDITS'))).toBe(
        'insufficient_credits',
      )
      expect(
        classifyClaimError(new Error('PREMIUM_SCHEDULING_CONFLICT')),
      ).toBe('scheduling_conflict')
      expect(
        classifyClaimError(new Error('IDEMPOTENCY_KEY_CONFLICT')),
      ).toBe('idempotency_conflict')
    })

    it('treats network/unknown failures as transient and null error as no failure', function run() {
      expect(classifyClaimError(new Error('Network failure'))).toBe(
        'transient',
      )
      expect(classifyClaimError(null)).toBeNull()
    })
  })

  describe('clearVerifiedInterviewerClaim', function clearClaimSuite() {
    it('removes only the durable verified_interviewer claim', function run() {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      clearVerifiedInterviewerClaim()

      expect(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY),
      ).toBeNull()
    })
  })

  describe('PremiumMarketplaceDumb', function dumbSuite() {
    function renderDumb(props: Partial<PremiumMarketplaceDumbProps> = {}) {
      const defaultProps: PremiumMarketplaceDumbProps = {
        slots: [slotFixture],
        priceCredits: 1,
        accountCredits: 1,
        isLoading: false,
        isError: false,
        isReserving: false,
        pendingClaimMessage: null,
        errorOutcome: null,
        bookedInterviewId: null,
        onBookSlot: vi.fn(),
        onRetry: vi.fn(),
        onSameSlotResubmit: vi.fn(),
        onRetryMarketplace: vi.fn(),
        ...props,
      }
      return render(<PremiumMarketplaceDumb {...defaultProps} />)
    }

    it('renders only safe public system_design fields for a slot', function run() {
      const { container } = renderDumb()

      expect(screen.getByText('Interviewer-Red')).toBeDefined()
      expect(screen.getByText('Verified')).toBeDefined()
      expect(screen.getByText('System Design')).toBeDefined()
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://example.com/avatar.png',
      )
      expect(
        screen.getByRole('button', { name: /claim this slot/i }),
      ).toBeDefined()
    })

    it('never renders private fields or non-system_design output', function run() {
      const leaked = {
        ...slotFixture,
        interviewer: {
          ...slotFixture.interviewer,
          company: 'Acme Corp',
          role: 'Staff Engineer',
          email: 'red@acme.example',
          phone: '555-0100',
        },
        interviewType: 'system_design',
      } as unknown as PremiumMarketplaceSlot

      renderDumb({ slots: [leaked, secondSlotFixture] })

      expect(screen.queryByText('Acme Corp')).toBeNull()
      expect(screen.queryByText('Staff Engineer')).toBeNull()
      expect(screen.queryByText('red@acme.example')).toBeNull()
      expect(screen.queryByText('555-0100')).toBeNull()
      expect(screen.queryByText('Coding')).toBeNull()
      expect(screen.queryByText('Behavioral')).toBeNull()
      expect(screen.queryByText('Interviewer-Blue')).toBeDefined()
    })

    it('shows the loading state', function run() {
      renderDumb({ isLoading: true, slots: [] })
      expect(
        screen.getByText(/loading verified interviewer slots/i),
      ).toBeDefined()
    })

    it('shows a recoverable marketplace error state', function run() {
      const onRetryMarketplace = vi.fn()
      renderDumb({ isError: true, slots: [], onRetryMarketplace })
      expect(screen.getByRole('alert')).toHaveTextContent(
        /unable to load/i,
      )
      expect(
        screen.getByRole('button', { name: /try again/i }),
      ).toBeDefined()
    })

    it('shows an empty state when no slots are available', function run() {
      renderDumb({ slots: [] })
      expect(
        screen.getByText(
          /no verified-interviewer slots are currently available/i,
        ),
      ).toBeDefined()
    })

    it('renders the one-credit policy note and account balance', function run() {
      const { container } = renderDumb({ accountCredits: 3 })
      expect(container.textContent).toContain('exactly')
      expect(container.textContent).toContain('credit')
      expect(container.textContent).toContain('3 credits available')
    })

    it('calls onBookSlot with the slot id', async function run() {
      const onBookSlot = vi.fn()
      const user = userEvent.setup()
      renderDumb({ onBookSlot })

      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )

      expect(onBookSlot).toHaveBeenCalledWith(slotId)
    })

    it('disables booking while a claim is being reserved', function run() {
      renderDumb({ isReserving: true })
      expect(
        screen.getByRole('button', { name: /reserving/i }),
      ).toHaveProperty('disabled', true)
    })

    it('disables booking while an unresolved claim is pending', function run() {
      renderDumb({
        slots: [slotFixture, secondSlotFixture],
        pendingClaimMessage:
          'You have a claim in progress. Resolve it before claiming a different slot.',
      })
      const bookButtons = screen.getAllByRole('button', {
        name: /claim this slot/i,
      })
      expect(bookButtons).toHaveLength(2)
      expect(bookButtons[0]).toHaveProperty('disabled', true)
      expect(bookButtons[1]).toHaveProperty('disabled', true)
      expect(screen.getByText(/claim in progress/i)).toBeDefined()
    })

    it('renders a retry action for retained claims', async function run() {
      const onRetry = vi.fn()
      const user = userEvent.setup()
      renderDumb({
        errorOutcome: {
          message:
            'We could not confirm whether your claim went through.',
          retryLabel: 'Retry claim',
          sameSlotResubmitLabel: null,
          billingHref: null,
        },
        onRetry,
      })

      await user.click(
        screen.getByRole('button', { name: /retry claim/i }),
      )
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders the billing link for insufficient credits', function run() {
      renderDumb({
        errorOutcome: {
          message:
            'A claim costs exactly one credit and your balance is too low.',
          retryLabel: null,
          sameSlotResubmitLabel: null,
          billingHref: '/billing',
        },
      })
      expect(
        screen.getByRole('link', { name: /add credits/i }),
      ).toHaveAttribute('href', '/billing')
    })

    it('uses TanStack Router Link for billing navigation', function run() {
      mockLinkSpy.mockClear()
      renderDumb({
        errorOutcome: {
          message: 'A claim costs exactly one credit and your balance is too low.',
          retryLabel: null,
          sameSlotResubmitLabel: null,
          billingHref: '/billing',
        },
      })
      expect(mockLinkSpy).toHaveBeenCalledTimes(1)
      const firstArg = mockLinkSpy.mock.calls[0]![0] as { to: string }
      expect(firstArg.to).toBe('/billing')
    })

    it('renders the same-slot resubmit action for idempotency conflicts', async function run() {
      const onSameSlotResubmit = vi.fn()
      const user = userEvent.setup()
      renderDumb({
        errorOutcome: {
          message: 'Your previous claim could not be confirmed.',
          retryLabel: null,
          sameSlotResubmitLabel: 'Claim again with a fresh key',
          billingHref: null,
        },
        onSameSlotResubmit,
      })

      await user.click(
        screen.getByRole('button', { name: /fresh key/i }),
      )
      expect(onSameSlotResubmit).toHaveBeenCalledTimes(1)
    })

    it('renders the booked confirmation with the interview id', function run() {
      renderDumb({
        bookedInterviewId: '44444444-4444-4444-8444-444444444444',
      })
      expect(screen.getByRole('status')).toHaveTextContent(/booked/i)
      expect(screen.getByRole('status')).toHaveTextContent(
        '44444444-4444-4444-8444-444444444444',
      )
    })

    it('claim button accessible name identifies interviewer and formatted start time', function run() {
      renderDumb()

      const formattedStart = formatScheduledTime(slotFixture.startTime)
      const expectedAccessibleName = new RegExp(
        `claim this slot.*${slotFixture.interviewer.displayName}.*${formattedStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i',
      )
      expect(
        screen.getByRole('button', { name: expectedAccessibleName }),
      ).toBeDefined()
    })

    it('booked status region uses aria-live="polite" for dynamic updates', function run() {
      renderDumb({
        bookedInterviewId: '44444444-4444-4444-8444-444444444444',
      })
      const statusRegion = screen.getByRole('status')
      expect(statusRegion).toHaveAttribute('aria-live', 'polite')
    })

    it('pending claim status region uses aria-live="polite" for dynamic updates', function run() {
      renderDumb({
        pendingClaimMessage:
          'You have a claim in progress. Resolve it before claiming a different slot.',
      })
      const statusRegions = screen.getAllByRole('status')
      const pendingRegion = statusRegions.find(function findPending(region) {
        return region.textContent?.includes('claim in progress')
      })
      expect(pendingRegion).toBeDefined()
      expect(pendingRegion).toHaveAttribute('aria-live', 'polite')
    })

    it('gives each claim button a contextual accessible name including interviewer and formatted time', function run() {
      renderDumb({ slots: [slotFixture, secondSlotFixture] })

      const redButtonTime = formatScheduledTime(slotFixture.startTime)
      const redButton = screen.getByRole('button', {
        name: (accessibleName) =>
          accessibleName.includes('claim') &&
          accessibleName.includes('Interviewer-Red') &&
          accessibleName.includes(redButtonTime),
      })
      expect(redButton).toBeDefined()

      const blueButtonTime = formatScheduledTime(secondSlotFixture.startTime)
      const blueButton = screen.getByRole('button', {
        name: (accessibleName) =>
          accessibleName.includes('claim') &&
          accessibleName.includes('Interviewer-Blue') &&
          accessibleName.includes(blueButtonTime),
      })
      expect(blueButton).toBeDefined()
    })

    it('marks the dynamically rendered booked confirmation as aria-live polite', function run() {
      renderDumb({ bookedInterviewId: '44444444-4444-4444-8444-444444444444' })
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    })

    it('marks the dynamically rendered pending-claim status as aria-live polite', function run() {
      renderDumb({
        pendingClaimMessage:
          'You have a claim in progress. Resolve it before claiming a different slot.',
      })
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    })
  })

  describe('PremiumMarketplaceSmart', function smartSuite() {
    beforeEach(function resetMocks() {
      mockMarketplaceSlots = [slotFixture]
      mockMarketplaceIsLoading = false
      mockMarketplaceIsError = false
      mockMarketplaceRefetch = vi.fn()
      mockAccountCredits = 1
      mockClaimMutate.mockClear()
      mockClaimIsPending = false
      mockClaimStatus = 'idle'
      mockClaimData = null
      mockClaimError = null
      mockClaimReset.mockClear()
      replayedClaims.clear()
      window.localStorage.clear()
      window.sessionStorage.clear()
    })

    it('lists available marketplace slots', async function run() {
      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      expect(
        await screen.findByText('Interviewer-Red'),
      ).toBeDefined()
    })

    it('does not render or book non-system_design slots from the response', async function run() {
      const codingSlot: PremiumMarketplaceSlot = {
        ...slotFixture,
        slotId: '33333333-3333-4333-8333-333333333333',
        interviewType: 'coding',
        interviewer: {
          displayName: 'Interviewer-Coding',
          image: null,
          isVerified: true,
        },
      }
      const behavioralSlot: PremiumMarketplaceSlot = {
        ...slotFixture,
        slotId: '44444444-4444-4444-8444-444444444444',
        interviewType: 'behavioral',
        interviewer: {
          displayName: 'Interviewer-Behavioral',
          image: null,
          isVerified: true,
        },
      }
      mockMarketplaceSlots = [slotFixture, codingSlot, behavioralSlot]

      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      expect(await screen.findByText('Interviewer-Red')).toBeDefined()
      expect(screen.queryByText('Interviewer-Coding')).toBeNull()
      expect(screen.queryByText('Interviewer-Behavioral')).toBeNull()
      expect(
        screen.getAllByRole('button', { name: /claim this slot/i }),
      ).toHaveLength(1)
    })

    it('persists the durable claim before sending the claim request', async function run() {
      const user = userEvent.setup()
      const originalSetItem =
        Storage.prototype.setItem.bind(window.localStorage)
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(function capture(key, value) {
          originalSetItem(String(key), String(value))
        })

      mockClaimMutate.mockImplementation(function assertDurableClaimFirst(
        vars,
      ) {
        const stored = JSON.parse(
          window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)!,
        )
        expect(stored.branch).toBe('verified_interviewer')
        expect(stored.slotId).toBe(vars.slotId)
        expect(stored.idempotencyKey).toBe(vars.idempotencyKey)
        expect(typeof stored.startedAt).toBe('string')
      })

      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })
      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )

      expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      expect(setItemSpy).toHaveBeenCalledWith(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        expect.any(String),
      )

      setItemSpy.mockRestore()
    })

    it('issues the claim with variables only and never passes state-setter callbacks to mutate', async function run() {
      const user = userEvent.setup()
      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )

      expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      const [variables, options] = mockClaimMutate.mock.calls[0]!
      expect(variables.slotId).toBe(slotId)
      expect(typeof variables.idempotencyKey).toBe('string')
      expect(options).toBeUndefined()
    })

    it('resets the mutation before a fresh claim so stale prior outcomes cannot leak', async function run() {
      const user = userEvent.setup()
      mockMarketplaceSlots = [slotFixture, secondSlotFixture]
      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })
      const claimButtons = screen.getAllByRole('button', {
        name: /claim this slot/i,
      })

      await user.click(claimButtons[0]!)
      resolveClaimAsSuccess(claimResponseFixture)
      view.rerender(<PremiumMarketplaceSmart />)
      await waitFor(function assertFirstBooked() {
        expect(screen.getByRole('status')).toHaveTextContent(
          '44444444-4444-4444-8444-444444444444',
        )
      })
      expect(mockClaimReset).toHaveBeenCalledTimes(1)

      await user.click(
        screen.getAllByRole('button', { name: /claim this slot/i })[1]!,
      )

      // A fresh claim resets the mutation first, so the previous success
      // outcome can never be re-applied to the new claim.
      expect(mockClaimReset).toHaveBeenCalledTimes(2)
      expect(mockClaimMutate).toHaveBeenCalledTimes(2)
    })

    it('does not apply terminal outcome handling after the component unmounts', async function run() {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })
      const claimKey = `${slotId}:${idempotencyKey}`
      expect(replayedClaims.has(claimKey)).toBe(true)

      view.unmount()

      // A terminal mutation outcome arriving after unmount must not mutate
      // state, clear the durable claim, or run the replay-cleanup side effects.
      resolveClaimAsSuccess()
      expect(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY),
      ).not.toBeNull()
      expect(replayedClaims.has(claimKey)).toBe(true)
    })

    it('does not send the claim request when the durable write fails', async function run() {
      const user = userEvent.setup()
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(function throwOnWrite() {
          throw new Error('storage unavailable')
        })

      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })
      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )

      expect(mockClaimMutate).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent(
        /no request was sent/i,
      )
      expect(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY),
      ).toBeNull()

      setItemSpy.mockRestore()
    })

    it('shows a reserving state and prevents duplicate submission while pending', async function run() {
      const user = userEvent.setup()
      mockClaimIsPending = true

      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      expect(
        screen.getByRole('button', { name: /reserving/i }),
      ).toHaveProperty('disabled', true)

      const reservingButton = screen.getByRole('button', {
        name: /reserving/i,
      })
      await user.click(reservingButton)
      await user.click(reservingButton)

      expect(mockClaimMutate).not.toHaveBeenCalled()
    })

    it('clears the durable claim and confirms the booking on a 201 success', async function run() {
      const user = userEvent.setup()
      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )
      expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      expect(mockClaimMutate.mock.calls[0]![1]).toBeUndefined()
      resolveClaimAsSuccess()
      view.rerender(<PremiumMarketplaceSmart />)

      await waitFor(function assertBooked() {
        expect(screen.getByRole('status')).toHaveTextContent(/booked/i)
      })
      expect(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY),
      ).toBeNull()
      expect(screen.getByRole('status')).toHaveTextContent(
        '44444444-4444-4444-8444-444444444444',
      )
    })

    it('treats a 200 replay success as success and clears the durable claim', async function run() {
      const user = userEvent.setup()
      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )
      resolveClaimAsSuccess()
      view.rerender(<PremiumMarketplaceSmart />)

      await waitFor(function assertBooked() {
        expect(screen.getByRole('status')).toHaveTextContent(/booked/i)
      })
      expect(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY),
      ).toBeNull()
    })

    it('treats PREMIUM_SLOT_ALREADY_CLAIMED as terminal after refetching', async function run() {
      const user = userEvent.setup()
      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )
      rejectClaimAsError('PREMIUM_SLOT_ALREADY_CLAIMED')
      view.rerender(<PremiumMarketplaceSmart />)

      await waitFor(function assertTerminal() {
        expect(screen.getByRole('alert')).toHaveTextContent(
          /no longer available/i,
        )
      })
      expect(mockMarketplaceRefetch).toHaveBeenCalledTimes(1)
      expect(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY),
      ).toBeNull()
      expect(
        screen.queryByRole('button', { name: /retry claim/i }),
      ).toBeNull()
    })

    it('treats PREMIUM_INTERVIEWER_INELIGIBLE as terminal after refetching', async function run() {
      const user = userEvent.setup()
      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )
      rejectClaimAsError('PREMIUM_INTERVIEWER_INELIGIBLE')
      view.rerender(<PremiumMarketplaceSmart />)

      await waitFor(function assertTerminal() {
        expect(screen.getByRole('alert')).toHaveTextContent(
          /no longer eligible/i,
        )
      })
      expect(mockMarketplaceRefetch).toHaveBeenCalledTimes(1)
      expect(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY),
      ).toBeNull()
    })

    it('retains the claim and key on INSUFFICIENT_CREDITS and links to billing', async function run() {
      const user = userEvent.setup()
      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )
      const firstKey = mockClaimMutate.mock.calls[0]![0].idempotencyKey
      rejectClaimAsError('INSUFFICIENT_CREDITS')
      view.rerender(<PremiumMarketplaceSmart />)

      await waitFor(function assertRetained() {
        expect(screen.getByRole('alert')).toHaveTextContent(
          /exactly one credit/i,
        )
      })
      const stored = JSON.parse(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)!,
      )
      expect(stored.idempotencyKey).toBe(firstKey)
      expect(
        screen.getByRole('link', { name: /add credits/i }),
      ).toHaveAttribute('href', '/billing')
      expect(
        screen.getByRole('button', { name: /retry claim/i }),
      ).toBeDefined()
    })

    it('retains the claim and key on PREMIUM_SCHEDULING_CONFLICT', async function run() {
      const user = userEvent.setup()
      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )
      const firstKey = mockClaimMutate.mock.calls[0]![0].idempotencyKey
      rejectClaimAsError('PREMIUM_SCHEDULING_CONFLICT')
      view.rerender(<PremiumMarketplaceSmart />)

      await waitFor(function assertRetained() {
        expect(screen.getByRole('alert')).toHaveTextContent(/conflict/i)
      })
      const stored = JSON.parse(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)!,
      )
      expect(stored.idempotencyKey).toBe(firstKey)
      expect(
        screen.getByRole('button', { name: /retry claim/i }),
      ).toBeDefined()
    })

    it('retains the claim on a network failure and retries with the same key', async function run() {
      const user = userEvent.setup()
      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )
      const firstKey = mockClaimMutate.mock.calls[0]![0].idempotencyKey
      rejectClaimAsError('Network failure')
      view.rerender(<PremiumMarketplaceSmart />)

      await waitFor(function assertRetained() {
        expect(
          screen.getByRole('button', { name: /retry claim/i }),
        ).toBeDefined()
      })
      expect(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY),
      ).not.toBeNull()
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not confirm/i,
      )

      await user.click(
        screen.getByRole('button', { name: /retry claim/i }),
      )

      expect(mockClaimMutate).toHaveBeenCalledTimes(2)
      expect(
        mockClaimMutate.mock.calls[1]![0].idempotencyKey,
      ).toBe(firstKey)
    })

    it('replaces the durable key on IDEMPOTENCY_KEY_CONFLICT same-slot resubmit', async function run() {
      const user = userEvent.setup()
      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await user.click(
        screen.getByRole('button', { name: /claim this slot/i }),
      )
      const firstKey = mockClaimMutate.mock.calls[0]![0].idempotencyKey
      rejectClaimAsError('IDEMPOTENCY_KEY_CONFLICT')
      view.rerender(<PremiumMarketplaceSmart />)

      await waitFor(function assertConflict() {
        expect(
          screen.getByRole('button', { name: /fresh key/i }),
        ).toBeDefined()
      })
      await user.click(
        screen.getByRole('button', { name: /fresh key/i }),
      )

      expect(mockClaimMutate).toHaveBeenCalledTimes(2)
      const secondVars = mockClaimMutate.mock.calls[1]![0]
      expect(secondVars.slotId).toBe(slotId)
      expect(secondVars.idempotencyKey).not.toBe(firstKey)

      const stored = JSON.parse(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)!,
      )
      expect(stored.idempotencyKey).toBe(secondVars.idempotencyKey)
      expect(stored.slotId).toBe(slotId)
    })

    it('resets startedAt when replacing the key for a recovered claim', async function run() {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim({ startedAt: '2020-01-01T00:00:00.000Z' }),
      )
      const user = userEvent.setup()
      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })
      expect(mockClaimMutate.mock.calls[0]![0]).toEqual({
        slotId,
        idempotencyKey,
      })

      rejectClaimAsError('IDEMPOTENCY_KEY_CONFLICT')
      view.rerender(<PremiumMarketplaceSmart />)

      await waitFor(function assertConflict() {
        expect(
          screen.getByRole('button', { name: /fresh key/i }),
        ).toBeDefined()
      })
      await user.click(
        screen.getByRole('button', { name: /fresh key/i }),
      )

      const stored = JSON.parse(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)!,
      )
      expect(stored.idempotencyKey).not.toBe(idempotencyKey)
      expect(stored.startedAt).not.toBe('2020-01-01T00:00:00.000Z')
    })

    it('replays a persisted claim once under StrictMode', async function run() {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      render(
        <StrictMode>
          <PremiumMarketplaceSmart />
        </StrictMode>,
        { wrapper: createWrapper() },
      )

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })
      expect(mockClaimMutate.mock.calls[0]![0]).toEqual({
        slotId,
        idempotencyKey,
      })
      expect(mockClaimMutate.mock.calls[0]![1]).toBeUndefined()
    })

    it('StrictMode double-mount does not corrupt persisted claim in localStorage', async function run() {
      const originalClaim = persistedClaim()
      window.localStorage.setItem(SCHEDULE_DRAFT_V2_STORAGE_KEY, originalClaim)

      const view = render(
        <StrictMode>
          <PremiumMarketplaceSmart />
        </StrictMode>,
        { wrapper: createWrapper() },
      )

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })

      const stored = JSON.parse(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)!,
      )
      expect(stored.slotId).toBe(slotId)
      expect(stored.idempotencyKey).toBe(idempotencyKey)
      expect(stored.branch).toBe('verified_interviewer')
      expect(typeof stored.startedAt).toBe('string')

      rejectClaimAsError('Network failure')
      view.rerender(
        <StrictMode>
          <PremiumMarketplaceSmart />
        </StrictMode>,
      )

      await waitFor(function assertRetained() {
        expect(screen.getByRole('alert')).toHaveTextContent(
          /could not confirm/i,
        )
      })

      const storedAfterError = JSON.parse(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)!,
      )
      expect(storedAfterError.slotId).toBe(slotId)
      expect(storedAfterError.idempotencyKey).toBe(idempotencyKey)
      expect(storedAfterError.branch).toBe('verified_interviewer')
    })

    it('StrictMode regression: document-lifetime guard prevents duplicate automatic replay', async function run() {
      const claimKey = `${slotId}:${idempotencyKey}`
      expect(replayedClaims.has(claimKey)).toBe(false)

      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      render(
        <StrictMode>
          <PremiumMarketplaceSmart />
        </StrictMode>,
        { wrapper: createWrapper() },
      )

      await waitFor(function assertSingleReplay() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })

      expect(replayedClaims.has(claimKey)).toBe(true)
      expect(mockClaimMutate).toHaveBeenCalledWith(
        { slotId, idempotencyKey },
      )
    })

    it('removes replayedClaims entry when terminal error clears the durable claim', async function run() {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      const view = render(
        <StrictMode>
          <PremiumMarketplaceSmart />
        </StrictMode>,
        { wrapper: createWrapper() },
      )

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })

      const claimKey = `${slotId}:${idempotencyKey}`
      expect(replayedClaims.has(claimKey)).toBe(true)

      rejectClaimAsError('PREMIUM_SLOT_ALREADY_CLAIMED')
      view.rerender(
        <StrictMode>
          <PremiumMarketplaceSmart />
        </StrictMode>,
      )

      await waitFor(function assertTerminal() {
        expect(screen.getByRole('alert')).toHaveTextContent(
          /no longer available/i,
        )
      })

      expect(replayedClaims.has(claimKey)).toBe(false)
    })

    it('removes old replayedClaims entry when key is replaced via same-slot resubmit', async function run() {
      const user = userEvent.setup()
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      const view = render(
        <StrictMode>
          <PremiumMarketplaceSmart />
        </StrictMode>,
        { wrapper: createWrapper() },
      )

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })

      const oldKey = `${slotId}:${idempotencyKey}`
      expect(replayedClaims.has(oldKey)).toBe(true)

      rejectClaimAsError('IDEMPOTENCY_KEY_CONFLICT')
      view.rerender(
        <StrictMode>
          <PremiumMarketplaceSmart />
        </StrictMode>,
      )

      await waitFor(function assertConflict() {
        expect(
          screen.getByRole('button', { name: /fresh key/i }),
        ).toBeDefined()
      })

      await user.click(
        screen.getByRole('button', { name: /fresh key/i }),
      )

      expect(replayedClaims.has(oldKey)).toBe(false)
    })

    it('replays the same key for the same slot on reload with a persisted unknown claim', async function run() {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })
      expect(mockClaimMutate.mock.calls[0]![0]).toEqual({
        slotId,
        idempotencyKey,
      })
    })

    it('clears the durable claim after a successful replay', async function run() {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      const view = render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })
      resolveClaimAsSuccess()
      view.rerender(<PremiumMarketplaceSmart />)

      await waitFor(function assertClaimCleared() {
        expect(
          window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY),
        ).toBeNull()
      })
      expect(screen.getByRole('status')).toHaveTextContent(/booked/i)
    })

    it('regression: StrictMode issues claim once, fresh page replays it', async function run() {
      const claimKey = `${slotId}:${idempotencyKey}`
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      const { unmount } = render(
        <StrictMode>
          <PremiumMarketplaceSmart />
        </StrictMode>,
        { wrapper: createWrapper() },
      )

      await waitFor(function assertSingleReplay() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })
      expect(replayedClaims.has(claimKey)).toBe(true)

      unmount()

      // Simulate page reload: clear module-level guard
      replayedClaims.clear()

      // Fresh page: claim replays
      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await waitFor(function assertReplayAfterReload() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(2)
      })
      expect(mockClaimMutate.mock.calls[1]![0]).toEqual({
        slotId,
        idempotencyKey,
      })
    })

    it('regression: re-render does not replay the durable claim again', async function run() {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      const { rerender } = render(<PremiumMarketplaceSmart />, {
        wrapper: createWrapper(),
      })

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })

      rerender(<PremiumMarketplaceSmart />)

      expect(mockClaimMutate).toHaveBeenCalledTimes(1)
    })

    it('regression: fresh page with no prior replayedClaims reissues the persisted claim', async function run() {
      // Ensure replayedClaims is empty (simulates brand-new document)
      replayedClaims.clear()
      expect(replayedClaims.size).toBe(0)

      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })
      expect(mockClaimMutate).toHaveBeenCalledWith(
        { slotId, idempotencyKey },
      )
    })

    it('blocks claiming a different slot while an unknown claim is unresolved', async function run() {
      mockMarketplaceSlots = [slotFixture, secondSlotFixture]
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        persistedClaim(),
      )

      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      await waitFor(function assertReplayIssued() {
        expect(mockClaimMutate).toHaveBeenCalledTimes(1)
      })

      const bookButtons = screen.getAllByRole('button', {
        name: /claim this slot/i,
      })
      expect(bookButtons).toHaveLength(2)
      expect(bookButtons[0]).toHaveProperty('disabled', true)
      expect(bookButtons[1]).toHaveProperty('disabled', true)
      expect(screen.getByText(/claim in progress/i)).toBeDefined()
    })

    it('shows a marketplace error state when discovery fails', function run() {
      mockMarketplaceIsError = true
      render(<PremiumMarketplaceSmart />, { wrapper: createWrapper() })

      expect(screen.getByRole('alert')).toHaveTextContent(
        /unable to load/i,
      )
    })
  })
})
