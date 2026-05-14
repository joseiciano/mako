import { useQuery } from '@tanstack/react-query'
import type {
  AuthClientSessionData,
  AuthClientSession,
  AuthClientUser,
} from '@mako/shared-frontend'
import { authClient } from '../lib/auth-client'

type SessionPayload = AuthClientSessionData

export type UseAuthResult = {
  session: AuthClientSession | null
  user: AuthClientUser | null
  isPending: boolean
  isAuthenticated: boolean
  error: unknown
}

export const authSessionQueryKey = ['auth', 'session'] as const

function normalizeAuthError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message

    if (typeof message === 'string' && message.trim().length > 0) {
      return new Error(message)
    }
  }

  return new Error('Unable to verify authentication session.')
}

export async function fetchAuthSession(): Promise<SessionPayload | null> {
  const { data, error } = await authClient.getSession()

  if (error != null) {
    throw normalizeAuthError(error)
  }

  return (data as SessionPayload | null | undefined) ?? null
}

export function authSessionQueryOptions() {
  return {
    queryKey: authSessionQueryKey,
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 0,
  }
}

export function getAuthState(payload: SessionPayload | null | undefined) {
  return {
    session: payload?.session ?? null,
    user: payload?.user ?? null,
    isAuthenticated: payload?.session != null,
  }
}

export function useAuth(): UseAuthResult {
  const { data, error, isPending } = useQuery(authSessionQueryOptions())
  const authState = getAuthState(data)

  return {
    ...authState,
    isPending,
    error: error ?? null,
  }
}
