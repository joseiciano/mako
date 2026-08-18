import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCancelInterview, interviewsQueryRootKey } from './use-interviews'
import { accountQueryKey } from './use-account'

const interviewId = '11111111-1111-4111-8111-111111111111'

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useCancelInterview', function useCancelInterviewSuite() {
  afterEach(function resetEnvironment() {
    vi.unstubAllEnvs()
  })

  it('invalidates interview and account queries on cancel success', async function () {
    vi.stubEnv('VITE_AUTH_BASE_URL', 'https://api.test.local/api/auth')
    const queryClient = new QueryClient()
    queryClient.setQueryData(accountQueryKey, { id: 'demo-user' })
    queryClient.setQueryData(interviewsQueryRootKey, [])

    vi.stubGlobal('fetch', async function successCancel() {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const { result } = renderHook(() => useCancelInterview(), {
      wrapper: makeWrapper(queryClient),
    })

    act(function triggerCancel() {
      result.current.mutate({ id: interviewId })
    })

    await waitFor(function assertSucceeded() {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(
      queryClient.getQueryState(interviewsQueryRootKey)?.isInvalidated,
    ).toBe(true)
    expect(queryClient.getQueryState(accountQueryKey)?.isInvalidated).toBe(true)
  })
})
