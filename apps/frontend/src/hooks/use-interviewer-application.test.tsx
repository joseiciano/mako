import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ApiError } from '../lib/http-transport'
import {
  fetchInterviewerStatus,
  interviewerStatusQueryKey,
  submitInterviewerApplication,
  useSubmitInterviewerApplication,
} from './use-interviewer-application'

const applicationId = '33333333-3333-4333-8333-333333333333'
const recordA = '11111111-1111-4111-8111-111111111111'
const recordB = '22222222-2222-4222-8222-222222222222'

const application = {
  applicationId,
  email: 'me@example.com',
  employmentHistory: [
    { sourceCompanyId: recordA, company: 'Acme', role: 'Engineer', start: '2020-01-01', end: null },
  ],
  status: 'pending',
  createdAt: '2026-08-07T20:00:00.000Z',
  updatedAt: '2026-08-07T20:00:00.000Z',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

describe('interviewer application transport', function suite() {
  it('keeps status data under a key separate from employment profile data', function run() {
    expect(interviewerStatusQueryKey).toEqual(['interviewer', 'status'])
    expect(interviewerStatusQueryKey[0]).not.toBe('account')
  })

  it('fetches status and returns null when no application exists', async function run() {
    const fetchImpl = vi.fn(async function impl(_url: RequestInfo | URL) {
      return jsonResponse({ application: null })
    })
    const result = await fetchInterviewerStatus(fetchImpl as unknown as typeof fetch)
    expect(result).toBeNull()
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/interviewer/status')
  })

  it('throws on a failed status request', async function run() {
    const fetchImpl = vi.fn(async function impl() {
      return jsonResponse({ error: 'Nope' }, 500)
    })
    await expect(fetchInterviewerStatus(fetchImpl as unknown as typeof fetch)).rejects.toThrow('Nope')
  })

  it('submits only email and ordered employmentRecordIds', async function run() {
    let body: string | undefined
    const fetchImpl = vi.fn(async function impl(_url: RequestInfo | URL, init?: RequestInit) {
      body = init?.body as string
      return jsonResponse({ application }, 201)
    })

    const result = await submitInterviewerApplication(
      { email: 'me@example.com', employmentRecordIds: [recordB, recordA] },
      fetchImpl as unknown as typeof fetch,
    )

    expect(JSON.parse(body as string)).toEqual({
      email: 'me@example.com',
      employmentRecordIds: [recordB, recordA],
    })
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/interviewer/apply')
    expect(fetchImpl.mock.calls[0][1]?.method).toBe('POST')
    expect(result.application.status).toBe('pending')
  })

  it('rejects invalid input before sending a request', async function run() {
    const fetchImpl = vi.fn()
    await expect(
      submitInterviewerApplication(
        { email: 'me@example.com', employmentRecordIds: [] },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws ApiError carrying the status on 409', async function run() {
    const fetchImpl = vi.fn(async function impl() {
      return jsonResponse({ error: 'Application already exists' }, 409)
    })
    const error = await submitInterviewerApplication(
      { email: 'me@example.com', employmentRecordIds: [recordA] },
      fetchImpl as unknown as typeof fetch,
    ).catch(function caught(e) {
      return e
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
  })
})

describe('useSubmitInterviewerApplication', function hookSuite() {
  it('writes the returned application into the status query cache', async function run() {
    const queryClient = createClient()
    vi.stubGlobal(
      'fetch',
      vi.fn(async function impl() {
        return jsonResponse({ application }, 201)
      }),
    )
    const wrapper = function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(function hook() {
      return useSubmitInterviewerApplication()
    }, { wrapper })

    result.current.mutate({ email: 'me@example.com', employmentRecordIds: [recordA] })

    await waitFor(function check() {
      expect(queryClient.getQueryData(interviewerStatusQueryKey)).toEqual(application)
    })
    vi.unstubAllGlobals()
  })
})
