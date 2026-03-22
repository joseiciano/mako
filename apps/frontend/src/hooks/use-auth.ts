import {
  authClient,
  type AuthSessionPayload,
  type AuthUser,
} from '@mako/shared-frontend'
import { useQuery } from '@tanstack/react-query'

export const AUTH_SESSION_QUERY_KEY = ['auth', 'session'] as const

type UseAuthResult = {
  user: AuthUser | null
  session: AuthSessionPayload['session'] | null
  isAuthenticated: boolean
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => Promise<unknown>
}

export function useAuth(): UseAuthResult {
  const query = useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: function getSession() {
      return authClient.getSession()
    },
    staleTime: 60_000,
    retry: false,
  })

  const sessionPayload = query.data ?? null

  return {
    user: sessionPayload?.user ?? null,
    session: sessionPayload?.session ?? null,
    isAuthenticated: sessionPayload !== null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  }
}
