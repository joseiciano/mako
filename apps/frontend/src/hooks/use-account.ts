import type {
  AccountResponse,
  DeleteAccountResponse,
  UpdateAccountRequest,
} from '@mako/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const ACCOUNT_QUERY_KEY = ['account'] as const

async function requestJson<TResponse>(
  url: string,
  init?: RequestInit,
): Promise<TResponse> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}.`)
  }

  return (await response.json()) as TResponse
}

export function useAccount() {
  return useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: function fetchAccount() {
      return requestJson<AccountResponse>('/api/account', {
        method: 'GET',
      })
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function updateProfile(payload: UpdateAccountRequest) {
      return requestJson<AccountResponse>('/api/account', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: async function onUpdateProfileSuccess() {
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
    },
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function deleteAccount() {
      return requestJson<DeleteAccountResponse>('/api/account', {
        method: 'DELETE',
      })
    },
    onSuccess: async function onDeleteAccountSuccess() {
      queryClient.removeQueries({ queryKey: ACCOUNT_QUERY_KEY })
      await queryClient.cancelQueries()
    },
  })
}
