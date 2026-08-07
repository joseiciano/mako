import type {
  DeleteAccountResponse,
  EmploymentRecordCompatibilityResponse,
  EmploymentRecordInput,
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
  createApiRequestInit,
  createApiUrl,
  demoSessionHeaders,
  parseResponse,
  readErrorMessage,
} from '../lib/http-transport'

type CompaniesResponse = {
  companies: EmploymentRecordCompatibilityResponse[]
}

export type AddCompanyResponse = {
  company: EmploymentRecordCompatibilityResponse
}

export type UpdateCompanyPayload = { id: string } & EmploymentRecordInput

export type UpdateCompanyResponse = {
  company: EmploymentRecordCompatibilityResponse
}

type MutationContext = {
  previousCompanies: EmploymentRecordCompatibilityResponse[]
  optimisticCompanyId: string
}

export const accountQueryKey = ['account'] as const
export const accountCompaniesQueryKey = ['account', 'companies'] as const

export function useAccount(): UseQueryResult<AccountProfile, Error> {
  return useQuery({
    queryKey: accountQueryKey,
    queryFn: function getAccountQuery({ signal }) {
      return fetchAccount(fetch, signal)
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

export function useCompanies(): UseQueryResult<EmploymentRecordCompatibilityResponse[], Error> {
  return useQuery({
    queryKey: accountCompaniesQueryKey,
    queryFn: function getCompaniesQuery({ signal }) {
      return fetchCompanies(fetch, signal)
    },
  })
}

export function useAddCompany(): UseMutationResult<
  AddCompanyResponse,
  Error,
  EmploymentRecordInput,
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
        queryClient.getQueryData<EmploymentRecordCompatibilityResponse[]>(
          accountCompaniesQueryKey,
        ) ?? []
      const optimisticCompany = createOptimisticCompany(nextCompanyPayload)

      queryClient.setQueryData<EmploymentRecordCompatibilityResponse[]>(
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
      queryClient.setQueryData<EmploymentRecordCompatibilityResponse[]>(
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

export function useUpdateCompany(): UseMutationResult<
  UpdateCompanyResponse,
  Error,
  UpdateCompanyPayload,
  MutationContext
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function updateCompanyMutation(payload) {
      return patchCompany(payload)
    },
    onMutate: async function onMutate(payload) {
      await queryClient.cancelQueries({ queryKey: accountCompaniesQueryKey })

      const previousCompanies =
        queryClient.getQueryData<EmploymentRecordCompatibilityResponse[]>(
          accountCompaniesQueryKey,
        ) ?? []

      queryClient.setQueryData<EmploymentRecordCompatibilityResponse[]>(
        accountCompaniesQueryKey,
        function setData(companies) {
          return (companies ?? []).map(function updateOptimistic(company) {
            if (company.id === payload.id) {
              return {
                ...company,
                company: payload.company,
                role: payload.role,
                start: payload.start,
                end: payload.end,
                isComplete: true,
                updatedAt: new Date().toISOString(),
              }
            }

            return company
          })
        },
      )

      return {
        previousCompanies,
        optimisticCompanyId: payload.id,
      }
    },
    onError: function onError(_error, _variables, context) {
      if (!context) {
        return
      }

      queryClient.setQueryData(accountCompaniesQueryKey, context.previousCompanies)
    },
    onSettled: async function onSettled() {
      await queryClient.invalidateQueries({ queryKey: accountCompaniesQueryKey })
    },
  })
}

export function useDeleteCompany(): UseMutationResult<
  { success: true },
  Error,
  string,
  { previousCompanies: EmploymentRecordCompatibilityResponse[] }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: function deleteCompanyMutation(companyId) {
      return deleteCompanyRecord(companyId)
    },
    onMutate: async function onMutate(companyId) {
      await queryClient.cancelQueries({ queryKey: accountCompaniesQueryKey })

      const previousCompanies =
        queryClient.getQueryData<EmploymentRecordCompatibilityResponse[]>(
          accountCompaniesQueryKey,
        ) ?? []

      queryClient.setQueryData<EmploymentRecordCompatibilityResponse[]>(
        accountCompaniesQueryKey,
        function setData(companies) {
          return (companies ?? []).filter(function removeDeleted(company) {
            return company.id !== companyId
          })
        },
      )

      return { previousCompanies }
    },
    onError: function onError(_error, _variables, context) {
      if (!context) {
        return
      }

      queryClient.setQueryData(accountCompaniesQueryKey, context.previousCompanies)
    },
    onSettled: async function onSettled() {
      await queryClient.invalidateQueries({ queryKey: accountCompaniesQueryKey })
    },
  })
}

export async function fetchAccount(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AccountProfile> {
  const response = await fetchImpl(
    createApiUrl('/api/account'),
    createApiRequestInit({
      headers: demoSessionHeaders,
      signal,
    }),
  )

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
  const response = await fetchImpl(
    createApiUrl('/api/account'),
    createApiRequestInit({
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...demoSessionHeaders,
      },
      body: JSON.stringify(parsedInput),
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to update profile.'))
  }

  return accountProfileSchema.parse(payload)
}

export async function fetchCompanies(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<EmploymentRecordCompatibilityResponse[]> {
  const response = await fetchImpl(
    createApiUrl('/api/companies'),
    createApiRequestInit({
      method: 'GET',
      headers: demoSessionHeaders,
      signal,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Failed to fetch companies'))
  }

  return (payload as CompaniesResponse).companies
}

export async function postCompany(
  payload: EmploymentRecordInput,
  fetchImpl: typeof fetch = fetch,
): Promise<AddCompanyResponse> {
  const response = await fetchImpl(
    createApiUrl('/api/companies'),
    createApiRequestInit({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...demoSessionHeaders,
      },
      body: JSON.stringify({
        company: payload.company,
        role: payload.role,
        start: payload.start,
        end: payload.end,
      }),
    }),
  )

  const responsePayload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, 'Failed to add company'))
  }

  return responsePayload as AddCompanyResponse
}

export async function patchCompany(
  payload: UpdateCompanyPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateCompanyResponse> {
  const { id, ...body } = payload

  const response = await fetchImpl(
    createApiUrl(`/api/companies/${id}`),
    createApiRequestInit({
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...demoSessionHeaders,
      },
      body: JSON.stringify(body),
    }),
  )

  const responsePayload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, 'Failed to update company'))
  }

  return responsePayload as UpdateCompanyResponse
}

export async function deleteCompanyRecord(
  companyId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ success: true }> {
  const response = await fetchImpl(
    createApiUrl(`/api/companies/${companyId}`),
    createApiRequestInit({
      method: 'DELETE',
      headers: demoSessionHeaders,
    }),
  )

  const responsePayload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, 'Failed to delete company'))
  }

  return responsePayload as { success: true }
}

export function createOptimisticCompany(
  payload: EmploymentRecordInput,
): EmploymentRecordCompatibilityResponse {
  const now = new Date().toISOString()

  return {
    id: `optimistic-${crypto.randomUUID()}`,
    userId: 'optimistic-user',
    company: payload.company,
    role: payload.role,
    start: payload.start,
    end: payload.end,
    isComplete: true,
    createdAt: now,
    updatedAt: now,
    joined: new Date(`${payload.start}T00:00:00.000Z`).toISOString(),
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
  const response = await fetchImpl(
    createApiUrl('/api/account'),
    createApiRequestInit({
      method: 'DELETE',
      headers: demoSessionHeaders,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to delete account.'))
  }

  return payload as DeleteAccountResponse
}
