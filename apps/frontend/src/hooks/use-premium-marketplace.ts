import {
  premiumClaimParamsSchema,
  premiumClaimResponseSchema,
  premiumMarketplaceResponseSchema,
  type PremiumClaimResponse,
  type PremiumMarketplaceResponse,
  type PremiumMarketplaceSlot,
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
import { accountQueryKey } from './use-account'
import { interviewsQueryRootKey } from './use-interviews'
import { isUuid } from '../lib/validation'

export const premiumMarketplaceQueryKey = ['premium', 'marketplace', 'system_design'] as const

export type ClaimPremiumSlotInput = {
  slotId: string
  idempotencyKey: string
  signal?: AbortSignal
}

/**
 * Structured claim failure carrying the backend's machine-readable
 * `payload.error` code separately from the human display message. Consumers
 * classify outcomes from `code` so classification never depends on message
 * formatting.
 */
export class PremiumClaimError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'PremiumClaimError'
    this.code = code
  }
}

export function usePremiumMarketplace(
  options: { enabled?: boolean } = {},
): UseQueryResult<PremiumMarketplaceResponse, Error> {
  return useQuery({
    queryKey: premiumMarketplaceQueryKey,
    queryFn: function getPremiumMarketplaceQuery({ signal }) {
      return fetchPremiumMarketplace(fetch, signal)
    },
    enabled: options.enabled,
  })
}

export function useClaimPremiumSlot(): UseMutationResult<
  PremiumClaimResponse,
  Error,
  ClaimPremiumSlotInput
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function claimPremiumSlotMutation(input) {
      return claimPremiumSlot(input)
    },
    onSuccess: async function onClaimSuccess() {
      await queryClient.invalidateQueries({ queryKey: premiumMarketplaceQueryKey })
      await queryClient.invalidateQueries({ queryKey: interviewsQueryRootKey })
      await queryClient.invalidateQueries({ queryKey: accountQueryKey })
    },
  })
}

export async function fetchPremiumMarketplace(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<PremiumMarketplaceResponse> {
  const url = createApiUrl('/api/premium/marketplace?interviewType=system_design')
  const response = await fetchImpl(
    url,
    createApiRequestInit({
      headers: demoSessionHeaders,
      signal,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to fetch premium marketplace.'))
  }

  return premiumMarketplaceResponseSchema.parse(payload)
}

export async function claimPremiumSlot(
  input: ClaimPremiumSlotInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PremiumClaimResponse> {
  const parsedParams = premiumClaimParamsSchema.parse({ id: input.slotId })

  if (!isUuid(input.idempotencyKey)) {
    throw new Error('Idempotency-Key must be a valid UUID.')
  }

  const response = await fetchImpl(
    createApiUrl(`/api/premium/marketplace/slots/${parsedParams.id}/claim`),
    createApiRequestInit({
      method: 'POST',
      headers: {
        'Idempotency-Key': input.idempotencyKey,
        ...demoSessionHeaders,
      },
      signal: input.signal,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    const fallbackMessage = 'Unable to claim premium slot.'
    const machineCode =
      payload !== null &&
      typeof payload === 'object' &&
      typeof (payload as Record<string, unknown>).error === 'string'
        ? ((payload as Record<string, unknown>).error as string)
        : fallbackMessage
    throw new PremiumClaimError(
      readErrorMessage(payload, fallbackMessage),
      machineCode,
    )
  }

  return premiumClaimResponseSchema.parse(payload)
}

/**
 * Deterministic, safe ordering for marketplace slots. Mirrors the backend
 * `ORDER BY start_time ASC, id ASC` guarantee on the client: sorts by
 * startTime ascending, breaking ties by slotId so the order is fully
 * deterministic regardless of the incoming array order. Never mutates the
 * input array.
 */
export function sortMarketplaceSlots(
  slots: readonly PremiumMarketplaceSlot[],
): PremiumMarketplaceSlot[] {
  return [...slots].sort(function compareMarketplaceSlots(a, b) {
    const startTimeOrder = a.startTime.localeCompare(b.startTime)
    if (startTimeOrder !== 0) {
      return startTimeOrder
    }

    return a.slotId.localeCompare(b.slotId)
  })
}
