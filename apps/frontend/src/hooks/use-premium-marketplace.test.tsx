import type { PremiumMarketplaceSlot } from '@mako/shared'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  claimPremiumSlot,
  fetchPremiumMarketplace,
  premiumMarketplaceQueryKey,
  sortMarketplaceSlots,
  useClaimPremiumSlot,
  usePremiumMarketplace,
} from './use-premium-marketplace'
import { accountQueryKey } from './use-account'
import { interviewsQueryRootKey } from './use-interviews'
import { readHeader } from './test-utils/read-header'

const slotFixture: PremiumMarketplaceSlot = {
  slotId: '11111111-1111-4111-8111-111111111111',
  interviewType: 'system_design' as const,
  startTime: '2026-08-08T10:00:00.000Z',
  endTime: '2026-08-08T11:00:00.000Z',
  interviewer: {
    displayName: 'Interviewer-Red',
    image: 'https://example.com/avatar.png',
    isVerified: true,
  },
}

const marketplaceFixture = {
  slots: [slotFixture],
  pagination: { limit: 25, offset: 0, hasMore: false },
  policy: { leadTimeMinutes: 60, horizonDays: 90, priceCredits: 1 },
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('premium marketplace hooks', function suite() {
  describe('fetchPremiumMarketplace', function fetchMarketplaceSuite() {
    it('fetches only system_design inventory from the discovery route', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(input: RequestInfo | URL): Promise<Response> {
        expect(input).toContain('/api/premium/marketplace')
        expect(input).toContain('interviewType=system_design')
        return new Response(
          JSON.stringify(marketplaceFixture),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      })

      const result = await fetchPremiumMarketplace(fetchImpl as unknown as typeof fetch)

      expect(result.slots).toHaveLength(1)
      expect(result.slots[0]?.interviewer.displayName).toBe('Interviewer-Red')
      expect(result.slots[0]?.interviewer.isVerified).toBe(true)
      expect(result.policy.priceCredits).toBe(1)
    })

    it('throws on non-ok response', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(
          JSON.stringify({ error: 'Unable to fetch marketplace.' }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        )
      })

      await expect(fetchPremiumMarketplace(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
        'Unable to fetch marketplace.',
      )
    })
  })

  describe('claimPremiumSlot', function claimSlotSuite() {
    it('POSTs to the claim route with a UUID Idempotency-Key header and no body', async function run() {
      let capturedUrl: string | undefined
      let capturedInit: RequestInit | undefined

      const fetchImpl = vi.fn(async function fetchImpl(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        capturedUrl = input as string
        capturedInit = init
        return new Response(
          JSON.stringify(claimResponseFixture),
          { status: 201, headers: { 'content-type': 'application/json' } },
        )
      })

      const result = await claimPremiumSlot(
        { slotId, idempotencyKey },
        fetchImpl as unknown as typeof fetch,
      )

      expect(capturedUrl).toContain(`/api/premium/marketplace/slots/${slotId}/claim`)
      expect(capturedInit?.method).toBe('POST')
      expect(readHeader(capturedInit?.headers, 'Idempotency-Key')).toBe(idempotencyKey)
      expect(capturedInit?.body).toBeUndefined()
      expect(result.interview.id).toBe('44444444-4444-4444-8444-444444444444')
      expect(result.interview.booking_channel).toBe('verified_interviewer')
    })

    it('preserves the exact 409 PREMIUM_SLOT_ALREADY_CLAIMED literal', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(
          JSON.stringify({ error: 'PREMIUM_SLOT_ALREADY_CLAIMED' }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        )
      })

      await expect(
        claimPremiumSlot({ slotId, idempotencyKey }, fetchImpl as unknown as typeof fetch),
      ).rejects.toThrow('PREMIUM_SLOT_ALREADY_CLAIMED')
    })

    it('preserves the exact 409 INSUFFICIENT_CREDITS literal', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(
          JSON.stringify({ error: 'INSUFFICIENT_CREDITS' }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        )
      })

      await expect(
        claimPremiumSlot({ slotId, idempotencyKey }, fetchImpl as unknown as typeof fetch),
      ).rejects.toThrow('INSUFFICIENT_CREDITS')
    })

    it('preserves the exact 409 IDEMPOTENCY_KEY_CONFLICT literal', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(
          JSON.stringify({ error: 'IDEMPOTENCY_KEY_CONFLICT' }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        )
      })

      await expect(
        claimPremiumSlot({ slotId, idempotencyKey }, fetchImpl as unknown as typeof fetch),
      ).rejects.toThrow('IDEMPOTENCY_KEY_CONFLICT')
    })

    it('rejects a non-UUID idempotency key before sending the request', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(JSON.stringify(claimResponseFixture), { status: 201 })
      })

      await expect(
        claimPremiumSlot({ slotId, idempotencyKey: 'not-a-uuid' }, fetchImpl as unknown as typeof fetch),
      ).rejects.toThrow('Idempotency-Key must be a valid UUID.')

      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('accepts a syntactically valid UUID idempotency key with a version nibble beyond 1-5 and sends the request', async function run() {
      const versionSixUuid = '77777777-7777-6777-8777-777777777777'
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(
          JSON.stringify(claimResponseFixture),
          { status: 201, headers: { 'content-type': 'application/json' } },
        )
      })

      const result = await claimPremiumSlot(
        { slotId, idempotencyKey: versionSixUuid },
        fetchImpl as unknown as typeof fetch,
      )

      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(result.interview.id).toBe('44444444-4444-4444-8444-444444444444')
    })
  })

  describe('sortMarketplaceSlots', function sortSlotsSuite() {
    it('orders deterministically by startTime then slotId without mutating the input', function run() {
      const laterSlot = { ...slotFixture, slotId: '22222222-2222-4222-8222-222222222222', startTime: '2026-08-09T10:00:00.000Z' }
      const sameTimeSlotA = { ...slotFixture, slotId: '33333333-3333-4333-8333-333333333333', startTime: '2026-08-08T12:00:00.000Z' }
      const sameTimeSlotB = { ...slotFixture, slotId: '44444444-4444-4444-8444-444444444444', startTime: '2026-08-08T12:00:00.000Z' }

      const input = [laterSlot, sameTimeSlotB, sameTimeSlotA, slotFixture]
      const originalOrder = [...input]

      const sorted = sortMarketplaceSlots(input)

      expect(input).toEqual(originalOrder)
      expect(sorted.map(function id(slot) { return slot.slotId })).toEqual([
        slotFixture.slotId,
        sameTimeSlotA.slotId,
        sameTimeSlotB.slotId,
        laterSlot.slotId,
      ])
      expect(sorted).not.toBe(input)
    })

    it('returns an empty array for empty input', function run() {
      expect(sortMarketplaceSlots([])).toEqual([])
    })
  })

  it('exports the premium marketplace query key scoped to system_design', function run() {
    expect(premiumMarketplaceQueryKey).toEqual(['premium', 'marketplace', 'system_design'])
  })

  describe('usePremiumMarketplace', function useMarketplaceSuite() {
    it('requests only system_design inventory', async function run() {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async function mockFetch(
        input: RequestInfo | URL,
      ): Promise<Response> {
        expect(String(input)).toContain('/api/premium/marketplace')
        expect(String(input)).toContain('interviewType=system_design')
        return new Response(
          JSON.stringify(marketplaceFixture),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      })

      const { result } = renderHook(() => usePremiumMarketplace(), {
        wrapper: createWrapper(),
      })

      await waitFor(function assertLoaded() {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.slots).toHaveLength(1)
      fetchSpy.mockRestore()
    })
  })

  describe('useClaimPremiumSlot', function useClaimSuite() {
    it('invalidates marketplace, interviews, and account query keys on success', async function run() {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async function mockFetch(): Promise<Response> {
        return new Response(
          JSON.stringify(claimResponseFixture),
          { status: 201, headers: { 'content-type': 'application/json' } },
        )
      })

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })
      queryClient.setQueryData(premiumMarketplaceQueryKey, marketplaceFixture)
      queryClient.setQueryData(interviewsQueryRootKey, [])
      queryClient.setQueryData(accountQueryKey, { id: 'demo-user', credits: 1 })

      function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      }

      const { result } = renderHook(() => useClaimPremiumSlot(), {
        wrapper: Wrapper,
      })

      await result.current.mutateAsync({ slotId, idempotencyKey })

      await waitFor(function assertSucceeded() {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(queryClient.getQueryState(premiumMarketplaceQueryKey)?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(interviewsQueryRootKey)?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(accountQueryKey)?.isInvalidated).toBe(true)
    })

    it('treats a 200 replay response as success', async function run() {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async function mockFetch(): Promise<Response> {
        return new Response(
          JSON.stringify(claimResponseFixture),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      })

      const { result } = renderHook(() => useClaimPremiumSlot(), {
        wrapper: createWrapper(),
      })

      await result.current.mutateAsync({ slotId, idempotencyKey })

      await waitFor(function assertSucceeded() {
        expect(result.current.isSuccess).toBe(true)
      })
    })
  })
})
