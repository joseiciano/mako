import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchScheduledInterviews,
  scheduledInterviewsQueryKey,
} from './use-scheduled-interviews'
import { readHeader } from './test-utils/read-header'

describe('use-scheduled-interviews hook', function useScheduledInterviewsSuite() {
  afterEach(function resetEnvironment() {
    vi.unstubAllEnvs()
  })

  it('fetches scheduled interviews and parses documented response fields', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await fetchScheduledInterviews(
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews?status=scheduled',
        )
        expect(init?.method).toBe('GET')
        expect(init?.credentials).toBe('include')
        expect(readHeader(init?.headers, 'x-user-id')).toBe(
          '11111111-1111-4111-8111-111111111111',
        )
        expect(readHeader(init?.headers, 'x-user-email')).toBe('demo@mako.dev')

        return new Response(
          JSON.stringify({
            interviews: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                scheduler_id: '22222222-2222-4222-8222-222222222222',
                scheduler_alias: 'Candidate-Blue',
                interviewer_id: null,
                interviewer_alias: 'Interviewer-Red',
                type: 'system_design',
                mode: 'peer_to_peer',
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
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      },
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('scheduled')
    expect(result[0]?.scheduler_alias).toBe('Candidate-Blue')
  })

  it('surfaces backend error message for failed list requests', async function run() {
    await expect(
      fetchScheduledInterviews(async function mockFetch() {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: {
            'content-type': 'application/json',
          },
        })
      }),
    ).rejects.toThrow('Unauthorized')
  })

  it('falls back to the generic error message when payload omits error field', async function run() {
    await expect(
      fetchScheduledInterviews(async function mockFetch() {
        return new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: {
            'content-type': 'application/json',
          },
        })
      }),
    ).rejects.toThrow('Unable to fetch interviews.')
  })

  it('rejects response payloads that diverge from shared schema contracts', async function run() {
    await expect(
      fetchScheduledInterviews(async function mockFetch() {
        return new Response(
          JSON.stringify({
            interviews: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                scheduler_id: '22222222-2222-4222-8222-222222222222',
                interviewer_id: null,
                type: 'system_design',
                mode: 'peer_to_peer',
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
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      }),
    ).rejects.toThrow()
  })

  it('fetchScheduledInterviews forwards abort signal into fetch init', async function run() {
    const controller = new AbortController()
    const signal = controller.signal

    await fetchScheduledInterviews(
      async function mockFetch(_input, init) {
        expect(init?.signal).toBe(signal)
        return new Response(
          JSON.stringify({
            interviews: [],
          }),
          { status: 200 },
        )
      },
      signal,
    )
  })

  it('keeps query key explicit and stable', function run() {
    expect(scheduledInterviewsQueryKey).toEqual(['interviews', 'scheduled'])
  })
})
