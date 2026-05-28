import { type InterviewListItem } from '@mako/shared'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchInterviews } from './use-interviews'

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
  return fetchInterviews(fetchImpl, { status: 'scheduled' }, signal)
}
