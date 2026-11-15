import {
  adminDecisionBodySchema,
  adminDetailResponseSchema,
  adminListResponseSchema,
  type AdminApplicationDetail,
  type AdminDecision,
  type AdminListQuery,
  type AdminListResponse,
} from '@mako/shared'
import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  ApiError,
  createApiRequestInit,
  createApiUrl,
  parseResponse,
  readErrorMessage,
} from '../lib/http-transport'

const UNEXPECTED_RESPONSE_MESSAGE = 'Received an unexpected response from the server.'
const GENERIC_ERROR_MESSAGE = 'Something went wrong.'

export function getAdminErrorStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined
}

// Only ApiError messages are written for display; anything else gets a fixed message.
export function getAdminErrorMessage(error: unknown): string | null {
  if (error == null) {
    return null
  }

  return error instanceof ApiError ? error.message : GENERIC_ERROR_MESSAGE
}

function parseAdminResponse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, payload: unknown): T {
  const result = schema.safeParse(payload)

  if (!result.success) {
    throw new ApiError(UNEXPECTED_RESPONSE_MESSAGE)
  }

  return result.data
}

export const adminApplicationsQueryRootKey = ['admin', 'applications'] as const

// Prefix shared by every list variant so one invalidation covers all of them.
export const adminApplicationsListQueryRootKey = [
  ...adminApplicationsQueryRootKey,
  'list',
] as const

export function adminApplicationsListQueryKey(query: AdminListQuery) {
  return [
    ...adminApplicationsListQueryRootKey,
    { status: query.status, limit: query.limit, offset: query.offset },
  ] as const
}

export function adminApplicationDetailQueryKey(applicationId: string) {
  return [...adminApplicationsQueryRootKey, 'detail', applicationId] as const
}

// Authorization failures (401/403) and conflicts are never retried: they will
// not resolve by themselves and must surface immediately.
function shouldRetryAdminRequest(failureCount: number, error: Error): boolean {
  const status = getAdminErrorStatus(error)

  if (status !== undefined && status < 500) {
    return false
  }

  return failureCount < 1
}

export function useAdminApplications(
  query: AdminListQuery,
): UseQueryResult<AdminListResponse, Error> {
  return useQuery({
    queryKey: adminApplicationsListQueryKey(query),
    queryFn: function getAdminApplicationsQuery({ signal }) {
      return fetchAdminApplications(query, fetch, signal)
    },
    retry: shouldRetryAdminRequest,
    refetchOnWindowFocus: false,
  })
}

export function useAdminApplicationDetail(
  applicationId: string | null,
): UseQueryResult<AdminApplicationDetail, Error> {
  return useQuery({
    queryKey: adminApplicationDetailQueryKey(applicationId ?? ''),
    queryFn: function getAdminApplicationQuery({ signal }) {
      return fetchAdminApplication(applicationId as string, fetch, signal)
    },
    enabled: applicationId !== null,
    retry: shouldRetryAdminRequest,
    refetchOnWindowFocus: false,
  })
}

export type DecideAdminApplicationInput = {
  applicationId: string
  decision: AdminDecision
}

export function useDecideAdminApplication(): UseMutationResult<
  AdminApplicationDetail,
  Error,
  DecideAdminApplicationInput
> {
  return useMutation({
    mutationFn: function decideApplicationMutation(input) {
      return decideAdminApplication(input.applicationId, input.decision)
    },
    retry: false,
  })
}

async function readAdminPayload(response: Response, fallbackMessage: string): Promise<unknown> {
  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new ApiError(readErrorMessage(payload, fallbackMessage), response.status)
  }

  return payload
}

export async function fetchAdminApplications(
  query: AdminListQuery,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AdminListResponse> {
  const params = new URLSearchParams({
    status: query.status,
    limit: String(query.limit),
    offset: String(query.offset),
  })

  const response = await fetchImpl(
    createApiUrl(`/api/admin/applications?${params.toString()}`),
    createApiRequestInit({ signal }),
  )

  const payload = await readAdminPayload(response, 'Unable to load applications.')

  return parseAdminResponse(adminListResponseSchema, payload)
}

export async function fetchAdminApplication(
  applicationId: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AdminApplicationDetail> {
  const response = await fetchImpl(
    createApiUrl(`/api/admin/applications/${encodeURIComponent(applicationId)}`),
    createApiRequestInit({ signal }),
  )

  const payload = await readAdminPayload(response, 'Unable to load the application.')

  return parseAdminResponse(adminDetailResponseSchema, payload).application
}

export async function decideAdminApplication(
  applicationId: string,
  decision: AdminDecision,
  fetchImpl: typeof fetch = fetch,
): Promise<AdminApplicationDetail> {
  // Only the decision is sent; no rejection reason or note is collected.
  const body = adminDecisionBodySchema.parse({ decision })

  const response = await fetchImpl(
    createApiUrl(`/api/admin/applications/${encodeURIComponent(applicationId)}`),
    createApiRequestInit({
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

  const payload = await readAdminPayload(response, 'Unable to submit the decision.')

  return parseAdminResponse(adminDetailResponseSchema, payload).application
}
