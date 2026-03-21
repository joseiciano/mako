import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

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

export const accountCompaniesQueryKey = ['account', 'companies'] as const

export function useCompanies(): UseQueryResult<Company[]> {
  return useQuery({
    queryKey: accountCompaniesQueryKey,
    queryFn: fetchCompanies,
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
    mutationFn: postCompany,
    onMutate: async function onMutate(nextCompanyPayload) {
      await queryClient.cancelQueries({ queryKey: accountCompaniesQueryKey })

      const previousCompanies =
        queryClient.getQueryData<Company[]>(accountCompaniesQueryKey) ?? []
      const optimisticCompany = createOptimisticCompany(nextCompanyPayload)

      queryClient.setQueryData<Company[]>(accountCompaniesQueryKey, function setData(
        companies,
      ) {
        return [optimisticCompany, ...(companies ?? [])]
      })

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
      queryClient.setQueryData<Company[]>(accountCompaniesQueryKey, function setData(
        companies,
      ) {
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
      })
    },
    onSettled: async function onSettled() {
      await queryClient.invalidateQueries({ queryKey: accountCompaniesQueryKey })
    },
  })
}

export async function fetchCompanies(): Promise<Company[]> {
  const response = await fetch('/api/companies', {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error('Failed to fetch companies')
  }

  const payload = (await response.json()) as CompaniesResponse
  return payload.companies
}

export async function postCompany(
  payload: AddCompanyPayload,
): Promise<AddCompanyResponse> {
  const response = await fetch('/api/companies', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      company: payload.company,
      joined: payload.joined,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to add company')
  }

  return (await response.json()) as AddCompanyResponse
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
