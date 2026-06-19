import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildInterviewsQueryKey,
  cancelInterview,
  createInterview,
  fetchInterviews,
  invalidateInterviewSurfaces,
  interviewsQueryRootKey,
} from './use-interviews'
import { readHeader } from './test-utils/read-header'

const interviewFixture = {
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
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
}

describe('use-interviews data layer', function useInterviewsSuite() {
  afterEach(function resetEnvironment() {
    vi.unstubAllEnvs()
  })

  it('exports stable root query key', function run() {
    expect(interviewsQueryRootKey).toEqual(['interviews'])
  })

  it('builds query key without filters', function run() {
    expect(buildInterviewsQueryKey()).toEqual(['interviews'])
  })

  it('builds query key with status filter', function run() {
    expect(buildInterviewsQueryKey({ status: 'scheduled' })).toEqual([
      'interviews',
      { status: 'scheduled' },
    ])
  })

  it('builds query key with all filters', function run() {
    expect(
      buildInterviewsQueryKey({ status: 'scheduled', limit: 10, offset: 5 }),
    ).toEqual(['interviews', { status: 'scheduled', limit: 10, offset: 5 }])
  })

  it('invalidates all interview surfaces from the root query key', async function run() {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)

    await invalidateInterviewSurfaces({ invalidateQueries } as never)

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: interviewsQueryRootKey,
    })
  })

  it('fetches interviews without filters', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await fetchInterviews(
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews',
        )
        expect(init?.method).toBe('GET')
        expect(init?.credentials).toBe('include')

        return new Response(
          JSON.stringify({ interviews: [interviewFixture] }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      },
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('scheduled')
  })

  it('fetches interviews with status filter', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await fetchInterviews(
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews?status=scheduled',
        )
        expect(init?.method).toBe('GET')

        return new Response(
          JSON.stringify({ interviews: [interviewFixture] }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      },
      { status: 'scheduled' },
    )

    expect(result).toHaveLength(1)
  })

  it('fetches interviews with limit and offset', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    await fetchInterviews(
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews?limit=10&offset=5',
        )
        expect(init?.method).toBe('GET')

        return new Response(JSON.stringify({ interviews: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
      { limit: 10, offset: 5 },
    )
  })

  it('surfaces backend error message for failed list requests', async function run() {
    await expect(
      fetchInterviews(async function mockFetch() {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      }),
    ).rejects.toThrow('Unauthorized')
  })

  it('falls back to a stable error message when list payload omits error field', async function run() {
    await expect(
      fetchInterviews(async function mockFetch() {
        return new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      }),
    ).rejects.toThrow('Unable to fetch interviews.')
  })

  it('rejects response payloads that diverge from shared schema contracts', async function run() {
    await expect(
      fetchInterviews(async function mockFetch() {
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
                created_at: '2026-04-01T10:00:00.000Z',
                updated_at: '2026-04-01T10:00:00.000Z',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }),
    ).rejects.toThrow()
  })

  it('fetchInterviews forwards abort signal into fetch init', async function run() {
    const controller = new AbortController()
    const signal = controller.signal

    await fetchInterviews(
      async function mockFetch(_input, init) {
        expect(init?.signal).toBe(signal)
        return new Response(JSON.stringify({ interviews: [] }), {
          status: 200,
        })
      },
      undefined,
      signal,
    )
  })

  it('creates an interview via POST and parses the response', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await createInterview(
      {
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      },
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews',
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
          type: 'system_design',
          mode: 'ai_led',
          scheduled_at: 'now',
        })

        return new Response(
          JSON.stringify({
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
              created_at: '2026-04-01T10:00:00.000Z',
              updated_at: '2026-04-01T10:00:00.000Z',
            },
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

    expect(result.interview.type).toBe('system_design')
    expect(result.interview.mode).toBe('ai_led')
    expect(result.interview.status).toBe('scheduled')
  })

  it('supports future datetime for scheduled_at', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const futureDate = '2026-05-01T14:00:00.000Z'

    const result = await createInterview(
      {
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: futureDate,
      },
      async function mockFetch(_input, init) {
        const body = JSON.parse((init?.body as string) ?? '{}')
        expect(body.scheduled_at).toBe(futureDate)

        return new Response(
          JSON.stringify({
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
              scheduled_at: futureDate,
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              created_at: '2026-04-01T10:00:00.000Z',
              updated_at: '2026-04-01T10:00:00.000Z',
            },
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

    expect(result.interview.scheduled_at).toBe(futureDate)
  })

  it('surfaces backend error message for failed create requests', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    await expect(
      createInterview(
        {
          type: 'system_design',
          mode: 'ai_led',
          scheduled_at: 'now',
        },
        async function mockFetch() {
          return new Response(
            JSON.stringify({ error: 'Insufficient credits' }),
            {
              status: 402,
              headers: {
                'content-type': 'application/json',
              },
            },
          )
        },
      ),
    ).rejects.toThrow('Insufficient credits')
  })

  it('falls back to a stable error message when create payload omits error field', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    await expect(
      createInterview(
        {
          type: 'system_design',
          mode: 'ai_led',
          scheduled_at: 'now',
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
    ).rejects.toThrow('Unable to create interview.')
  })

  it('cancels an interview via POST', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await cancelInterview(
      { id: '11111111-1111-4111-8111-111111111111' },
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews/11111111-1111-4111-8111-111111111111/cancel',
        )
        expect(init?.method).toBe('POST')
        expect(init?.credentials).toBe('include')

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    )

    expect(result.success).toBe(true)
  })

  it('surfaces backend error message for failed cancel requests', async function run() {
    await expect(
      cancelInterview(
        { id: '11111111-1111-4111-8111-111111111111' },
        async function mockFetch() {
          return new Response(
            JSON.stringify({ error: 'Interview not found' }),
            {
              status: 404,
              headers: { 'content-type': 'application/json' },
            },
          )
        },
      ),
    ).rejects.toThrow('Interview not found')
  })

  it('falls back to a stable error message when cancel payload omits error field', async function run() {
    await expect(
      cancelInterview(
        { id: '11111111-1111-4111-8111-111111111111' },
        async function mockFetch() {
          return new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          })
        },
      ),
    ).rejects.toThrow('Unable to cancel interview.')
  })
})
