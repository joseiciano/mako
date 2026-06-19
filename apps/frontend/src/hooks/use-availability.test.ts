import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  availabilityQueryRootKey,
  createAvailability,
  useCreateAvailability,
} from './use-availability'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { readHeader } from './test-utils/read-header'

const availabilityResponseFixture = {
  request: {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    interview_type: 'system_design',
    max_matches: 2,
    current_matches: 0,
    status: 'active',
    created_at: '2026-04-10T09:00:00.000Z',
    updated_at: '2026-04-10T09:00:00.000Z',
  },
  slots: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      request_id: '11111111-1111-4111-8111-111111111111',
      start_time: '2026-04-10T10:00:00.000Z',
      end_time: '2026-04-10T11:00:00.000Z',
      status: 'available',
      created_at: '2026-04-10T09:00:00.000Z',
      updated_at: '2026-04-10T09:00:00.000Z',
    },
  ],
}

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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('exports stable root query key', function run() {
    expect(availabilityQueryRootKey).toEqual(['availability'])
  })

  it('submits contract-shaped availability payload via POST and parses response', async function run() {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await createAvailability(
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
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/availability',
        )
        expect(init?.method).toBe('POST')
        expect(readHeader(init?.headers, 'content-type')).toBe('application/json')
        expect(readHeader(init?.headers, 'x-user-id')).toBe(
          '11111111-1111-4111-8111-111111111111',
        )

        const body = JSON.parse((init?.body as string) ?? '{}')
        expect(body).toEqual({
          interview_type: 'system_design',
          max_matches: 2,
          slots: [
            {
              start_time: '2026-04-10T10:00:00.000Z',
              end_time: '2026-04-10T11:00:00.000Z',
            },
          ],
        })
        expect(body).not.toHaveProperty('tier')
        expect(body).not.toHaveProperty('interviewer_id')

        return new Response(JSON.stringify(availabilityResponseFixture), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      },
    )

    expect(result).toEqual(availabilityResponseFixture)
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

  it('rejects client-selected tier before calling fetch', async function run() {
    const fetchSpy = vi.fn()

    await expect(
      createAvailability(
        {
          interview_type: 'system_design',
          max_matches: 1,
          tier: 'premium',
          slots: [
            {
              start_time: '2026-04-10T10:00:00.000Z',
              end_time: '2026-04-10T11:00:00.000Z',
            },
          ],
        } as unknown as Parameters<typeof createAvailability>[0],
        fetchSpy,
      ),
    ).rejects.toThrow()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('surfaces backend error message for failed availability requests', async function run() {
    await expect(
      createAvailability(
        {
          interview_type: 'system_design',
          max_matches: 1,
          slots: [
            {
              start_time: '2026-04-10T10:00:00.000Z',
              end_time: '2026-04-10T11:00:00.000Z',
            },
          ],
        },
        async function mockFetch() {
          return new Response(JSON.stringify({ error: 'Matcher queue unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          })
        },
      ),
    ).rejects.toThrow('Matcher queue unavailable')
  })

  it('rejects availability response payloads that diverge from shared schema', async function run() {
    await expect(
      createAvailability(
        {
          interview_type: 'system_design',
          max_matches: 1,
          slots: [
            {
              start_time: '2026-04-10T10:00:00.000Z',
              end_time: '2026-04-10T11:00:00.000Z',
            },
          ],
        },
        async function mockFetch() {
          return new Response(JSON.stringify({ interview: null }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        },
      ),
    ).rejects.toThrow()
  })

  it('keeps availability mutation in success state after accepted submission', async function run() {
    const queryClient = createTestQueryClient()
    vi.stubGlobal(
      'fetch',
      vi.fn(async function mockFetch() {
        return new Response(JSON.stringify(availabilityResponseFixture), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

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
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(availabilityResponseFixture)
  })
})
