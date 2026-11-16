import { betterAuth } from 'better-auth'
import { createPostgresConnectionPool } from '../database/postgres-connection-pool'

export type BetterAuthSessionUser = {
  id: string
  email: string
  isAdmin: boolean
} & Record<string, unknown>

export type BetterAuthSessionState = Record<string, unknown>

export type BetterAuthSessionResult = {
  user: BetterAuthSessionUser
  session: BetterAuthSessionState
}

export type BetterAuthLike = {
  handler: (request: Request) => Response | Promise<Response>
  api: {
    getSession: (input: {
      headers: Headers
    }) => Promise<BetterAuthSessionResult | null>
  }
}

export type SendVerificationEmail = (input: {
  email: string
  url: string
}) => Promise<void>

const authCache = new Map<string, BetterAuthLike>()

export type CreateBetterAuthOptions = {
  connectionString: string
  secret: string
  baseURL: string
  requireEmailVerification: boolean
  trustedOrigins?: readonly string[]
  sendVerificationEmail?: SendVerificationEmail
}
export function createBetterAuth(options: CreateBetterAuthOptions): BetterAuthLike {
  const normalizedOptions = normalizeCreateBetterAuthOptions(options)

  // Options containing a request-scoped sendVerificationEmail callback must
  // never be cached: the callback closes over one Worker request's
  // execution context, and reusing it from another request would deliver
  // verification email work on the wrong request's lifetime. Session-only
  // (callback-free) options remain safely cacheable.
  const hasRequestScopedCallback = options.sendVerificationEmail !== undefined
  let cachedAuth: BetterAuthLike | undefined
  let cacheKey: string | undefined
  if (!hasRequestScopedCallback) {
    cacheKey = JSON.stringify(normalizedOptions)
    cachedAuth = authCache.get(cacheKey)
  }

  if (cachedAuth) {
    return cachedAuth
  }

  const pool = createPostgresConnectionPool(normalizedOptions.connectionString)
  const shouldUseSecureCookies =
    new URL(normalizedOptions.baseURL).protocol === 'https:'
  const auth = betterAuth({
    database: pool,
    secret: normalizedOptions.secret,
    baseURL: normalizedOptions.baseURL,
    basePath: '/api/auth',
    trustedOrigins: normalizedOptions.trustedOrigins
      ? [...normalizedOptions.trustedOrigins]
      : undefined,
    logger: {
      disabled: true,
    },
    user: {
      additionalFields: {
        isAdmin: {
          type: 'boolean',
          required: true,
          defaultValue: false,
          input: false,
          returned: true,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: normalizedOptions.requireEmailVerification,
    },
    emailVerification: {
      sendVerificationEmail: options.sendVerificationEmail
        ? function adaptSendVerificationEmail({ user, url }) {
            return options.sendVerificationEmail!({
              email: user.email,
              url,
            })
          }
        : undefined,
      expiresIn: 3600,
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
    },
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
      ...(shouldUseSecureCookies
        ? {
            useSecureCookies: true,
            defaultCookieAttributes: {
              sameSite: 'none',
              secure: true,
              partitioned: true,
            },
          }
        : {}),
    },
  }) as BetterAuthLike

  if (cacheKey !== undefined) {
    authCache.set(cacheKey, auth)
  }
  return auth
}


export function parseTrustedOrigins(value: string | undefined): string[] {
  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(',')
    .map(function trimOrigin(origin) {
      return origin.trim()
    })
    .filter(function hasOrigin(origin) {
      return origin.length > 0
    })
}

function normalizeCreateBetterAuthOptions(
  options: CreateBetterAuthOptions,
): CreateBetterAuthOptions {
  const trustedOrigins = dedupeOrigins([
    ...(options.trustedOrigins ?? []),
    new URL(options.baseURL).origin,
  ])

  return {
    connectionString: options.connectionString,
    secret: options.secret,
    baseURL: options.baseURL,
    requireEmailVerification: options.requireEmailVerification,
    trustedOrigins,
  }
}

function dedupeOrigins(origins: readonly string[]): string[] {
  return Array.from(new Set(origins))
}
