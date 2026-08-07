import {
  creditTransactionHistoryResponseSchema,
  defaultCreditTransactionHistoryLimit,
  type CreditTransactionHistoryResponse,
} from '@mako/shared'
import {
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  createApiRequestInit,
  createApiUrl,
  demoSessionHeaders,
  parseResponse,
  readErrorMessage,
} from '../lib/http-transport'

export const transactionHistoryQueryKey = ['account', 'transactions'] as const

export function useTransactionHistory(): UseQueryResult<
  CreditTransactionHistoryResponse,
  Error
> {
  return useQuery({
    queryKey: transactionHistoryQueryKey,
    queryFn: function getTransactionHistoryQuery({ signal }) {
      return fetchTransactionHistory(fetch, signal)
    },
  })
}

export async function fetchTransactionHistory(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
  limit = defaultCreditTransactionHistoryLimit,
  offset = 0,
): Promise<CreditTransactionHistoryResponse> {
  const query = new URLSearchParams()
  query.set('limit', String(limit))
  query.set('offset', String(offset))

  const response = await fetchImpl(
    createApiUrl(`/api/account/transactions?${query.toString()}`),
    createApiRequestInit({
      headers: demoSessionHeaders,
      signal,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(
      readErrorMessage(payload, 'Unable to load transaction history.'),
    )
  }

  return creditTransactionHistoryResponseSchema.parse(payload)
}
