import type { Context, MiddlewareHandler } from 'hono'

export type AuthRateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export type AuthRateLimiters = {
  /** Credential endpoints: sign-in, sign-up, password and email changes. */
  credentials?: AuthRateLimiter
  /** Endpoints that send email: password reset and verification. */
  email?: AuthRateLimiter
}

export type AuthRateLimitOptions<Bindings extends Record<string, unknown>> = {
  getLimiters: (context: Context<{ Bindings: Bindings }>) => AuthRateLimiters
}

const credentialPrefixes = ['/sign-in', '/sign-up', '/change-password', '/change-email']
const emailPrefixes = ['/request-password-reset', '/send-verification-email', '/forget-password']
const authBasePath = '/api/auth'

type LimiterKind = keyof AuthRateLimiters

function classifyAuthPath(path: string): LimiterKind | null {
  const relativePath = path.startsWith(authBasePath) ? path.slice(authBasePath.length) : path

  if (credentialPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    return 'credentials'
  }
  if (emailPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    return 'email'
  }
  return null
}

/**
 * Throttles sensitive Better Auth endpoints with Cloudflare Rate Limiting bindings.
 * Counts are per Cloudflare location and approximate. A missing binding or client IP
 * passes the request through and logs a PII-free event; the IP is never logged.
 */
export function createAuthRateLimitMiddleware<Bindings extends Record<string, unknown>>(
  options: AuthRateLimitOptions<Bindings>,
): MiddlewareHandler<{ Bindings: Bindings }> {
  return async function authRateLimitMiddleware(c, next) {
    if (c.req.method !== 'POST') {
      return next()
    }

    const kind = classifyAuthPath(c.req.path)
    if (!kind) {
      return next()
    }

    const limiter = options.getLimiters(c)[kind]
    const ip = c.req.header('cf-connecting-ip')

    if (!limiter || !ip) {
      console.warn({ event: 'auth.rate_limit.skipped', kind, reason: limiter ? 'no_ip' : 'no_binding' })
      return next()
    }

    const { success } = await limiter.limit({ key: `${ip}:${c.req.path}` })
    if (!success) {
      return c.json({ message: 'Too many requests. Please try again later.' }, 429)
    }

    return next()
  }
}
