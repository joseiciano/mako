import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { classifyFailure } from './failure-classification'

/**
 * Hono `onError` handler. Fails closed: auth/session and database unavailability
 * return 503 (never a demo authorization fallback); everything else is 500.
 */
export function handleUnexpectedError(error: Error, c: Context): Response {
  // Failures raised before an admin route's own middleware (e.g. session lookup)
  // must still be uncacheable.
  if (c.req.path.startsWith('/api/admin/')) {
    c.header('Cache-Control', 'private, no-store')
  }

  if (error instanceof HTTPException) {
    return error.getResponse()
  }

  if (classifyFailure(error) === 'unavailable') {
    console.error({ event: 'request.unavailable', path: c.req.path, errorName: error.name })
    return c.json({ error: 'Service unavailable' }, 503)
  }

  console.error({ event: 'request.failed', path: c.req.path, errorName: error.name })
  return c.text('Internal Server Error', 500)
}
