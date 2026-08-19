import type {
  AiChatParams,
  AiChatRequest,
  AiChatResponse,
  CancelInterviewParams,
  CancelInterviewResponse,
  CreateInterviewRequest,
  CreateInterviewResponse,
  EndInterviewParams,
  InterviewDetail,
  InterviewLifecycleResponse,
  InterviewListItem,
  InterviewListQuery,
  ProvisionInterviewParams,
  ProvisionInterviewResponse,
  StartInterviewParams,
} from '@mako/shared'
import {
  aiChatParamsSchema,
  aiChatRequestSchema,
  aiChatResponseSchema,
  cancelInterviewParamsSchema,
  cancelInterviewResponseSchema,
  createInterviewRequestSchema,
  createInterviewResponseSchema,
  endInterviewParamsSchema,
  interviewDetailResponseSchema,
  interviewLifecycleResponseSchema,
  interviewListResponseSchema,
  provisionInterviewParamsSchema,
  provisionInterviewResponseSchema,
  startInterviewParamsSchema,
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
  ApiError,
} from '../lib/http-transport'
import { accountQueryKey } from './use-account'

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
    retry: false,
    onSuccess: async function onCreateSuccess() {
      await invalidateInterviewSurfaces(queryClient)
      await queryClient.invalidateQueries({ queryKey: accountQueryKey })
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
      // A current-client cancellation can change the persisted credit balance
      // (verified_interviewer refund/no-refund outcomes), so the account query
      // must be refreshed alongside the interview surfaces.
      await queryClient.invalidateQueries({ queryKey: accountQueryKey })
    },
  })
}

export function useStartInterview(): UseMutationResult<
  InterviewLifecycleResponse,
  Error,
  StartInterviewParams
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function startInterviewMutation(params) {
      return startInterview(params)
    },
    onSuccess: async function onStartSuccess() {
      await invalidateInterviewSurfaces(queryClient)
    },
  })
}

export function useEndInterview(): UseMutationResult<
  InterviewLifecycleResponse,
  Error,
  EndInterviewParams
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function endInterviewMutation(params) {
      return endInterview(params)
    },
    onSuccess: async function onEndSuccess() {
      await invalidateInterviewSurfaces(queryClient)
    },
  })
}

export function useAIChat(): UseMutationResult<
  AiChatResponse,
  Error,
  SubmitAiChatParams
> {
  return useMutation({
    mutationFn: function submitAiChatMutation(params) {
      return submitAiChat(params)
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
    throw new ApiError(
      readErrorMessage(responsePayload, 'Unable to create interview.'),
      response.status,
    )
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

export async function startInterview(
  params: StartInterviewParams,
  fetchImpl: typeof fetch = fetch,
): Promise<InterviewLifecycleResponse> {
  const parsedParams = startInterviewParamsSchema.parse(params)

  const response = await fetchImpl(
    createApiUrl(`/api/interviews/${parsedParams.id}/start`),
    createApiRequestInit({
      method: 'POST',
      headers: demoSessionHeaders,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to start interview session.'))
  }

  return interviewLifecycleResponseSchema.parse(payload)
}

export async function endInterview(
  params: EndInterviewParams,
  fetchImpl: typeof fetch = fetch,
): Promise<InterviewLifecycleResponse> {
  const parsedParams = endInterviewParamsSchema.parse(params)

  const response = await fetchImpl(
    createApiUrl(`/api/interviews/${parsedParams.id}/end`),
    createApiRequestInit({
      method: 'POST',
      headers: demoSessionHeaders,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to end interview session.'))
  }

  return interviewLifecycleResponseSchema.parse(payload)
}

export type SubmitAiChatParams = AiChatParams & AiChatRequest

export async function submitAiChat(
  params: SubmitAiChatParams,
  fetchImpl: typeof fetch = fetch,
): Promise<AiChatResponse> {
  const parsedParams = aiChatParamsSchema.parse({ id: params.id })
  const parsedBody = aiChatRequestSchema.parse({
    message: params.message,
    canvas_snapshot: params.canvas_snapshot,
    guidance_mode: params.guidance_mode,
    chat_history: params.chat_history,
  })

  const response = await fetchImpl(
    createApiUrl(`/api/interviews/${parsedParams.id}/ai-chat`),
    createApiRequestInit({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...demoSessionHeaders,
      },
      body: JSON.stringify(parsedBody),
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to submit AI chat message.'))
  }

  return aiChatResponseSchema.parse(payload)
}
