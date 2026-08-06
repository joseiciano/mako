import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCreateInterview, interviewsQueryRootKey } from './use-interviews'
import { accountQueryKey } from './use-account'

const accountFixture = {
  id: 'demo-user',
  email: 'demo@mako.dev',
  displayName: 'Demo Candidate',
  credits: 1,
  freeStandardInterviews: 1,
  freeAiInterviews: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const createPayload = {
  type: 'system_design' as const,
  mode: 'ai_led' as const,
  scheduled_at: 'now' as const,
}

const interviewResponse = {
  interview: {
    id: '11111111-1111-4111-8111-111111111111',
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-04-10T10:30:00.000Z',
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: '2026-04-01T10:00:00.000Z',
    updated_at: '2026-04-01T10:00:00.000Z',
  },
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useCreateInterview', function useCreateInterviewSuite() {
  afterEach(function resetEnvironment() {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('does not automatically retry failed create mutations', async function () {
    vi.stubEnv('VITE_AUTH_BASE_URL', 'https://api.test.local/api/auth')
    const queryClient = new QueryClient()
    const fetchMock = vi.fn(async function failCreate() {
      return new Response(
        JSON.stringify({ error: 'Unable to create interview.' }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useCreateInterview(), {
      wrapper: makeWrapper(queryClient),
    })

    act(function triggerCreate() {
      result.current.mutate(createPayload)
    })

    await waitFor(function assertFailed() {
      expect(result.current.isError).toBe(true)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates account and interview queries on create success', async function () {
    vi.stubEnv('VITE_AUTH_BASE_URL', 'https://api.test.local/api/auth')
    const queryClient = new QueryClient()
    queryClient.setQueryData(accountQueryKey, accountFixture)
    queryClient.setQueryData(interviewsQueryRootKey, [])

    vi.stubGlobal('fetch', async function successCreate() {
      return new Response(JSON.stringify(interviewResponse), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    })

    const { result } = renderHook(() => useCreateInterview(), {
      wrapper: makeWrapper(queryClient),
    })

    act(function triggerCreate() {
      result.current.mutate(createPayload)
    })

    await waitFor(function assertSucceeded() {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(queryClient.getQueryState(accountQueryKey)?.isInvalidated).toBe(true)
    expect(
      queryClient.getQueryState(interviewsQueryRootKey)?.isInvalidated,
    ).toBe(true)
  })
})
