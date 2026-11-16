import type { MiddlewareHandler } from 'hono'
import { AuthUnavailableError } from '../http/failure-classification'
import { getAuthUserFromContext, isAuthConfigured } from './auth-middleware'

export const requireAdmin: MiddlewareHandler = async function requireAdmin(
  c,
  next,
) {
  // No usable auth runtime is unavailability (503), not an unauthenticated request (401).
  if (!isAuthConfigured(c)) {
    throw new AuthUnavailableError()
  }

  const user = getAuthUserFromContext(c)

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (user.isAdmin !== true) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await next()
}
