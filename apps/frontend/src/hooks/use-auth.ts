import { authClient } from '../lib/auth-client'

type SessionPayload = {
  session: unknown
  user: unknown
}

export type UseAuthResult = {
  session: unknown | null
  user: unknown | null
  isPending: boolean
  isAuthenticated: boolean
  error: unknown
}

export function getAuthState(payload: SessionPayload | null | undefined) {
  return {
    session: payload?.session ?? null,
    user: payload?.user ?? null,
    isAuthenticated: payload?.session != null,
  }
}

export function useAuth(): UseAuthResult {
  const { data, error, isPending } = authClient.useSession()
  const authState = getAuthState(data as SessionPayload | null | undefined)

  return {
    ...authState,
    isPending,
    error: error ?? null,
  }
}
