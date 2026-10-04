import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/http-transport'
import {
  fetchInterviewerStatus,
  interviewerStatusQueryKey,
  submitInterviewerApplication,
  useSubmitInterviewerApplication,
} from './use-interviewer-application'

const idA = '11111111-1111-4111-8111-111111111111'
const idB = '22222222-2222-4222-8222-222222222222'

const application = {
  applicationId: '33333333-3333-4333-8333-333333333333',
  email: 'me@example.com',
  employmentHistory: [
    { sourceCompanyId: idA, company: 'acme', role: 'Engineer', start: '2020-01-01', end: null },
  ],
  status: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('submitInterviewerApplication', function suite() {
  it('sends only email and ordered employmentRecordIds', async function run() {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ application }, 201))

    const result = await submitInterviewerApplication(
      {
        email: 'me@example.com',
        employmentRecordIds: [idB, idA],
        company: 'evil',
      } as never,
      fetchMock as unknown as typeof fetch,
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/interviewer/apply')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'me@example.com',
      employmentRecordIds: [idB, idA],
    })
    expect(result.applicationId).toBe(application.applicationId)
  })

  it('throws an ApiError carrying the status on 409', async function run() {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'Already applied' }, 409))

    await expect(
      submitInterviewerApplication(
        { email: 'me@example.com', employmentRecordIds: [idA] },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ message: 'Already applied', status: 409 })
  })
})

describe('fetchInterviewerStatus', function suite() {
  it('returns null when no application exists', async function run() {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ application: null }))
    expect(await fetchInterviewerStatus(fetchMock as unknown as typeof fetch)).toBeNull()
  })

  it('returns the application snapshot', async function run() {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ application }))
    const result = await fetchInterviewerStatus(fetchMock as unknown as typeof fetch)
    expect(result?.employmentHistory).toHaveLength(1)
  })

  it('throws ApiError on failure', async function run() {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 500))
    await expect(fetchInterviewerStatus(fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('useSubmitInterviewerApplication', function suite() {
  it('writes the returned application into the status cache', async function run() {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ application }, 201)))
    const queryClient = new QueryClient()
    function wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children)
    }

    const { result } = renderHook(() => useSubmitInterviewerApplication(), { wrapper })
    result.current.mutate({ email: 'me@example.com', employmentRecordIds: [idA] })

    await waitFor(function cached() {
      expect(queryClient.getQueryData(interviewerStatusQueryKey)).toMatchObject({
        applicationId: application.applicationId,
      })
    })
    vi.unstubAllGlobals()
  })
})
