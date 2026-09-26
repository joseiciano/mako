import type { QueryClient } from '@tanstack/react-query'
import {
  accountCompaniesQueryKey,
  accountQueryKey,
} from '#/hooks/use-account'
import { interviewsQueryRootKey } from '#/hooks/use-interviews'
import { authSessionQueryKey } from '#/hooks/use-auth'

export const AUTHENTICATED_REDIRECT_PATH = '/dashboard'
export const LOGGED_OUT_REDIRECT_PATH = '/login'

type NavigateFn = (to: string) => Promise<void> | void

type AuthResult = {
  error?: unknown
}

export async function handleAuthSuccess(
  queryClient: QueryClient,
  navigate: NavigateFn,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: authSessionQueryKey })
  await navigate(AUTHENTICATED_REDIRECT_PATH)
}

export async function handleSignOutSuccess(
  queryClient: QueryClient,
  navigate: NavigateFn,
): Promise<void> {
  queryClient.setQueryData(authSessionQueryKey, null)
  await queryClient.cancelQueries({ queryKey: accountQueryKey })
  await queryClient.cancelQueries({ queryKey: accountCompaniesQueryKey })
  await queryClient.cancelQueries({ queryKey: interviewsQueryRootKey })
  queryClient.removeQueries({ queryKey: accountQueryKey })
  queryClient.removeQueries({ queryKey: accountCompaniesQueryKey })
  queryClient.removeQueries({ queryKey: interviewsQueryRootKey })
  await navigate(LOGGED_OUT_REDIRECT_PATH)
}

export class AuthFlowError extends Error {
  readonly code?: string
  readonly status?: number

  constructor(
    message: string,
    details: { code?: string; status?: number } = {},
  ) {
    super(message)
    this.name = 'AuthFlowError'
    this.code = details.code
    this.status = details.status
  }
}

export function throwIfAuthResultHasError(result: AuthResult): void {
  if (result.error == null) {
    return
  }

  if (typeof result.error === 'object' && result.error !== null) {
    const { code, message, status } = result.error as {
      code?: unknown
      message?: unknown
      status?: unknown
    }

    throw new AuthFlowError(
      typeof message === 'string' && message.trim().length > 0
        ? message
        : 'Something went wrong. Please try again.',
      {
        code: typeof code === 'string' ? code : undefined,
        status: typeof status === 'number' ? status : undefined,
      },
    )
  }

  throw new AuthFlowError(getAuthErrorMessage(result.error))
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message

    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }

  return 'Something went wrong. Please try again.'
}
