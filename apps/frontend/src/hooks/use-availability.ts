import type {
  CreateAvailabilityRequest,
  CreateAvailabilityResponse,
} from '@mako/shared'
import {
  createAvailabilityRequestSchema,
} from '@mako/shared'
import {
  useMutation,
  type UseMutationResult,
} from '@tanstack/react-query'

export const availabilityQueryRootKey = ['availability'] as const

export function useCreateAvailability(): UseMutationResult<
  CreateAvailabilityResponse,
  Error,
  CreateAvailabilityRequest
> {
  return useMutation({
    mutationFn: function createAvailabilityMutation(payload) {
      return createAvailability(payload)
    },
  })
}

export async function createAvailability(
  payload: CreateAvailabilityRequest,
  _fetchImpl: typeof fetch = fetch,
): Promise<CreateAvailabilityResponse> {
  createAvailabilityRequestSchema.parse(payload)
  throw new Error(
    'Peer-to-peer matching is temporarily unavailable. Your availability was not submitted.',
  )
}
