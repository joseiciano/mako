import { betterAuth } from 'better-auth'
import { createPostgresConnectionPool } from '../database/postgres-connection-pool'

export type BetterAuthSessionUser = {
  id: string
  email: string
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

export type CreateBetterAuthOptions = {
  connectionString: string
  secret: string
  baseURL: string
  trustedOrigins?: readonly string[]
}

const authCache = new Map<string, BetterAuthLike>()
export function createBetterAuth(options: CreateBetterAuthOptions): BetterAuthLike {
  const normalizedOptions = normalizeCreateBetterAuthOptions(options)
  const cacheKey = JSON.stringify(normalizedOptions)
  const cachedAuth = authCache.get(cacheKey)

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
    emailAndPassword: {
      enabled: true,
    },
    advanced: {
      database: {
        generateId: 'uuid',
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

  authCache.set(cacheKey, auth)
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
    trustedOrigins,
  }
}

function dedupeOrigins(origins: readonly string[]): string[] {
  return Array.from(new Set(origins))
}
