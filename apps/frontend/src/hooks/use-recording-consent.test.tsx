import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RECORDING_CONSENT_COPY_VERSION,
  revokeRecordingConsent,
  setRecordingConsent,
  useRevokeRecordingConsent,
  useSetRecordingConsent,
} from './use-recording-consent'
import * as ConsentModule from './use-recording-consent'
import { interviewDetailQueryKey } from './use-interviews'
import { readHeader } from './test-utils/read-header'

const interviewId = '11111111-1111-4111-8111-111111111111'
const otherInterviewId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'

const consentCopyVersion = 'consent-copy-v1'

function makeRecordingConsentResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    interview_id: interviewId,
    user_id: userId,
    decision: 'consented' as const,
    consent_copy_version: consentCopyVersion,
    recording_status: 'not_started' as const,
    revoked_at: null,
    ...overrides,
  }
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function resolveErrorMapper(): (error: unknown) => string {
  const mod = ConsentModule as Record<string, unknown>
  const candidates = [
    'getRecordingConsentErrorMessage',
    'getConsentErrorMessage',
    'mapRecordingConsentError',
    'toRecordingConsentErrorMessage',
    'recordingConsentErrorMessage',
    'safeRecordingConsentErrorMessage',
  ]
  for (const name of candidates) {
    const fn = mod[name]
    if (typeof fn === 'function') return fn as (error: unknown) => string
  }
  throw new Error(
    'No safe recording consent error mapper found. Expected one of: ' + candidates.join(', '),
  )
}

