import type {
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  CreditPackageListResponse,
} from '@mako/shared'
import {
  createPaymentIntentRequestSchema,
  createPaymentIntentResponseSchema,
  creditPackageListResponseSchema,
} from '@mako/shared'
import {
  useMutation,
  useQuery,
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

export const creditPackagesQueryKey = ['payments', 'packages'] as const

export function useCreditPackages(): UseQueryResult<
  CreditPackageListResponse,
  Error
> {
  return useQuery({
    queryKey: creditPackagesQueryKey,
    queryFn: function getCreditPackagesQuery({ signal }) {
      return fetchCreditPackages(fetch, signal)
    },
  })
}

export function useCreatePaymentIntent(): UseMutationResult<
  CreatePaymentIntentResponse,
  Error,
  CreatePaymentIntentRequest
> {
  return useMutation({
    mutationFn: function createPaymentIntentMutation(payload) {
      return createPaymentIntent(payload)
    },
  })
}

export async function fetchCreditPackages(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<CreditPackageListResponse> {
  const response = await fetchImpl(
    createApiUrl('/api/payments/packages'),
    createApiRequestInit({
      headers: demoSessionHeaders,
      signal,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(
      readErrorMessage(payload, 'Unable to load credit packages.'),
    )
  }

  return creditPackageListResponseSchema.parse(payload)
}

export async function createPaymentIntent(
  payload: CreatePaymentIntentRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatePaymentIntentResponse> {
  const parsedPayload = createPaymentIntentRequestSchema.parse(payload)

  const response = await fetchImpl(
    createApiUrl('/api/payments/create-intent'),
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
      readErrorMessage(responsePayload, 'Unable to start your purchase.'),
    )
  }

  return createPaymentIntentResponseSchema.parse(responsePayload)
}
