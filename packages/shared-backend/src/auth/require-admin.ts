import type { MiddlewareHandler } from 'hono'
import { getAuthUserFromContext } from './auth-middleware'

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
