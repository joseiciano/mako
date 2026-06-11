import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  availabilityQueryRootKey,
  createAvailability,
  useCreateAvailability,
} from './use-availability'
import { readHeader } from './test-utils/read-header'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const requestFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  interview_type: 'system_design',
  max_matches: 2,
  current_matches: 0,
  status: 'active',
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
}

const slotFixture = {
  id: '33333333-3333-4333-8333-333333333333',
  request_id: '11111111-1111-4111-8111-111111111111',
  start_time: '2026-04-10T10:00:00.000Z',
  end_time: '2026-04-10T11:00:00.000Z',
  status: 'available',
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
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
    vi.restoreAllMocks()
  })

  it('exports stable root query key', function run() {
    expect(availabilityQueryRootKey).toEqual(['availability'])
  })

  it('submits availability via POST and parses the response', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://example.com/api/auth',
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
          'https://example.com/api/availability',
        )
        expect(init?.method).toBe('POST')
        expect(readHeader(init?.headers, 'content-type')).toBe(
          'application/json',
        )
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

        return new Response(
          JSON.stringify({
            request: requestFixture,
            slots: [slotFixture],
          }),
          {
            status: 201,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
    )

    expect(result.request.status).toBe('active')
    expect(result.slots).toHaveLength(1)
    expect(result.slots[0]?.status).toBe('available')
  })

  it('surfaces backend error message for failed submissions', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://example.com/api/auth',
    )

    await expect(
      createAvailability(
        {
          interview_type: 'coding',
          max_matches: 1,
          slots: [
            {
              start_time: '2026-04-10T10:00:00.000Z',
              end_time: '2026-04-10T11:00:00.000Z',
            },
          ],
        },
        async function mockFetch() {
          return new Response(
            JSON.stringify({ error: 'Invalid slot range' }),
            {
              status: 400,
              headers: {
                'content-type': 'application/json',
              },
            },
          )
        },
      ),
    ).rejects.toThrow('Invalid slot range')
  })

  it('falls back to a stable error message when payload omits error field', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://example.com/api/auth',
    )

    await expect(
      createAvailability(
        {
          interview_type: 'behavioral',
          max_matches: 1,
          slots: [
            {
              start_time: '2026-04-10T10:00:00.000Z',
              end_time: '2026-04-10T11:00:00.000Z',
            },
          ],
        },
        async function mockFetch() {
          return new Response(
            JSON.stringify({ message: 'Something went wrong' }),
            {
              status: 500,
              headers: {
                'content-type': 'application/json',
              },
            },
          )
        },
      ),
    ).rejects.toThrow('Unable to submit availability.')
  })

  it('rejects response payloads that diverge from shared schema contracts', async function run() {
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
          return new Response(
            JSON.stringify({
              request: {
                id: '11111111-1111-4111-8111-111111111111',
                user_id: '22222222-2222-4222-8222-222222222222',
                interview_type: 'system_design',
                max_matches: 1,
                current_matches: 0,
                status: 'active',
                created_at: '2026-04-01T10:00:00.000Z',
              },
              slots: [],
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          )
        },
      ),
    ).rejects.toThrow()
  })

  it('invalidates availability queries on mutation success', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://example.com/api/auth',
    )

    vi.stubGlobal(
      'fetch',
      vi.fn(async function fetchMock() {
        return new Response(
          JSON.stringify({
            request: requestFixture,
            slots: [slotFixture],
          }),
          {
            status: 201,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      }),
    )

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
      return result.current.isSuccess
    })

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: availabilityQueryRootKey,
    })
  })
})
