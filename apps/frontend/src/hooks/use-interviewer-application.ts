import {
  interviewerApplicationRequestSchema,
  interviewerApplicationResponseSchema,
  interviewerApplicationStatusResponseSchema,
  type InterviewerApplication,
  type InterviewerApplicationRequest,
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

// Application/status data is immutable server evidence; keep it apart from the
// mutable employment profile cache (`accountCompaniesQueryKey`).
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
  InterviewerApplication,
  Error,
  InterviewerApplicationRequest
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function submitApplicationMutation(input) {
      return submitInterviewerApplication(input)
    },
    onSuccess: function onSuccess(application) {
      queryClient.setQueryData(interviewerStatusQueryKey, application)
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
      readErrorMessage(payload, 'Unable to fetch interviewer application status.'),
      response.status,
    )
  }

  return interviewerApplicationStatusResponseSchema.parse(payload).application
}

export async function submitInterviewerApplication(
  input: InterviewerApplicationRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<InterviewerApplication> {
  // Only the contact email and ordered record IDs are ever sent; the server
  // builds the trusted employment snapshot.
  const parsedInput = interviewerApplicationRequestSchema.parse({
    email: input.email,
    employmentRecordIds: input.employmentRecordIds,
  })

  const response = await fetchImpl(
    createApiUrl('/api/interviewer/apply'),
    createApiRequestInit({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...demoSessionHeaders,
      },
      body: JSON.stringify(parsedInput),
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new ApiError(
      readErrorMessage(payload, 'Unable to submit interviewer application.'),
      response.status,
    )
  }

  return interviewerApplicationResponseSchema.parse(payload).application
}
