import type {
  CancelInterviewParams,
  CancelInterviewResponse,
  CreateInterviewRequest,
  CreateInterviewResponse,
  InterviewDetail,
  InterviewListItem,
  InterviewListQuery,
  ProvisionInterviewParams,
  ProvisionInterviewResponse,
} from '@mako/shared'
import {
  cancelInterviewParamsSchema,
  cancelInterviewResponseSchema,
  createInterviewRequestSchema,
  createInterviewResponseSchema,
  interviewDetailResponseSchema,
  interviewListResponseSchema,
  provisionInterviewParamsSchema,
  provisionInterviewResponseSchema,
} from '@mako/shared'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryObserverOptions,
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
export const interviewDetailStaleTimeMs = 5 * 60 * 1000

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

export function interviewDetailQueryKey(id: string): readonly unknown[] {
  return [...interviewsQueryRootKey, 'detail', id]
}

export function interviewDetailQueryOptions(
  id: string,
): QueryObserverOptions<InterviewDetail, Error, InterviewDetail, InterviewDetail, readonly unknown[]> {
  return {
    queryKey: interviewDetailQueryKey(id),
    queryFn: function getInterviewDetailQuery({ signal }) {
      return fetchInterviewDetail(fetch, id, signal)
    },
    staleTime: interviewDetailStaleTimeMs,
  }
}

export function useInterviewDetail(
  id: string,
): UseQueryResult<InterviewDetail, Error> {
  return useQuery(interviewDetailQueryOptions(id))
}

export function useProvisionInterview(): UseMutationResult<
  ProvisionInterviewResponse,
  Error,
  ProvisionInterviewParams
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function provisionInterviewMutation(params) {
      return provisionInterview(params)
    },
    onSuccess: async function onProvisionSuccess(_data, variables) {
      await queryClient.invalidateQueries({
        queryKey: interviewDetailQueryKey(variables.id),
      })
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
      await invalidateInterviewSurfaces(queryClient)
    },
  })
}

export async function invalidateInterviewSurfaces(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: interviewsQueryRootKey,
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

export async function fetchInterviewDetail(
  fetchImpl: typeof fetch = fetch,
  id: string,
  signal?: AbortSignal,
): Promise<InterviewDetail> {
  const parsedId = cancelInterviewParamsSchema.parse({ id }).id

  const response = await fetchImpl(
    createApiUrl(`/api/interviews/${parsedId}`),
    createApiRequestInit({
      method: 'GET',
      headers: demoSessionHeaders,
      signal,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to fetch interview details.'))
  }

  return interviewDetailResponseSchema.parse(payload).interview
}

export async function provisionInterview(
  params: ProvisionInterviewParams,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ProvisionInterviewResponse> {
  const parsedParams = provisionInterviewParamsSchema.parse(params)

  const response = await fetchImpl(
    createApiUrl(`/api/interviews/${parsedParams.id}/provision`),
    createApiRequestInit({
      method: 'POST',
      headers: demoSessionHeaders,
      signal,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to provision interview session.'))
  }

  return provisionInterviewResponseSchema.parse(payload)
}
