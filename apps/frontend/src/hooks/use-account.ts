import {
  accountProfileSchema,
  updateAccountProfileInputSchema,
  type AccountProfile,
  type UpdateAccountProfileInput,
} from '@mako/shared'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

const accountQueryKey = ['account'] as const

const demoSessionHeaders = {
  'x-user-id': 'demo-user',
  'x-user-email': 'demo@mako.dev',
}

export function useAccount(): UseQueryResult<AccountProfile, Error> {
  return useQuery({
    queryKey: accountQueryKey,
    queryFn: function getAccountQuery() {
      return fetchAccount()
    },
  })
}

export function useUpdateProfile(): UseMutationResult<
  AccountProfile,
  Error,
  UpdateAccountProfileInput
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function updateProfileMutation(input) {
      return updateAccountProfile(input)
    },
    onSuccess: function onSuccess(updatedAccount) {
      queryClient.setQueryData(accountQueryKey, updatedAccount)
    },
  })
}

export async function fetchAccount(
  fetchImpl: typeof fetch = fetch,
): Promise<AccountProfile> {
  const response = await fetchImpl('/api/account', {
    headers: demoSessionHeaders,
  })

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to fetch account profile.'))
  }

  return accountProfileSchema.parse(payload)
}

export async function updateAccountProfile(
  input: UpdateAccountProfileInput,
  fetchImpl: typeof fetch = fetch,
): Promise<AccountProfile> {
  const parsedInput = updateAccountProfileInputSchema.parse(input)
  const response = await fetchImpl('/api/account', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...demoSessionHeaders,
    },
    body: JSON.stringify(parsedInput),
  })

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to update profile.'))
  }

  return accountProfileSchema.parse(payload)
}

async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function readErrorMessage(payload: unknown, fallbackMessage: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallbackMessage
  }

  const maybeError = (payload as Record<string, unknown>).error
  if (typeof maybeError === 'string' && maybeError.length > 0) {
    return maybeError
  }

  return fallbackMessage
}
