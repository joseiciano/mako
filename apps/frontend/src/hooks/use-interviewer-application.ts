import {
  interviewerApplicationRequestSchema,
  interviewerApplicationResponseSchema,
  interviewerApplicationStatusResponseSchema,
  type InterviewerApplication,
  type InterviewerApplicationRequest,
  type InterviewerApplicationResponse,
} from '@mako/shared'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  ApiError,
  createApiRequestInit,
  createApiUrl,
  demoSessionHeaders,
  parseResponse,
  readErrorMessage,
} from '../lib/http-transport'

export const interviewerStatusQueryKey = ['interviewer', 'status'] as const

export function useInterviewerStatus(): UseQueryResult<InterviewerApplication | null, Error> {
  return useQuery({
    queryKey: interviewerStatusQueryKey,
    queryFn: function getInterviewerStatusQuery({ signal }) {
      return fetchInterviewerStatus(fetch, signal)
    },
  })
}

export function useSubmitInterviewerApplication(): UseMutationResult<
  InterviewerApplicationResponse,
  Error,
  InterviewerApplicationRequest
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function submitApplicationMutation(input) {
      return submitInterviewerApplication(input)
    },
    onSuccess: function onSuccess(response) {
      queryClient.setQueryData(interviewerStatusQueryKey, response.application)
    },
  })
}

export async function fetchInterviewerStatus(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<InterviewerApplication | null> {
  const response = await fetchImpl(
    createApiUrl('/api/interviewer/status'),
    createApiRequestInit({ headers: demoSessionHeaders, signal }),
  )
  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new ApiError(
      readErrorMessage(payload, 'Unable to load application status.'),
      response.status,
    )
  }

  return interviewerApplicationStatusResponseSchema.parse(payload).application
}

export async function submitInterviewerApplication(
  input: InterviewerApplicationRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<InterviewerApplicationResponse> {
  const body = interviewerApplicationRequestSchema.parse({
    email: input.email,
    employmentRecordIds: input.employmentRecordIds,
  })

  const response = await fetchImpl(
    createApiUrl('/api/interviewer/apply'),
    createApiRequestInit({
      method: 'POST',
      headers: { 'content-type': 'application/json', ...demoSessionHeaders },
      body: JSON.stringify(body),
    }),
  )
  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new ApiError(
      readErrorMessage(payload, 'Unable to submit application.'),
      response.status,
    )
  }

  return interviewerApplicationResponseSchema.parse(payload)
}
