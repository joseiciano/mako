import {
  cancelPremiumSlotResponseSchema,
  premiumInterviewerSlotSchema,
  premiumOwnerListResponseSchema,
  publishPremiumSlotInputSchema,
  type PremiumInterviewerSlot,
  type PremiumOwnerListResponse,
  type PublishPremiumSlotInput,
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

export const premiumSlotsQueryKey = ['premium', 'interviewer-slots', 'system_design'] as const

export function usePremiumSlots(): UseQueryResult<PremiumOwnerListResponse, Error> {
  return useQuery({
    queryKey: premiumSlotsQueryKey,
    queryFn: function getPremiumSlotsQuery({ signal }) {
      return fetchPremiumSlots(fetch, signal)
    },
  })
}

export function usePublishPremiumSlot(): UseMutationResult<
  { slot: PremiumInterviewerSlot },
  Error,
  PublishPremiumSlotInput
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function publishPremiumSlotMutation(input) {
      return publishPremiumSlot(input)
    },
    onSuccess: async function onSuccess() {
      await queryClient.invalidateQueries({ queryKey: premiumSlotsQueryKey })
    },
  })
}

export function useCancelPremiumSlot(): UseMutationResult<
  { success: true },
  Error,
  string
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function cancelPremiumSlotMutation(slotId) {
      return cancelPremiumSlot(slotId)
    },
    onSuccess: async function onSuccess() {
      await queryClient.invalidateQueries({ queryKey: premiumSlotsQueryKey })
    },
  })
}

export async function fetchPremiumSlots(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<PremiumOwnerListResponse> {
  const url = createApiUrl('/api/premium/interviewer/slots?interviewType=system_design')
  const response = await fetchImpl(
    url,
    createApiRequestInit({
      headers: demoSessionHeaders,
      signal,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to fetch premium slots.'))
  }

  return premiumOwnerListResponseSchema.parse(payload)
}

export async function publishPremiumSlot(
  input: PublishPremiumSlotInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ slot: PremiumInterviewerSlot }> {
  const parsedInput = publishPremiumSlotInputSchema.parse(input)

  const response = await fetchImpl(
    createApiUrl('/api/premium/interviewer/slots'),
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
    throw new Error(readErrorMessage(payload, 'Unable to publish premium slot.'))
  }

  return { slot: premiumInterviewerSlotSchema.parse((payload as { slot: unknown }).slot) }
}

export async function cancelPremiumSlot(
  slotId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ success: true }> {
  const response = await fetchImpl(
    createApiUrl(`/api/premium/interviewer/slots/${slotId}`),
    createApiRequestInit({
      method: 'DELETE',
      headers: demoSessionHeaders,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to cancel premium slot.'))
  }

  return cancelPremiumSlotResponseSchema.parse(payload)
}
