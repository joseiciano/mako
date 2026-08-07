import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import {
  buildInterviewsQueryKey,
  cancelInterview,
  createInterview,
  endInterview,
  fetchInterviews,
  invalidateInterviewSurfaces,
  interviewsQueryRootKey,
  interviewDetailStaleTimeMs,
  interviewDetailQueryKey,
  fetchInterviewDetail,
  provisionInterview,
  startInterview,
  interviewDetailQueryOptions,
  submitAiChat,
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
  recording_status: 'not_started',
  transcript: null,
  feedback_status: 'not_started',
  feedback_unavailable_reason: null,
  feedback_error_code: null,
  feedback_prompt_version: null,
  feedback_generated_at: null,
  started_at: null,
  expires_at: null,
  warning_at: null,
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

  it('keeps interview detail data fresh for five minutes', function run() {
    expect(interviewDetailStaleTimeMs).toBe(5 * 60 * 1000)
  })

  it('builds interview detail query key with id', function run() {
    expect(interviewDetailQueryKey('11111111-1111-4111-8111-111111111111')).toEqual([
      'interviews',
      'detail',
      '11111111-1111-4111-8111-111111111111',
    ])
  })

  it('returns query options with correct key, staleTime, and queryFn', function run() {
    const options = interviewDetailQueryOptions('11111111-1111-4111-8111-111111111111')
    expect(options.queryKey).toEqual([
      'interviews',
      'detail',
      '11111111-1111-4111-8111-111111111111',
    ])
    expect(options.staleTime).toBe(interviewDetailStaleTimeMs)
    expect(typeof options.queryFn).toBe('function')
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
    const queryClient = { invalidateQueries } as unknown as Pick<
      QueryClient,
      'invalidateQueries'
    >

    await invalidateInterviewSurfaces(queryClient)

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
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
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
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
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

  it('carries the HTTP status on failed create rejections', async function run() {
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
    ).rejects.toMatchObject({ status: 402 })
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

  it('fetches interview detail via GET', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await fetchInterviewDetail(
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews/11111111-1111-4111-8111-111111111111',
        )
        expect(init?.method).toBe('GET')
        expect(init?.credentials).toBe('include')

        return new Response(
          JSON.stringify({
            interview: {
              ...interviewFixture,
              type: 'coding',
              mode: 'ai_led',
              status: 'scheduled',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      },
      '11111111-1111-4111-8111-111111111111',
    )

    expect(result.type).toBe('coding')
    expect(result.mode).toBe('ai_led')
    expect(result.status).toBe('scheduled')
  })

  it('surfaces backend error message for failed detail requests', async function run() {
    await expect(
      fetchInterviewDetail(
        async function mockFetch() {
          return new Response(
            JSON.stringify({ error: 'Interview not found' }),
            {
              status: 404,
              headers: { 'content-type': 'application/json' },
            },
          )
        },
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toThrow('Interview not found')
  })

  it('falls back to a stable error message when detail payload omits error field', async function run() {
    await expect(
      fetchInterviewDetail(
        async function mockFetch() {
          return new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          })
        },
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toThrow('Unable to fetch interview details.')
  })

  it('fetchInterviewDetail forwards abort signal into fetch init', async function run() {
    const controller = new AbortController()
    const signal = controller.signal

    await fetchInterviewDetail(
      async function mockFetch(_input, init) {
        expect(init?.signal).toBe(signal)
        return new Response(
          JSON.stringify({ interview: interviewFixture }),
          { status: 200 },
        )
      },
      '11111111-1111-4111-8111-111111111111',
      signal,
    )
  })

  it('validates interview detail id before fetching', async function run() {
    const fetchSpy = vi.fn()

    await expect(fetchInterviewDetail(fetchSpy, 'not-a-uuid')).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('provisions an interview via POST', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await provisionInterview(
      { id: '11111111-1111-4111-8111-111111111111' },
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews/11111111-1111-4111-8111-111111111111/provision',
        )
        expect(init?.method).toBe('POST')
        expect(init?.credentials).toBe('include')

        return new Response(
          JSON.stringify({
            mode: 'ai_led',
            realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
            excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      },
    )

    expect(result.mode).toBe('ai_led')
    expect(result.realtime.realtime_session_id).toBe('rt-1')
  })

  it('surfaces backend error message for failed provision requests', async function run() {
    await expect(
      provisionInterview(
        { id: '11111111-1111-4111-8111-111111111111' },
        async function mockFetch() {
          return new Response(
            JSON.stringify({ error: 'Insufficient credits' }),
            {
              status: 402,
              headers: { 'content-type': 'application/json' },
            },
          )
        },
      ),
    ).rejects.toThrow('Insufficient credits')
  })

  it('falls back to a stable error message when provision payload omits error field', async function run() {
    await expect(
      provisionInterview(
        { id: '11111111-1111-4111-8111-111111111111' },
        async function mockFetch() {
          return new Response(
            JSON.stringify({ message: 'Server error' }),
            {
              status: 500,
              headers: { 'content-type': 'application/json' },
            },
          )
        },
      ),
    ).rejects.toThrow('Unable to provision interview session.')
  })

  it('starts an interview via POST', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await startInterview(
      { id: '11111111-1111-4111-8111-111111111111' },
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews/11111111-1111-4111-8111-111111111111/start',
        )
        expect(init?.method).toBe('POST')
        expect(init?.credentials).toBe('include')

        return new Response(
          JSON.stringify({
            success: true,
            interview: interviewFixture,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      },
    )

    expect(result.success).toBe(true)
    expect(result.interview.status).toBe('scheduled')
  })

  it('surfaces backend error message for failed start requests', async function run() {
    await expect(
      startInterview(
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

  it('falls back to a stable error message when start payload omits error field', async function run() {
    await expect(
      startInterview(
        { id: '11111111-1111-4111-8111-111111111111' },
        async function mockFetch() {
          return new Response(
            JSON.stringify({ message: 'Server error' }),
            {
              status: 500,
              headers: { 'content-type': 'application/json' },
            },
          )
        },
      ),
    ).rejects.toThrow('Unable to start interview session.')
  })

  it('ends an interview via POST', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await endInterview(
      { id: '11111111-1111-4111-8111-111111111111' },
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews/11111111-1111-4111-8111-111111111111/end',
        )
        expect(init?.method).toBe('POST')
        expect(init?.credentials).toBe('include')

        return new Response(
          JSON.stringify({
            success: true,
            interview: { ...interviewFixture, status: 'completed' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      },
    )

    expect(result.success).toBe(true)
    expect(result.interview.status).toBe('completed')
  })

  it('surfaces backend error message for failed end requests', async function run() {
    await expect(
      endInterview(
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

  it('falls back to a stable error message when end payload omits error field', async function run() {
    await expect(
      endInterview(
        { id: '11111111-1111-4111-8111-111111111111' },
        async function mockFetch() {
          return new Response(
            JSON.stringify({ message: 'Server error' }),
            {
              status: 500,
              headers: { 'content-type': 'application/json' },
            },
          )
        },
      ),
    ).rejects.toThrow('Unable to end interview session.')
  })

  it('submits an AI chat message via POST', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await submitAiChat(
      {
        id: '11111111-1111-4111-8111-111111111111',
        message: 'Review my design',
        canvas_snapshot: { type: 'excalidraw_scene', scene: { elements: [] } },
        guidance_mode: 'review',
      },
      async function mockFetch(input, init) {
        expect(input).toBe(
          'https://api.test.local/api/interviews/11111111-1111-4111-8111-111111111111/ai-chat',
        )
        expect(init?.method).toBe('POST')
        expect(init?.credentials).toBe('include')
        expect(readHeader(init?.headers, 'content-type')).toBe(
          'application/json',
        )

        const body = JSON.parse((init?.body as string) ?? '{}')
        expect(body).toEqual({
          message: 'Review my design',
          canvas_snapshot: { type: 'excalidraw_scene', scene: { elements: [] } },
          guidance_mode: 'review',
        })

        return new Response(
          JSON.stringify({
            reply: 'Consider a cache.',
            guidance_mode: 'review',
            prompt_version: 'ai-whiteboard-v1',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      },
    )

    expect(result.reply).toBe('Consider a cache.')
    expect(result.guidance_mode).toBe('review')
    expect(result.prompt_version).toBe('ai-whiteboard-v1')
  })

  it('includes chat_history in the AI chat body when provided', async function run() {
    await submitAiChat(
      {
        id: '11111111-1111-4111-8111-111111111111',
        message: 'Follow up',
        canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
        guidance_mode: 'review',
        chat_history: [
          { role: 'user', content: 'prev q' },
          { role: 'assistant', content: 'prev a' },
        ],
      },
      async function mockFetch(_input, init) {
        const body = JSON.parse((init?.body as string) ?? '{}')
        expect(body.chat_history).toEqual([
          { role: 'user', content: 'prev q' },
          { role: 'assistant', content: 'prev a' },
        ])
        return new Response(
          JSON.stringify({
            reply: 'ok',
            guidance_mode: 'review',
            prompt_version: 'ai-whiteboard-v1',
          }),
          { status: 200 },
        )
      },
    )
  })

  it('surfaces backend error message for failed AI chat requests', async function run() {
    await expect(
      submitAiChat(
        {
          id: '11111111-1111-4111-8111-111111111111',
          message: 'hi',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
        },
        async function mockFetch() {
          return new Response(
            JSON.stringify({ error: 'AI chat is not configured.' }),
            {
              status: 503,
              headers: { 'content-type': 'application/json' },
            },
          )
        },
      ),
    ).rejects.toThrow('AI chat is not configured.')
  })

  it('falls back to a stable error message when AI chat payload omits error field', async function run() {
    await expect(
      submitAiChat(
        {
          id: '11111111-1111-4111-8111-111111111111',
          message: 'hi',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
        },
        async function mockFetch() {
          return new Response(JSON.stringify({ message: 'Server error' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          })
        },
      ),
    ).rejects.toThrow('Unable to submit AI chat message.')
  })

  it('rejects AI chat submissions when id is not a uuid', async function run() {
    const fetchSpy = vi.fn()

    await expect(
      submitAiChat(
        {
          id: 'not-a-uuid',
          message: 'hi',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
        },
        fetchSpy,
      ),
    ).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
