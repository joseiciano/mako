import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  cancelPremiumSlot,
  fetchPremiumSlots,
  premiumSlotsQueryKey,
  publishPremiumSlot,
  usePremiumSlots,
  usePublishPremiumSlot,
  useCancelPremiumSlot,
} from './use-premium-availability'

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

describe('premium availability hooks', function suite() {
  describe('fetchPremiumSlots', function fetchSlotsSuite() {
    it('fetches slots with system_design filter', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(input: RequestInfo | URL): Promise<Response> {
        expect(input).toContain('/api/premium/interviewer/slots')
        expect(input).toContain('interviewType=system_design')
        return new Response(
          JSON.stringify({
            slots: [],
            pagination: { limit: 25, offset: 0, hasMore: false },
            policy: { leadTimeMinutes: 60, horizonDays: 90, priceCredits: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      })

      const result = await fetchPremiumSlots(fetchImpl as unknown as typeof fetch)

      expect(result.slots).toEqual([])
      expect(result.policy.leadTimeMinutes).toBe(60)
    })

    it('throws on non-ok response', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(
          JSON.stringify({ error: 'Unable to fetch.' }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        )
      })

      await expect(fetchPremiumSlots(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
        'Unable to fetch.',
      )
    })
  })

  describe('publishPremiumSlot', function publishSlotSuite() {
    it('sends exactly interviewType and startTime — no endTime, status, or interviewerId', async function run() {
      let capturedBody: string | undefined

      const fetchImpl = vi.fn(async function fetchImpl(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        capturedBody = init?.body as string
        return new Response(
          JSON.stringify({
            slot: {
              id: '11111111-1111-4111-8111-111111111111',
              interviewerId: '22222222-2222-4222-8222-222222222222',
              interviewType: 'system_design',
              startTime: '2026-08-08T10:00:00.000Z',
              endTime: '2026-08-08T11:00:00.000Z',
              status: 'available',
              createdAt: '2026-08-07T20:00:00.000Z',
              updatedAt: '2026-08-07T20:00:00.000Z',
            },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        )
      })

      await publishPremiumSlot(
        { interviewType: 'system_design', startTime: '2026-08-08T10:00:00.000Z' },
        fetchImpl as unknown as typeof fetch,
      )

      const parsed = JSON.parse(capturedBody as string)
      expect(parsed).toEqual({
        interviewType: 'system_design',
        startTime: '2026-08-08T10:00:00.000Z',
      })
      expect(parsed).not.toHaveProperty('endTime')
      expect(parsed).not.toHaveProperty('status')
      expect(parsed).not.toHaveProperty('interviewerId')
    })

    it('throws on conflict response', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(
          JSON.stringify({ error: 'The premium slot window conflicts with existing availability.' }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        )
      })

      await expect(
        publishPremiumSlot(
          { interviewType: 'system_design', startTime: '2026-08-08T10:00:00.000Z' },
          fetchImpl as unknown as typeof fetch,
        ),
      ).rejects.toThrow('The premium slot window conflicts with existing availability.')
    })
  })

  describe('cancelPremiumSlot', function cancelSlotSuite() {
    it('sends DELETE to the correct slot URL', async function run() {
      let capturedUrl: string | undefined

      const fetchImpl = vi.fn(async function fetchImpl(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        capturedUrl = input as string
        expect(init?.method).toBe('DELETE')
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      })

      const result = await cancelPremiumSlot('11111111-1111-4111-8111-111111111111', fetchImpl as unknown as typeof fetch)

      expect(result).toEqual({ success: true })
      expect(capturedUrl).toContain('/api/premium/interviewer/slots/11111111-1111-4111-8111-111111111111')
    })

    it('throws on error response', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(
          JSON.stringify({ error: 'A claimed premium slot cannot be cancelled.' }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        )
      })

      await expect(
        cancelPremiumSlot('11111111-1111-4111-8111-111111111111', fetchImpl as unknown as typeof fetch),
      ).rejects.toThrow('A claimed premium slot cannot be cancelled.')
    })
  })

  it('exports the premium slots query key', function run() {
    expect(premiumSlotsQueryKey).toEqual(['premium', 'interviewer-slots', 'system_design'])
  })

  describe('usePremiumSlots', function useSlotsSuite() {
    it('does not fetch when enabled is false', async function run() {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async function mockFetch() {
        return new Response(
          JSON.stringify({
            slots: [],
            pagination: { limit: 25, offset: 0, hasMore: false },
            policy: { leadTimeMinutes: 60, horizonDays: 90, priceCredits: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      })

      renderHook(() => usePremiumSlots({ enabled: false }), {
        wrapper: createWrapper(),
      })

      await new Promise(function resolve(r) {
        setTimeout(r, 50)
      })

      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })
  })

  describe('usePublishPremiumSlot', function usePublishSuite() {
    it('invalidates slots query key on success', async function run() {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async function mockFetch() {
        return new Response(
          JSON.stringify({
            slot: {
              id: '11111111-1111-4111-8111-111111111111',
              interviewerId: '22222222-2222-4222-8222-222222222222',
              interviewType: 'system_design',
              startTime: '2026-08-08T10:00:00.000Z',
              endTime: '2026-08-08T11:00:00.000Z',
              status: 'available',
              createdAt: '2026-08-07T20:00:00.000Z',
              updatedAt: '2026-08-07T20:00:00.000Z',
            },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        )
      })

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })

      function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      }

      const { result } = renderHook(() => usePublishPremiumSlot(), {
        wrapper: Wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      await result.current.mutateAsync({
        interviewType: 'system_design',
        startTime: '2026-08-08T10:00:00.000Z',
      })

      await waitFor(function () {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: premiumSlotsQueryKey })
      })
    })
  })

  describe('useCancelPremiumSlot', function useCancelSuite() {
    it('invalidates slots query key on success', async function run() {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async function mockFetch() {
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      })

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })

      function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      }

      const { result } = renderHook(() => useCancelPremiumSlot(), {
        wrapper: Wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      await result.current.mutateAsync('11111111-1111-4111-8111-111111111111')

      await waitFor(function () {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: premiumSlotsQueryKey })
      })
    })
  })
})
