import { createAuthClient } from 'better-auth/react'

export type CreateMakoAuthClientOptions = {
  baseURL?: string
}

export function createMakoAuthClient(options: CreateMakoAuthClientOptions = {}) {
  return createAuthClient({
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    fetchOptions: {
      credentials: 'include',
    },
    // Better Auth's default redirect plugin performs a full-page
    // `window.location.href` navigation whenever a sign-in response echoes a
    // `callbackURL` (`redirect: true`). Our auth flow owns navigation through
    // TanStack Router (`handleAuthSuccess`), so that reload must not happen:
    // it aborts the SPA navigation and strands an authenticated user on
    // /login. The verification-link `callbackURL` we pass to sign-in is still
    // honored server-side for fresh verification emails.
    disableDefaultFetchPlugins: true,
  })
}

export const authClient = createMakoAuthClient()

type AuthClient = typeof authClient
type AuthSessionResult = Awaited<ReturnType<AuthClient['getSession']>>

export type AuthClientSessionData = AuthSessionResult['data']
export type AuthClientSession = NonNullable<AuthClientSessionData>['session']
export type AuthClientUser = NonNullable<AuthClientSessionData>['user']
