import type {
  DeleteAccountResponse,
} from '@mako/shared'
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
import {
  demoSessionHeaders,
  parseResponse,
  readErrorMessage,
} from '../lib/http-transport'

export type Company = {
  id: string
  userId: string
  company: string
  joined: string
  createdAt: string
  updatedAt: string
}

export type AddCompanyPayload = {
  company: string
  joined: string
}

type CompaniesResponse = {
  companies: Company[]
}

type AddCompanyResponse = {
  company: Company
}

type MutationContext = {
  previousCompanies: Company[]
  optimisticCompanyId: string
}

const accountQueryKey = ['account'] as const
export const accountCompaniesQueryKey = ['account', 'companies'] as const

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

export function useCompanies(): UseQueryResult<Company[], Error> {
  return useQuery({
    queryKey: accountCompaniesQueryKey,
    queryFn: function getCompaniesQuery() {
      return fetchCompanies()
    },
  })
}

export function useAddCompany(): UseMutationResult<
  AddCompanyResponse,
  Error,
  AddCompanyPayload,
  MutationContext
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function addCompanyMutation(payload) {
      return postCompany(payload)
    },
    onMutate: async function onMutate(nextCompanyPayload) {
      await queryClient.cancelQueries({ queryKey: accountCompaniesQueryKey })

      const previousCompanies =
        queryClient.getQueryData<Company[]>(accountCompaniesQueryKey) ?? []
      const optimisticCompany = createOptimisticCompany(nextCompanyPayload)

      queryClient.setQueryData<Company[]>(
        accountCompaniesQueryKey,
        function setData(companies) {
          return [optimisticCompany, ...(companies ?? [])]
        },
      )

      return {
        previousCompanies,
        optimisticCompanyId: optimisticCompany.id,
      }
    },
    onError: function onError(_error, _variables, context) {
      if (!context) {
        return
      }

      queryClient.setQueryData(accountCompaniesQueryKey, context.previousCompanies)
    },
    onSuccess: function onSuccess(response, _variables, context) {
      queryClient.setQueryData<Company[]>(
        accountCompaniesQueryKey,
        function setData(companies) {
          if (!companies) {
            return [response.company]
          }

          const didReplaceOptimisticRecord = context
            ? companies.some(function hasOptimisticId(company) {
                return company.id === context.optimisticCompanyId
              })
            : false

          if (!didReplaceOptimisticRecord) {
            return [response.company, ...companies]
          }

          return companies.map(function replaceOptimisticRecord(company) {
            if (company.id === context?.optimisticCompanyId) {
              return response.company
            }

            return company
          })
        },
      )
    },
    onSettled: async function onSettled() {
      await queryClient.invalidateQueries({ queryKey: accountCompaniesQueryKey })
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

export async function fetchCompanies(
  fetchImpl: typeof fetch = fetch,
): Promise<Company[]> {
  const response = await fetchImpl('/api/companies', {
    method: 'GET',
    headers: demoSessionHeaders,
  })

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Failed to fetch companies'))
  }

  return (payload as CompaniesResponse).companies
}

export async function postCompany(
  payload: AddCompanyPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<AddCompanyResponse> {
  const response = await fetchImpl('/api/companies', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...demoSessionHeaders,
    },
    body: JSON.stringify({
      company: payload.company,
      joined: payload.joined,
    }),
  })

  const responsePayload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, 'Failed to add company'))
  }

  return responsePayload as AddCompanyResponse
}

export function createOptimisticCompany(payload: AddCompanyPayload): Company {
  const normalizedCompany = payload.company.trim().toLowerCase()
  const normalizedJoined = new Date(payload.joined).toISOString()

  return {
    id: `optimistic-${crypto.randomUUID()}`,
    userId: 'optimistic-user',
    company: normalizedCompany,
    joined: normalizedJoined,
    createdAt: normalizedJoined,
    updatedAt: normalizedJoined,
  }
}

export function useDeleteAccount(): UseMutationResult<
  DeleteAccountResponse,
  Error,
  void
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function deleteAccountMutation() {
      return deleteAccount()
    },
    onSuccess: async function onDeleteSuccess() {
      queryClient.removeQueries({ queryKey: accountQueryKey })
      queryClient.removeQueries({ queryKey: accountCompaniesQueryKey })
      await queryClient.cancelQueries()
    },
  })
}

export async function deleteAccount(
  fetchImpl: typeof fetch = fetch,
): Promise<DeleteAccountResponse> {
  const response = await fetchImpl('/api/account', {
    method: 'DELETE',
    headers: demoSessionHeaders,
  })

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to delete account.'))
  }

  return payload as DeleteAccountResponse
}
