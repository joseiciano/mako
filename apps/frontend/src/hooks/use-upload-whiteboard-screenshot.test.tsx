import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  uploadWhiteboardScreenshot,
  useUploadWhiteboardScreenshot,
} from './use-upload-whiteboard-screenshot'

const interviewId = '11111111-1111-4111-8111-111111111111'

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('uploadWhiteboardScreenshot', function () {
  beforeEach(function () {
    vi.stubEnv('VITE_AUTH_BASE_URL', 'https://api.test.local/api/auth')
  })

  afterEach(function () {
    vi.unstubAllEnvs()
  })

  it('sends the PNG body with idempotency and capture-timestamp headers', async function () {
    let capturedRequest: Request | undefined

    const fetchImpl = vi.fn(async function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
      capturedRequest = new Request(input, init)
      return new Response(JSON.stringify({ capture_id: '33333333-3333-4333-8333-333333333333' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const blob = new Blob(['png-bytes'], { type: 'image/png' })

    const result = await uploadWhiteboardScreenshot(
      {
        id: interviewId,
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
        captureTimestamp: '2026-06-20T09:30:00.000Z',
        blob,
      },
      fetchImpl as unknown as typeof fetch,
    )

    expect(result).toEqual({ capture_id: '33333333-3333-4333-8333-333333333333' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(capturedRequest?.url).toContain(`/interviews/${interviewId}/artifacts/screenshots`)
    expect(capturedRequest?.headers.get('content-type')).toBe('image/png')
    expect(capturedRequest?.headers.get('x-idempotency-key')).toBe(
      '22222222-2222-4222-8222-222222222222',
    )
    expect(capturedRequest?.headers.get('x-capture-timestamp')).toBe('2026-06-20T09:30:00.000Z')
  })

  it('throws a safe ApiError with the server message on failure', async function () {
    const fetchImpl = vi.fn(async function mockFetch() {
      return new Response(JSON.stringify({ error: 'Screenshot uploads are disabled for this interview.' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      })
    })

    await expect(
      uploadWhiteboardScreenshot(
        {
          id: interviewId,
          idempotencyKey: '22222222-2222-4222-8222-222222222222',
          captureTimestamp: '2026-06-20T09:30:00.000Z',
          blob: new Blob(['png-bytes'], { type: 'image/png' }),
        },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow('Screenshot uploads are disabled for this interview.')
  })
})

describe('useUploadWhiteboardScreenshot', function () {
  beforeEach(function () {
    vi.stubEnv('VITE_AUTH_BASE_URL', 'https://api.test.local/api/auth')
  })

  afterEach(function () {
    vi.unstubAllEnvs()
  })

  it('resolves with the capture id on success', async function () {
    vi.stubGlobal('fetch', async function successUpload() {
      return new Response(JSON.stringify({ capture_id: '33333333-3333-4333-8333-333333333333' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const queryClient = new QueryClient()
    const { result } = renderHook(() => useUploadWhiteboardScreenshot(), {
      wrapper: makeWrapper(queryClient),
    })

    const response = await result.current.mutateAsync({
      id: interviewId,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      captureTimestamp: '2026-06-20T09:30:00.000Z',
      blob: new Blob(['png-bytes'], { type: 'image/png' }),
    })

    expect(response).toEqual({ capture_id: '33333333-3333-4333-8333-333333333333' })
    await waitFor(function assertSucceeded() {
      expect(result.current.isSuccess).toBe(true)
    })
  })
})
