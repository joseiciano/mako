import {
  interviewListResponseSchema,
  type InterviewListItem,
} from '@mako/shared'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  createApiRequestInit,
  createApiUrl,
  demoSessionHeaders,
  parseResponse,
  readErrorMessage,
} from '../lib/http-transport'

export const scheduledInterviewsQueryKey = ['interviews', 'scheduled'] as const

export function useScheduledInterviews(): UseQueryResult<InterviewListItem[], Error> {
  return useQuery({
    queryKey: scheduledInterviewsQueryKey,
    queryFn: function getScheduledInterviewsQuery({ signal }) {
      return fetchScheduledInterviews(fetch, signal)
    },
  })
}

export async function fetchScheduledInterviews(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<InterviewListItem[]> {
  const response = await fetchImpl(
    createApiUrl('/api/interviews?status=scheduled'),
    createApiRequestInit({
      method: 'GET',
      headers: demoSessionHeaders,
      signal,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(
      readErrorMessage(payload, 'Unable to fetch scheduled interviews.'),
    )
  }

  return interviewListResponseSchema.parse(payload).interviews
}
