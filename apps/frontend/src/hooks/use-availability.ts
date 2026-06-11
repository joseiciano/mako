import type {
  CreateAvailabilityRequest,
  CreateAvailabilityResponse,
} from '@mako/shared'
import {
  createAvailabilityRequestSchema,
  createAvailabilityResponseSchema,
} from '@mako/shared'
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import {
  createApiRequestInit,
  createApiUrl,
  demoSessionHeaders,
  parseResponse,
  readErrorMessage,
} from '../lib/http-transport'

export const availabilityQueryRootKey = ['availability'] as const

export function useCreateAvailability(): UseMutationResult<
  CreateAvailabilityResponse,
  Error,
  CreateAvailabilityRequest
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function createAvailabilityMutation(payload) {
      return createAvailability(payload)
    },
    onSuccess: async function onCreateSuccess() {
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryRootKey,
      })
    },
  })
}

export async function createAvailability(
  payload: CreateAvailabilityRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateAvailabilityResponse> {
  const parsedPayload = createAvailabilityRequestSchema.parse(payload)

  const response = await fetchImpl(
    createApiUrl('/api/availability'),
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
    throw new Error(
      readErrorMessage(responsePayload, 'Unable to submit availability.'),
    )
  }

  return createAvailabilityResponseSchema.parse(responsePayload)
}