import type { Context, MiddlewareHandler } from 'hono'
import type { AccountSession } from '../account/types'
import type {
  BetterAuthLike,
  BetterAuthSessionResult,
  BetterAuthSessionState,
  BetterAuthSessionUser,
} from './auth-config'

const authConfiguredContextKey = 'betterAuthConfigured'
const authUserContextKey = 'betterAuthUser'
const authSessionContextKey = 'betterAuthSession'
const accountSessionContextKey = 'betterAuthAccountSession'

type MiddlewareBindings = Record<string, unknown>

export type AuthSessionMiddlewareOptions<Bindings extends MiddlewareBindings> = {
  getAuth: (
    context: Context<{ Bindings: Bindings }>,
  ) => BetterAuthLike | Promise<BetterAuthLike | null> | null
}

export function createAuthSessionMiddleware<Bindings extends MiddlewareBindings>(
  options: AuthSessionMiddlewareOptions<Bindings>,
): MiddlewareHandler<{ Bindings: Bindings }> {
  return async function authSessionMiddleware(c, next) {
    const auth = await options.getAuth(c)

    if (!auth) {
      setAuthContext(c, {
        configured: false,
        authSession: null,
      })
      await next()
      return
    }

    const authSession = await auth.api.getSession({
      headers: c.req.raw.headers,
    })

    setAuthContext(c, {
      configured: true,
      authSession,
    })

    await next()
  }
}

export function isAuthConfigured(context: Context): boolean {
  return context.get(authConfiguredContextKey) === true
}

export function getAuthUserFromContext(
  context: Context,
): BetterAuthSessionUser | null {
  const user = context.get(authUserContextKey)

  if (!isBetterAuthSessionUser(user)) {
    return null
  }

  // Fail closed: a missing or non-boolean flag is never trusted as admin.
  return { ...user, isAdmin: user.isAdmin === true }
}

export function getAuthSessionFromContext(
  context: Context,
): BetterAuthSessionState | null {
  const session = context.get(authSessionContextKey)

  if (!isBetterAuthSessionState(session)) {
    return null
  }

  return session
}

export function getAccountSessionFromAuthContext(
  context: Context,
): AccountSession | null {
  const session = context.get(accountSessionContextKey)

  if (!isAccountSession(session)) {
    return null
  }

  return session
}

function setAuthContext(
  context: Context,
  input: {
    configured: boolean
    authSession: BetterAuthSessionResult | null
  },
): void {
  context.set(authConfiguredContextKey, input.configured)
  context.set(authUserContextKey, input.authSession?.user ?? null)
  context.set(authSessionContextKey, input.authSession?.session ?? null)
  context.set(
    accountSessionContextKey,
    input.authSession
      ? {
          userId: input.authSession.user.id,
          email: input.authSession.user.email,
        }
      : null,
  )
}

function isBetterAuthSessionUser(input: unknown): input is BetterAuthSessionUser {
  return (
    typeof input === 'object' &&
    input !== null &&
    'id' in input &&
    typeof input.id === 'string' &&
    'email' in input &&
    typeof input.email === 'string'
  )
}

function isBetterAuthSessionState(input: unknown): input is BetterAuthSessionState {
  return typeof input === 'object' && input !== null
}

function isAccountSession(input: unknown): input is AccountSession {
  return (
    typeof input === 'object' &&
    input !== null &&
    'userId' in input &&
    typeof input.userId === 'string' &&
    'email' in input &&
    typeof input.email === 'string'
  )
}
