import { createAuthClient } from 'better-auth/react'

export type CreateMakoAuthClientOptions = {
  baseURL?: string
}

export function createMakoAuthClient(options: CreateMakoAuthClientOptions = {}) {
  return createAuthClient({
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
  })
}

export const authClient = createMakoAuthClient()

type AuthClient = typeof authClient
type AuthSessionResult = Awaited<ReturnType<AuthClient['getSession']>>

export type AuthClientSessionData = AuthSessionResult['data']
export type AuthClientSession = NonNullable<AuthClientSessionData>['session']
export type AuthClientUser = NonNullable<AuthClientSessionData>['user']
