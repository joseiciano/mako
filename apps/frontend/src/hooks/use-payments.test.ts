import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  createPaymentIntent,
  creditPackagesQueryKey,
  fetchCreditPackages,
  useCreatePaymentIntent,
  useCreditPackages,
} from './use-payments'
import { readHeader } from './test-utils/read-header'

const packagesResponseFixture = {
  packages: [
    {
      package_id: 'credits_5',
      display_name: '5 Credits',
      amount_cents: 2500,
      credits_granted: 5,
    },
    {
      package_id: 'credits_10',
      display_name: '10 Credits',
      amount_cents: 4500,
      credits_granted: 10,
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
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('use-payments data layer', function usePaymentsSuite() {
  afterEach(function resetEnvironment() {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('exports stable packages query key', function run() {
    expect(creditPackagesQueryKey).toEqual(['payments', 'packages'])
  })

  it('fetches credit packages via GET and parses the response wrapper', async function run() {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('VITE_AUTH_BASE_URL', 'https://api.test.local/api/auth')

    const result = await fetchCreditPackages(
      async function mockFetch(input, init) {
        expect(input).toBe('https://api.test.local/api/payments/packages')
        expect(init?.method).toBeUndefined()
        expect(readHeader(init?.headers, 'x-user-id')).toBe(
          '11111111-1111-4111-8111-111111111111',
        )

        return new Response(JSON.stringify(packagesResponseFixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    )

    expect(result).toEqual(packagesResponseFixture)
  })

  it('surfaces backend error message for failed package fetch', async function run() {
    await expect(
      fetchCreditPackages(
        async function mockFetch() {
          return new Response(JSON.stringify({ error: 'Payments are unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          })
        },
      ),
    ).rejects.toThrow('Payments are unavailable')
  })

  it('rejects package payloads that diverge from shared schema', async function run() {
    await expect(
      fetchCreditPackages(
        async function mockFetch() {
          return new Response(
            JSON.stringify({ packages: [{ package_id: '' }] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        },
      ),
    ).rejects.toThrow()
  })

  it('submits selected package_id via POST create-intent and parses client_secret', async function run() {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('VITE_AUTH_BASE_URL', 'https://api.test.local/api/auth')

    const result = await createPaymentIntent(
      { package_id: 'credits_10' },
      async function mockFetch(input, init) {
        expect(input).toBe('https://api.test.local/api/payments/create-intent')
        expect(init?.method).toBe('POST')
        expect(readHeader(init?.headers, 'content-type')).toBe('application/json')
        expect(readHeader(init?.headers, 'x-user-id')).toBe(
          '11111111-1111-4111-8111-111111111111',
        )

        const body = JSON.parse((init?.body as string) ?? '{}')
        expect(body).toEqual({ package_id: 'credits_10' })
        expect(body).not.toHaveProperty('amount')
        expect(body).not.toHaveProperty('credits_granted')

        return new Response(JSON.stringify({ client_secret: 'pi_123_secret' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    )

    expect(result).toEqual({ client_secret: 'pi_123_secret' })
  })

  it('does not send payment amounts derived client-side', async function run() {
    const fetchSpy = vi.fn(async function mockFetch() {
      return new Response(JSON.stringify({ client_secret: 'pi_secret' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    await createPaymentIntent({ package_id: 'credits_5' }, fetchSpy)

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      RequestInfo | URL,
      RequestInit,
    ]
    const body = JSON.parse((init.body as string) ?? '{}')
    expect(body).toEqual({ package_id: 'credits_5' })
    expect(String(url)).toContain('/api/payments/create-intent')
  })

  it('rejects missing package_id before calling fetch', async function run() {
    const fetchSpy = vi.fn()

    await expect(
      createPaymentIntent(
        { package_id: '' },
        fetchSpy,
      ),
    ).rejects.toThrow()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('surfaces backend error message for failed create-intent requests', async function run() {
    await expect(
      createPaymentIntent(
        { package_id: 'unknown' },
        async function mockFetch() {
          return new Response(JSON.stringify({ error: 'Unknown credit package.' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        },
      ),
    ).rejects.toThrow('Unknown credit package.')
  })

  it('keeps create-intent mutation in success state after accepted submission', async function run() {
    const queryClient = createTestQueryClient()
    vi.stubGlobal(
      'fetch',
      vi.fn(async function mockFetch() {
        return new Response(JSON.stringify({ client_secret: 'pi_ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    const { result } = renderHook(() => useCreatePaymentIntent(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate({ package_id: 'credits_10' })

    await waitFor(function waitForMutation() {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual({ client_secret: 'pi_ok' })
  })

  it('renders packages into query result for the consumer', async function run() {
    const queryClient = createTestQueryClient()
    vi.stubGlobal(
      'fetch',
      vi.fn(async function mockFetch() {
        return new Response(JSON.stringify(packagesResponseFixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    const { result } = renderHook(() => useCreditPackages(), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(function waitForData() {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(packagesResponseFixture)
  })
})
