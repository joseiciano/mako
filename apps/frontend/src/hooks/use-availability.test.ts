import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  availabilityQueryRootKey,
  createAvailability,
  useCreateAvailability,
} from './use-availability'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    )
  }
}

describe('use-availability data layer', function useAvailabilitySuite() {
  afterEach(function resetEnvironment() {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('exports stable root query key', function run() {
    expect(availabilityQueryRootKey).toEqual(['availability'])
  })

  it('rejects valid payload with temporary unavailable message without calling fetch', async function run() {
    const fetchSpy = vi.fn()

    await expect(
      createAvailability(
        {
          interview_type: 'system_design',
          max_matches: 2,
          slots: [
            {
              start_time: '2026-04-10T10:00:00.000Z',
              end_time: '2026-04-10T11:00:00.000Z',
            },
          ],
        },
        fetchSpy,
      ),
    ).rejects.toThrow(
      'Peer-to-peer matching is temporarily unavailable. Your availability was not submitted.',
    )

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects invalid payload with schema error without calling fetch', async function run() {
    const fetchSpy = vi.fn()

    await expect(
      createAvailability(
        {
          interview_type: 'system_design',
          max_matches: 0,
          slots: [],
        } as unknown as Parameters<typeof createAvailability>[0],
        fetchSpy,
      ),
    ).rejects.toThrow()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps availability mutation in temporary unavailable error state without invalidating queries', async function run() {
    const queryClient = createTestQueryClient()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateAvailability(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate({
      interview_type: 'system_design',
      max_matches: 1,
      slots: [
        {
          start_time: '2026-04-10T10:00:00.000Z',
          end_time: '2026-04-10T11:00:00.000Z',
        },
      ],
    })

    await waitFor(function waitForMutation() {
      return result.current.isError
    })

    // Because createAvailability rejects immediately, invalidateQueries should not be called
    expect(invalidateQueriesSpy).not.toHaveBeenCalled()
  })
})
