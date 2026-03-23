import { authClient } from '../lib/auth-client'

type SessionPayload = {
  session: unknown
  user: unknown
}

export type UseAuthResult = {
  session: unknown | null
  user: unknown | null
  isPending: boolean
  error: unknown
}

export function useAuth(): UseAuthResult {
  const { data, error, isPending } = authClient.useSession()
  const sessionPayload = data as SessionPayload | null | undefined

  return {
    session: sessionPayload?.session ?? null,
    user: sessionPayload?.user ?? null,
    isPending,
    error: error ?? null,
  }
}
