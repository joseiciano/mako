import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

export type CreateMakoAuthClientOptions = {
  baseURL?: string
}

/**
 * Mirrors the backend `user.additionalFields` config in
 * `packages/shared-backend/src/auth/auth-config.ts`. `isAdmin` is server-owned
 * and read-only for clients.
 */
const additionalUserFields = {
  user: {
    isAdmin: {
      type: 'boolean',
      required: true,
      defaultValue: false,
      input: false,
    },
  },
} as const

export function createMakoAuthClient(options: CreateMakoAuthClientOptions = {}) {
  return createAuthClient({
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    fetchOptions: {
      credentials: 'include',
    },
    plugins: [inferAdditionalFields(additionalUserFields)],
  })
}

export const authClient = createMakoAuthClient()

type AuthClient = typeof authClient
type AuthInferredSession = AuthClient['$Infer']['Session']

export type AuthClientSessionData = AuthInferredSession | null
export type AuthClientSession = AuthInferredSession['session']
export type AuthClientUser = AuthInferredSession['user']
