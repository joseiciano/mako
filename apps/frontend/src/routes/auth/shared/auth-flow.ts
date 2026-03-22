import type { QueryClient } from '@tanstack/react-query'
import { AUTH_SESSION_QUERY_KEY } from '#/hooks/use-auth'

export const AUTHENTICATED_REDIRECT_PATH = '/dashboard'
export const LOGGED_OUT_REDIRECT_PATH = '/auth/login'

type NavigateFn = (to: string) => Promise<void> | void

export async function handleAuthSuccess(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  navigate: NavigateFn,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY })
  await navigate(AUTHENTICATED_REDIRECT_PATH)
}

export async function handleSignOutSuccess(
  queryClient: Pick<QueryClient, 'setQueryData' | 'invalidateQueries'>,
  navigate: NavigateFn,
): Promise<void> {
  queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null)
  await queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY })
  await navigate(LOGGED_OUT_REDIRECT_PATH)
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}
