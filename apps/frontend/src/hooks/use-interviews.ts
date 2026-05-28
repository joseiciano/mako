import type {
  CancelInterviewParams,
  CancelInterviewResponse,
  CreateInterviewRequest,
  CreateInterviewResponse,
  InterviewListItem,
  InterviewListQuery,
} from '@mako/shared'
import {
  cancelInterviewParamsSchema,
  cancelInterviewResponseSchema,
  createInterviewRequestSchema,
  createInterviewResponseSchema,
  interviewListResponseSchema,
} from '@mako/shared'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  createApiRequestInit,
  createApiUrl,
  demoSessionHeaders,
  parseResponse,
  readErrorMessage,
} from '../lib/http-transport'

export type InterviewListFilters = Partial<InterviewListQuery>

export const interviewsQueryRootKey = ['interviews'] as const

export function buildInterviewsQueryKey(
  filters?: InterviewListFilters,
): readonly unknown[] {
  if (!filters) {
    return interviewsQueryRootKey
  }

  return [...interviewsQueryRootKey, filters]
}

export function useInterviews(
  filters?: InterviewListFilters,
): UseQueryResult<InterviewListItem[], Error> {
  return useQuery({
    queryKey: buildInterviewsQueryKey(filters),
    queryFn: function getInterviewsQuery({ signal }) {
      return fetchInterviews(fetch, filters, signal)
    },
  })
}

export function useCreateInterview(): UseMutationResult<
  CreateInterviewResponse,
  Error,
  CreateInterviewRequest
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function createInterviewMutation(payload) {
      return createInterview(payload)
    },
    onSuccess: async function onCreateSuccess() {
      await queryClient.invalidateQueries({
        queryKey: interviewsQueryRootKey,
      })
    },
  })
}

export function useCancelInterview(): UseMutationResult<
  CancelInterviewResponse,
  Error,
  CancelInterviewParams
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function cancelInterviewMutation(params) {
      return cancelInterview(params)
    },
    onSuccess: async function onCancelSuccess() {
      await queryClient.invalidateQueries({
        queryKey: interviewsQueryRootKey,
      })
    },
  })
}

export async function fetchInterviews(
  fetchImpl: typeof fetch = fetch,
  filters?: InterviewListFilters,
  signal?: AbortSignal,
): Promise<InterviewListItem[]> {
  const searchParams = new URLSearchParams()

  if (filters?.status) {
    searchParams.set('status', filters.status)
  }
  if (filters?.limit !== undefined) {
    searchParams.set('limit', String(filters.limit))
  }
  if (filters?.offset !== undefined) {
    searchParams.set('offset', String(filters.offset))
  }

  const queryString = searchParams.toString()
  const url = queryString.length > 0
    ? `${createApiUrl('/api/interviews')}?${queryString}`
    : createApiUrl('/api/interviews')

  const response = await fetchImpl(
    url,
    createApiRequestInit({
      method: 'GET',
      headers: demoSessionHeaders,
      signal,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to fetch interviews.'))
  }

  return interviewListResponseSchema.parse(payload).interviews
}

export async function createInterview(
  payload: CreateInterviewRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateInterviewResponse> {
  const parsedPayload = createInterviewRequestSchema.parse(payload)

  const response = await fetchImpl(
    createApiUrl('/api/interviews'),
    createApiRequestInit({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...demoSessionHeaders,
      },
      body: JSON.stringify(parsedPayload),
    }),
  )

  const responsePayload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, 'Unable to create interview.'))
  }

  return createInterviewResponseSchema.parse(responsePayload)
}

export async function cancelInterview(
  params: CancelInterviewParams,
  fetchImpl: typeof fetch = fetch,
): Promise<CancelInterviewResponse> {
  const parsedParams = cancelInterviewParamsSchema.parse(params)

  const response = await fetchImpl(
    createApiUrl(`/api/interviews/${parsedParams.id}/cancel`),
    createApiRequestInit({
      method: 'POST',
      headers: demoSessionHeaders,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to cancel interview.'))
  }

  return cancelInterviewResponseSchema.parse(payload)
}
