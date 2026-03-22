import type { HealthResponse } from '@mako/shared'
export {
  authClient,
  AuthClientError,
  createAuthClient,
} from './auth/auth-client'
export type {
  AuthSession,
  AuthSessionPayload,
  AuthUser,
  SignInWithEmailInput,
  SignUpWithEmailInput,
} from './auth/auth-client'

export function formatHealthLabel(response: HealthResponse): string {
  return `${response.service} • ${response.status}`
}
