import {
  interviewListResponseSchema,
  type InterviewListItem,
} from '@mako/shared'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

export const scheduledInterviewsQueryKey = ['interviews', 'scheduled'] as const

const demoSessionHeaders = {
  'x-user-id': '11111111-1111-4111-8111-111111111111',
  'x-user-email': 'demo@mako.dev',
}

export function useScheduledInterviews(): UseQueryResult<InterviewListItem[], Error> {
  return useQuery({
    queryKey: scheduledInterviewsQueryKey,
    queryFn: function getScheduledInterviewsQuery() {
      return fetchScheduledInterviews()
    },
  })
}

export async function fetchScheduledInterviews(
  fetchImpl: typeof fetch = fetch,
): Promise<InterviewListItem[]> {
  const response = await fetchImpl('/api/interviews?status=scheduled', {
    method: 'GET',
    headers: demoSessionHeaders,
  })

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(
      readErrorMessage(payload, 'Unable to fetch scheduled interviews.'),
    )
  }

  return interviewListResponseSchema.parse(payload).interviews
}

async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function readErrorMessage(payload: unknown, fallbackMessage: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallbackMessage
  }

  const maybeError = (payload as Record<string, unknown>).error
  if (typeof maybeError === 'string' && maybeError.length > 0) {
    return maybeError
  }

  return fallbackMessage
}
