import {
  authClient,
  type AuthClientSession,
  type AuthClientSessionData,
  type AuthClientUser,
} from '@mako/shared-frontend'
import { queryOptions, useQuery } from '@tanstack/react-query'

export const authSessionQueryKey = ['auth', 'session'] as const

export async function fetchAuthSession(): Promise<AuthClientSessionData | null> {
  const response = await authClient.getSession()

  if (response.error) {
    throw new Error(response.error.message)
  }

  return response.data ?? null
}

export const authSessionQueryOptions = queryOptions({
  queryKey: authSessionQueryKey,
  queryFn: fetchAuthSession,
  staleTime: 60_000,
})

export type AuthState = {
  session: AuthClientSession | null
  user: AuthClientUser | null
  isAuthenticated: boolean
}

export function getAuthState(data: AuthClientSessionData | null): AuthState {
  if (!data) {
    return {
      session: null,
      user: null,
      isAuthenticated: false,
    }
  }

  return {
    session: data.session,
    user: data.user,
    isAuthenticated: true,
  }
}

export function useAuth() {
  const query = useQuery(authSessionQueryOptions)
  const authState = getAuthState(query.data ?? null)

  return {
    ...query,
    ...authState,
  }
}
