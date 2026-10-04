import type { MiddlewareHandler } from 'hono'
import { getAuthUserFromContext } from './auth-middleware'

/**
 * Guards a route so only admins pass. Reads the canonical session user already
 * resolved by the auth session middleware (no separate Better Auth lookup).
 * Fails closed: 401 when unauthenticated, 403 unless `isAdmin === true`.
 */
export const requireAdmin: MiddlewareHandler = async function requireAdmin(
  c,
  next,
) {
  const user = getAuthUserFromContext(c)

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (user.isAdmin !== true) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await next()
}
