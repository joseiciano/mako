import { describe, expect, it } from 'vitest'
import {
  fetchScheduledInterviews,
  scheduledInterviewsQueryKey,
} from './use-scheduled-interviews'

describe('use-scheduled-interviews hook', function useScheduledInterviewsSuite() {
  it('fetches scheduled interviews and parses documented response fields', async function run() {
    const result = await fetchScheduledInterviews(
      async function mockFetch(input, init) {
        expect(input).toBe('/api/interviews?status=scheduled')
        expect(init?.method).toBe('GET')
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

  it('keeps query key explicit and stable', function run() {
    expect(scheduledInterviewsQueryKey).toEqual(['interviews', 'scheduled'])
  })
})

function readHeader(
  headers: HeadersInit | undefined,
  headerName: string,
): string | null {
  if (!headers) {
    return null
  }

  if (headers instanceof Headers) {
    return headers.get(headerName)
  }

  if (Array.isArray(headers)) {
    const matchedHeader = headers.find(function matches([name]) {
      return name === headerName
    })

    return matchedHeader ? matchedHeader[1] : null
  }

  const headerValue = headers[headerName]
  return typeof headerValue === 'string' ? headerValue : null
}
