import { useCallback, useRef } from 'react'
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import {
  interviewIdParamsSchema,
  recordingConsentRequestSchema,
  recordingConsentResponseSchema,
  type ConsentDecision,
  type RecordingConsentResponse,
} from '@mako/shared'
import {
  ApiError,
  createApiRequestInit,
  createApiUrl,
  demoSessionHeaders,
  parseResponse,
} from '../lib/http-transport'
import { interviewDetailQueryKey } from './use-interviews'

export const RECORDING_CONSENT_COPY_VERSION = 'consent-copy-v1' as const

type SetRecordingConsentVariables = {
  id: string
  decision: ConsentDecision
  consent_copy_version: string
}

type RevokeRecordingConsentVariables = {
  id: string
}

function mapStatusToMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid recording consent request.'
    case 401:
      return 'You must be signed in to update recording consent.'
    case 403:
      return 'You do not have permission to update recording consent.'
    case 404:
      return 'Interview not found.'
    case 409:
      return 'Recording consent can only be changed before recording has started.'
    case 422:
      return 'Invalid recording consent request.'
    default:
      return 'Unable to update recording consent. Please try again.'
  }
}

export function getRecordingConsentErrorMessage(error: unknown): string {
  let status: number | undefined
  if (error instanceof ApiError && typeof error.status === 'number') {
    status = error.status
  } else if (error !== null && typeof error === 'object' && 'status' in error) {
    const s = (error as Record<string, unknown>).status
    if (typeof s === 'number' && Number.isFinite(s)) status = s
  }
  if (typeof status === 'number') {
    const message = mapStatusToMessage(status)
    if (message.length > 0 && message.length < 200 && !message.includes('\n')) {
      return message
    }
  }
  return 'Unable to update recording consent. Please try again.'
}

export async function setRecordingConsent(
  variables: SetRecordingConsentVariables,
  fetchImpl: typeof fetch = fetch,
): Promise<RecordingConsentResponse> {
  const parsedId = interviewIdParamsSchema.parse({ id: variables.id }).id
  const parsedBody = recordingConsentRequestSchema.parse({
    decision: variables.decision,
    consent_copy_version: variables.consent_copy_version,
  })

  const response = await fetchImpl(
    createApiUrl(`/api/interviews/${parsedId}/recording-consent`),
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
    throw new ApiError(
      getRecordingConsentErrorMessage({ status: response.status }),
      response.status,
    )
  }

  return recordingConsentResponseSchema.parse(payload)
}

export async function revokeRecordingConsent(
  variables: RevokeRecordingConsentVariables,
  fetchImpl: typeof fetch = fetch,
): Promise<RecordingConsentResponse> {
  const parsedId = interviewIdParamsSchema.parse({ id: variables.id }).id

  const response = await fetchImpl(
    createApiUrl(`/api/interviews/${parsedId}/recording-consent`),
    createApiRequestInit({
      method: 'DELETE',
      headers: {
        ...demoSessionHeaders,
      },
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new ApiError(
      getRecordingConsentErrorMessage({ status: response.status }),
      response.status,
    )
  }

  return recordingConsentResponseSchema.parse(payload)
}

function useRecordingConsentMutation<TVariables extends { id: string }>(
  request: (variables: TVariables) => Promise<RecordingConsentResponse>,
): UseMutationResult<RecordingConsentResponse, Error, TVariables> {
  const queryClient = useQueryClient()
  const inFlightRef = useRef<Promise<RecordingConsentResponse> | null>(null)

  const getOrStartRequest = useCallback(
    function getOrStartRequest(variables: TVariables) {
      if (inFlightRef.current) return inFlightRef.current

      const requestPromise = request(variables)
      inFlightRef.current = requestPromise
      void requestPromise
        .finally(function clearInFlightRequest() {
          if (inFlightRef.current === requestPromise) {
            inFlightRef.current = null
          }
        })
        .catch(function ignoreObserverPromise() {})

      return requestPromise
    },
    [request],
  )

  const mutation = useMutation<RecordingConsentResponse, Error, TVariables>({
    mutationFn: getOrStartRequest,
    onSuccess: async function onSuccess(_data, variables) {
      await queryClient.invalidateQueries({
        queryKey: interviewDetailQueryKey(variables.id),
      })
    },
  })

  const mutate = useCallback(
    function mutate(
      variables: TVariables,
      options?: Parameters<typeof mutation.mutate>[1],
    ) {
      void getOrStartRequest(variables).catch(function ignoreEagerRequestError() {})
      mutation.mutate(variables, options)
    },
    [getOrStartRequest, mutation.mutate],
  )

  const mutateAsync = useCallback(
    function mutateAsync(
      variables: TVariables,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) {
      void getOrStartRequest(variables).catch(function ignoreEagerRequestError() {})
      return mutation.mutateAsync(variables, options)
    },
    [getOrStartRequest, mutation.mutateAsync],
  )

  return {
    ...mutation,
    mutate,
    mutateAsync,
  } as UseMutationResult<RecordingConsentResponse, Error, TVariables>
}

export function useSetRecordingConsent(): UseMutationResult<
  RecordingConsentResponse,
  Error,
  SetRecordingConsentVariables
> {
  return useRecordingConsentMutation(setRecordingConsent)
}

export function useRevokeRecordingConsent(): UseMutationResult<
  RecordingConsentResponse,
  Error,
  RevokeRecordingConsentVariables
> {
  return useRecordingConsentMutation(revokeRecordingConsent)
}