describe('use-recording-consent', function useRecordingConsentSuite() {
  afterEach(function resetEnvironment() {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('RECORDING_CONSENT_COPY_VERSION', function constantSuite() {
    it('exports the current consent copy version as consent-copy-v1', function run() {
      expect(RECORDING_CONSENT_COPY_VERSION).toBe('consent-copy-v1')
    })
  })

  describe('setRecordingConsent', function setSuite() {
    it('POSTs decision and consent_copy_version as JSON with credentials include to the consent route', async function run() {
      let capturedUrl: string | undefined
      let capturedInit: RequestInit | undefined

      const fetchImpl = vi.fn(async function fetchImpl(
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> {
        capturedUrl = String(input)
        capturedInit = init
        return new Response(JSON.stringify(makeRecordingConsentResponse()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

      const result = await setRecordingConsent(
        { id: interviewId, decision: 'consented', consent_copy_version: consentCopyVersion },
        fetchImpl as unknown as typeof fetch,
      )

      expect(capturedUrl).toContain(`/api/interviews/${interviewId}/recording-consent`)
      expect(capturedInit?.method).toBe('POST')
      expect(capturedInit?.credentials).toBe('include')
      expect(readHeader(capturedInit?.headers, 'content-type')).toBe('application/json')
      const body = JSON.parse(String(capturedInit?.body))
      expect(body).toEqual({ decision: 'consented', consent_copy_version: consentCopyVersion })
      expect(result.interview_id).toBe(interviewId)
      expect(result.decision).toBe('consented')
      expect(result.consent_copy_version).toBe(consentCopyVersion)
    })

    it('sends declined decision with copy version intact', async function run() {
      let capturedBody: string | undefined
      const fetchImpl = vi.fn(async function fetchImpl(
        _input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> {
        capturedBody = String(init?.body)
        return new Response(
          JSON.stringify(
            makeRecordingConsentResponse({ decision: 'declined', consent_copy_version: consentCopyVersion }),
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      })

      const result = await setRecordingConsent(
        { id: interviewId, decision: 'declined', consent_copy_version: consentCopyVersion },
        fetchImpl as unknown as typeof fetch,
      )

      expect(JSON.parse(capturedBody ?? '{}')).toEqual({
        decision: 'declined',
        consent_copy_version: consentCopyVersion,
      })
      expect(result.decision).toBe('declined')
    })

    it('parses and validates RecordingConsentResponse schema on success', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(JSON.stringify(makeRecordingConsentResponse({ recording_status: 'not_started' })), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

      const result = await setRecordingConsent(
        { id: interviewId, decision: 'consented', consent_copy_version: consentCopyVersion },
        fetchImpl as unknown as typeof fetch,
      )

      expect(result.recording_status).toBe('not_started')
      expect(result.revoked_at).toBeNull()
    })

    it('rejects payloads that diverge from RecordingConsentResponse schema', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(JSON.stringify({ interview_id: 'not-a-uuid', decision: 'consented' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

      await expect(
        setRecordingConsent(
          { id: interviewId, decision: 'consented', consent_copy_version: consentCopyVersion },
          fetchImpl as unknown as typeof fetch,
        ),
      ).rejects.toThrow()
    })

    it('surfaces participant-safe fallback for non-ok POST without leaking raw payload details', async function run() {
      const rawPayload = { error: 'RealtimeKit provider failed: SELECT * FROM interview_recording_consents\nstack at provider.ts:123' }
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(JSON.stringify(rawPayload), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      })

      const error = await setRecordingConsent(
        { id: interviewId, decision: 'consented', consent_copy_version: consentCopyVersion },
        fetchImpl as unknown as typeof fetch,
      ).catch(function getError(e) { return e as Error })

      expect(error).toBeInstanceOf(Error)
      const message = (error as Error).message
      expect(message).not.toContain('RealtimeKit')
      expect(message).not.toContain('SELECT')
      expect(message).not.toContain('\n')
      expect(message.length).toBeGreaterThan(0)
      expect(message.length).toBeLessThan(200)
    })

    it('caps long or multiline backend error messages to a safe fallback', async function run() {
      const longError = 'a'.repeat(300)
      const multilineError = 'internal failure\nstack trace\n at foo'
      for (const payloadError of [longError, multilineError]) {
        const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
          return new Response(JSON.stringify({ error: payloadError }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          })
        })
        const error = await setRecordingConsent(
          { id: interviewId, decision: 'consented', consent_copy_version: consentCopyVersion },
          fetchImpl as unknown as typeof fetch,
        ).catch(function getError(e) { return e as Error })
        const message = (error as Error).message
        expect(message).not.toContain('\n')
        expect(message.length).toBeLessThan(200)
        expect(message).not.toBe(payloadError)
      }
    })

    it('rejects invalid UUID before sending the request', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(JSON.stringify(makeRecordingConsentResponse()), { status: 200 })
      })

      await expect(
        setRecordingConsent(
          { id: 'not-a-uuid', decision: 'consented', consent_copy_version: consentCopyVersion },
          fetchImpl as unknown as typeof fetch,
        ),
      ).rejects.toThrow()

      expect(fetchImpl).not.toHaveBeenCalled()
    })
  })

  describe('revokeRecordingConsent', function revokeSuite() {
    it('DELETEs the consent route with credentials include and no body', async function run() {
      let capturedUrl: string | undefined
      let capturedInit: RequestInit | undefined

      const fetchImpl = vi.fn(async function fetchImpl(
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> {
        capturedUrl = String(input)
        capturedInit = init
        return new Response(
          JSON.stringify(
            makeRecordingConsentResponse({
              decision: 'consented',
              revoked_at: '2026-04-13T10:00:00.000Z',
            }),
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      })

      const result = await revokeRecordingConsent({ id: interviewId }, fetchImpl as unknown as typeof fetch)

      expect(capturedUrl).toContain(`/api/interviews/${interviewId}/recording-consent`)
      expect(capturedInit?.method).toBe('DELETE')
      expect(capturedInit?.credentials).toBe('include')
      expect(capturedInit?.body).toBeUndefined()
      expect(result.revoked_at).toBe('2026-04-13T10:00:00.000Z')
    })

    it('parses RecordingConsentResponse schema on revoke success', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(JSON.stringify(makeRecordingConsentResponse({ revoked_at: '2026-04-13T10:00:00.000Z' })), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

      const result = await revokeRecordingConsent({ id: interviewId }, fetchImpl as unknown as typeof fetch)
      expect(result.interview_id).toBe(interviewId)
      expect(result.revoked_at).toBe('2026-04-13T10:00:00.000Z')
    })

    it('rejects revoke payloads that diverge from schema', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(JSON.stringify({ bogus: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

      await expect(revokeRecordingConsent({ id: interviewId }, fetchImpl as unknown as typeof fetch)).rejects.toThrow()
    })

    it('surfaces participant-safe fallback for failed DELETE without leaking internal details', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(JSON.stringify({ error: 'provider internal: R2 storage failure\nstack' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      })

      const error = await revokeRecordingConsent({ id: interviewId }, fetchImpl as unknown as typeof fetch).catch(
        function getError(e) { return e as Error },
      )

      expect((error as Error).message).not.toContain('R2')
      expect((error as Error).message).not.toContain('\n')
      expect((error as Error).message.length).toBeGreaterThan(0)
    })

    it('rejects invalid UUID for revoke before sending request', async function run() {
      const fetchImpl = vi.fn(async function fetchImpl(): Promise<Response> {
        return new Response(JSON.stringify(makeRecordingConsentResponse()), { status: 200 })
      })

      await expect(
        revokeRecordingConsent({ id: 'not-a-uuid' }, fetchImpl as unknown as typeof fetch),
      ).rejects.toThrow()

      expect(fetchImpl).not.toHaveBeenCalled()
    })
  })

  describe('useSetRecordingConsent', function useSetSuite() {
    it('invalidates the targeted interviewDetail query on success', async function run() {
      const queryClient = new QueryClient()
      queryClient.setQueryData(interviewDetailQueryKey(interviewId), { id: interviewId })
      queryClient.setQueryData(interviewDetailQueryKey(otherInterviewId), { id: otherInterviewId })

      vi.stubGlobal(
        'fetch',
        vi.fn(async function successFetch(): Promise<Response> {
          return new Response(JSON.stringify(makeRecordingConsentResponse()), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }),
      )

      const { result } = renderHook(() => useSetRecordingConsent(), {
        wrapper: makeWrapper(queryClient),
      })

      act(function triggerSet() {
        result.current.mutate({ id: interviewId, decision: 'consented', consent_copy_version: consentCopyVersion })
      })

      await waitFor(function assertSucceeded() {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(queryClient.getQueryState(interviewDetailQueryKey(interviewId))?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(interviewDetailQueryKey(otherInterviewId))?.isInvalidated).not.toBe(true)
    })

    it('does not invalidate on failed mutation', async function run() {
      const queryClient = new QueryClient()
      queryClient.setQueryData(interviewDetailQueryKey(interviewId), { id: interviewId })

      vi.stubGlobal(
        'fetch',
        vi.fn(async function failFetch(): Promise<Response> {
          return new Response(JSON.stringify({ error: 'Recording consent can only be changed before recording has started.' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          })
        }),
      )

      const { result } = renderHook(() => useSetRecordingConsent(), {
        wrapper: makeWrapper(queryClient),
      })

      act(function triggerSet() {
        result.current.mutate({ id: interviewId, decision: 'consented', consent_copy_version: consentCopyVersion })
      })

      await waitFor(function assertFailed() {
        expect(result.current.isError).toBe(true)
      })

      expect(queryClient.getQueryState(interviewDetailQueryKey(interviewId))?.isInvalidated).not.toBe(true)
    })

    it('performs one network request for rapid duplicate in-flight submissions from the same hook', async function run() {
      const queryClient = new QueryClient()
      let resolveFetch!: (value: Response) => void
      const fetchMock = vi.fn(function deferredFetch(): Promise<Response> {
        return new Promise<Response>(function deferred(resolve) {
          resolveFetch = resolve
        })
      })
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useSetRecordingConsent(), {
        wrapper: makeWrapper(queryClient),
      })

      act(function triggerFirst() {
        result.current.mutate({ id: interviewId, decision: 'consented', consent_copy_version: consentCopyVersion })
      })
      act(function triggerDuplicateWhileInFlight() {
        result.current.mutate({ id: interviewId, decision: 'consented', consent_copy_version: consentCopyVersion })
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)

      act(function resolve() {
        resolveFetch(
          new Response(JSON.stringify(makeRecordingConsentResponse()), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      })

      await waitFor(function assertSucceeded() {
        expect(result.current.isSuccess).toBe(true)
      })

      act(function triggerAfterSettled() {
        result.current.mutate({ id: interviewId, decision: 'declined', consent_copy_version: consentCopyVersion })
      })

      await waitFor(function assertSecondCall() {
        expect(fetchMock).toHaveBeenCalledTimes(2)
      })
    })

    it('surfaces a participant-safe error message that hides raw provider details on hook failure', async function run() {
      const queryClient = new QueryClient()
      const rawProviderError = 'RealtimeKit provider error: internal storage R2 failed\nstack at provider.internal:99'

      vi.stubGlobal(
        'fetch',
        vi.fn(async function failWithProviderLeak(): Promise<Response> {
          return new Response(JSON.stringify({ error: rawProviderError }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          })
        }),
      )

      const { result } = renderHook(() => useSetRecordingConsent(), {
        wrapper: makeWrapper(queryClient),
      })

      act(function triggerSet() {
        result.current.mutate({ id: interviewId, decision: 'consented', consent_copy_version: consentCopyVersion })
      })

      await waitFor(function assertFailed() {
        expect(result.current.isError).toBe(true)
      })

      const message = (result.current.error as Error | null)?.message ?? ''
      expect(message).not.toContain('RealtimeKit')
      expect(message).not.toContain('R2')
      expect(message).not.toContain('\n')
      expect(message.length).toBeGreaterThan(0)
    })
  })

  describe('useRevokeRecordingConsent', function useRevokeSuite() {
    it('invalidates the targeted interviewDetail query on revoke success', async function run() {
      const queryClient = new QueryClient()
      queryClient.setQueryData(interviewDetailQueryKey(interviewId), { id: interviewId })
      queryClient.setQueryData(interviewDetailQueryKey(otherInterviewId), { id: otherInterviewId })

      vi.stubGlobal(
        'fetch',
        vi.fn(async function successRevoke(): Promise<Response> {
          return new Response(
            JSON.stringify(makeRecordingConsentResponse({ revoked_at: '2026-04-13T10:00:00.000Z' })),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }),
      )

      const { result } = renderHook(() => useRevokeRecordingConsent(), {
        wrapper: makeWrapper(queryClient),
      })

      act(function triggerRevoke() {
        result.current.mutate({ id: interviewId })
      })

      await waitFor(function assertSucceeded() {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(queryClient.getQueryState(interviewDetailQueryKey(interviewId))?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(interviewDetailQueryKey(otherInterviewId))?.isInvalidated).not.toBe(true)
    })

    it('performs one network request for rapid duplicate revoke submissions while in flight', async function run() {
      const queryClient = new QueryClient()
      let resolveFetch!: (value: Response) => void
      const fetchMock = vi.fn(function deferredFetch(): Promise<Response> {
        return new Promise<Response>(function deferred(resolve) {
          resolveFetch = resolve
        })
      })
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useRevokeRecordingConsent(), {
        wrapper: makeWrapper(queryClient),
      })

      act(function triggerFirst() {
        result.current.mutate({ id: interviewId })
      })
      act(function triggerDuplicate() {
        result.current.mutate({ id: interviewId })
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)

      act(function resolve() {
        resolveFetch(
          new Response(
            JSON.stringify(makeRecordingConsentResponse({ revoked_at: '2026-04-13T10:00:00.000Z' })),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        )
      })

      await waitFor(function assertSucceeded() {
        expect(result.current.isSuccess).toBe(true)
      })
    })

    it('surfaces participant-safe error that does not expose internal payload on revoke failure', async function run() {
      const queryClient = new QueryClient()
      vi.stubGlobal(
        'fetch',
        vi.fn(async function failRevoke(): Promise<Response> {
          return new Response(JSON.stringify({ error: 'SQL failure: interview_recording_consents\nstack' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          })
        }),
      )

      const { result } = renderHook(() => useRevokeRecordingConsent(), {
        wrapper: makeWrapper(queryClient),
      })

      act(function triggerRevoke() {
        result.current.mutate({ id: interviewId })
      })

      await waitFor(function assertFailed() {
        expect(result.current.isError).toBe(true)
      })

      const message = (result.current.error as Error | null)?.message ?? ''
      expect(message).not.toContain('SQL')
      expect(message).not.toContain('\n')
      expect(message.length).toBeGreaterThan(0)
    })
  })

  describe('participant-safe error mapping', function safeErrorSuite() {
    it('maps 401, 404, 409, and 500 to safe messages without leaking provider internals', function run() {
      const mapper = resolveErrorMapper()

      const cases: Array<{ status: number; raw: string; mustNotContain: string[] }> = [
        { status: 401, raw: 'You must be authenticated to access this resource.', mustNotContain: [] },
        { status: 404, raw: 'Interview was not found for the active participant. SELECT * FROM', mustNotContain: ['SELECT'] },
        {
          status: 409,
          raw: 'Recording consent can only be changed before recording has started. provider=R2',
          mustNotContain: ['provider', 'R2'],
        },
        { status: 500, raw: 'internal error\nstack at foo:123\n RealtimeKit', mustNotContain: ['\n', 'RealtimeKit', 'stack'] },
      ]

      for (const { status, raw, mustNotContain } of cases) {
        const err = Object.assign(new Error(raw), { status })
        const message = mapper(err)
        expect(typeof message).toBe('string')
        expect(message.length).toBeGreaterThan(0)
        expect(message.length).toBeLessThan(200)
        expect(message).not.toContain('\n')
        for (const forbidden of mustNotContain) {
          expect(message).not.toContain(forbidden)
        }
      }
    })

    it('returns safe fallback for long and multiline raw payloads', function run() {
      const mapper = resolveErrorMapper()
      const longRaw = 'x'.repeat(500)
      const multilineRaw = 'failed\nstack trace\n at internal/provider.ts:1'

      for (const raw of [longRaw, multilineRaw]) {
        const err = Object.assign(new Error(raw), { status: 500 })
        const message = mapper(err)
        expect(message).not.toBe(raw)
        expect(message).not.toContain('\n')
        expect(message.length).toBeLessThan(200)
        expect(message.length).toBeGreaterThan(0)
      }
    })

    it('does not expose raw error when payload contains provider or internal keywords', function run() {
      const mapper = resolveErrorMapper()
      const providerErrors = [
        'RealtimeKit webhook signature invalid: provider secret leaked',
        'R2 storage failure: internal bucket not found',
        'SQL syntax error at interview_recording_consents',
        'internal provider stack trace',
      ]

      for (const raw of providerErrors) {
        const err = Object.assign(new Error(raw), { status: 500 })
        const message = mapper(err)
        expect(message).not.toContain('RealtimeKit')
        expect(message).not.toContain('R2')
        expect(message).not.toContain('SQL')
        expect(message).not.toContain('\n')
      }
    })

    it('produces stable output for unknown error shapes', function run() {
      const mapper = resolveErrorMapper()
      const cases: unknown[] = [null, undefined, {}, 'string error', { error: 'boom' }, new Error('')]

      for (const input of cases) {
        const message = mapper(input)
        expect(typeof message).toBe('string')
        expect(message.length).toBeGreaterThan(0)
        expect(message).not.toContain('\n')
        expect(message.length).toBeLessThan(200)
      }
    })
  })
})
