import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  fetchTransactionHistory,
  transactionHistoryQueryKey,
  useTransactionHistory,
} from './use-transaction-history'
import { readHeader } from './test-utils/read-header'

const transactionHistoryFixture = {
  transactions: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      amount: 1500,
      credits_granted: 150,
      status: 'succeeded',
      created_at: '2026-06-24T12:00:00.000Z',
    },
    {
      id: '11111111-1111-4111-8111-111111111111',
      amount: 1000,
      credits_granted: 100,
      status: 'pending',
      created_at: '2026-06-22T12:00:00.000Z',
    },
  ],
  total: 2,
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

describe('use-transaction-history data layer', function useTransactionHistorySuite() {
  afterEach(function resetEnvironment() {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('exports stable transaction history query key', function run() {
    expect(transactionHistoryQueryKey).toEqual(['account', 'transactions'])
  })

  it('fetches transaction history with default limit and offset and parses the response', async function run() {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('VITE_AUTH_BASE_URL', 'https://api.test.local/api/auth')

    const result = await fetchTransactionHistory(
      async function mockFetch(input, init) {
        expect(String(input)).toBe(
          'https://api.test.local/api/account/transactions?limit=20&offset=0',
        )
        expect(init?.method).toBeUndefined()
        expect(init?.credentials).toBe('include')
        expect(readHeader(init?.headers, 'x-user-id')).toBe(
          '11111111-1111-4111-8111-111111111111',
        )

        return new Response(JSON.stringify(transactionHistoryFixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    )

    expect(result).toEqual(transactionHistoryFixture)
  })

  it('honors explicit limit and offset query parameters', async function run() {
    const result = await fetchTransactionHistory(
      async function mockFetch(input) {
        expect(String(input)).toBe('/api/account/transactions?limit=5&offset=10')
        return new Response(JSON.stringify(transactionHistoryFixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
      undefined,
      5,
      10,
    )

    expect(result.transactions).toHaveLength(2)
  })

  it('surfaces backend error message for failed history fetch', async function run() {
    await expect(
      fetchTransactionHistory(
        async function mockFetch() {
          return new Response(JSON.stringify({ error: 'Transactions unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          })
        },
      ),
    ).rejects.toThrow('Transactions unavailable')
  })

  it('rejects history payloads that diverge from shared schema', async function run() {
    await expect(
      fetchTransactionHistory(
        async function mockFetch() {
          return new Response(
            JSON.stringify({ transactions: [{ id: '' }], total: 1 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        },
      ),
    ).rejects.toThrow()
  })

  it('strips internal Stripe control-flow fields from parsed transactions', async function run() {
    const result = await fetchTransactionHistory(
      async function mockFetch() {
        return new Response(
          JSON.stringify({
            transactions: [
              {
                id: '33333333-3333-4333-8333-333333333333',
                stripe_payment_intent_id: 'pi_333',
                amount: 1500,
                credits_granted: 150,
                status: 'succeeded',
                created_at: '2026-06-24T12:00:00.000Z',
              },
            ],
            total: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    )

    expect(result.transactions[0]).not.toHaveProperty('stripe_payment_intent_id')
    expect(result.transactions[0]?.amount).toBe(1500)
  })

  it('forwards abort signal into fetch init', async function run() {
    const controller = new AbortController()
    const signal = controller.signal

    await fetchTransactionHistory(
      async function mockFetch(_input, init) {
        expect(init?.signal).toBe(signal)
        return new Response(JSON.stringify(transactionHistoryFixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
      signal,
    )
  })

  it('renders transaction history into query result for the consumer', async function run() {
    const queryClient = createTestQueryClient()
    vi.stubGlobal(
      'fetch',
      vi.fn(async function mockFetch() {
        return new Response(JSON.stringify(transactionHistoryFixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    const { result } = renderHook(() => useTransactionHistory(), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(function waitForData() {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(transactionHistoryFixture)
  })
})
