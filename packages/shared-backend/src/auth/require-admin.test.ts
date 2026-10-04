import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createAuthSessionMiddleware } from './auth-middleware'
import type { BetterAuthLike, BetterAuthSessionResult } from './auth-config'
import { requireAdmin } from './require-admin'

function createApp(getSession: () => Promise<unknown>) {
  const app = new Hono()
  app.use(
    '/api/*',
    createAuthSessionMiddleware({
      getAuth: function getAuth() {
        return {
          handler: async function handler() {
            return new Response(null)
          },
          api: {
            getSession: getSession as BetterAuthLike['api']['getSession'],
          },
        } satisfies BetterAuthLike
      },
    }),
  )
  app.use('/api/admin/*', requireAdmin)
  app.get('/api/admin/ping', function ping(c) {
    return c.json({ ok: true })
  })
  return app
}

function sessionWith(isAdmin: unknown): BetterAuthSessionResult {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@mako.dev',
      isAdmin,
    } as BetterAuthSessionResult['user'],
    session: { id: 'session-1' },
  }
}

describe('requireAdmin', function () {
  it('returns 401 when unauthenticated', async function () {
    const app = createApp(async () => null)
    const response = await app.request('/api/admin/ping')
    expect(response.status).toBe(401)
  })

  it('returns 403 for a non-admin user', async function () {
    const app = createApp(async () => sessionWith(false))
    const response = await app.request('/api/admin/ping')
    expect(response.status).toBe(403)
  })

  it.each([undefined, null, 'true', 1, {}])(
    'returns 403 for a missing or invalid isAdmin flag (%s)',
    async function (flag) {
      const app = createApp(async () => sessionWith(flag))
      const response = await app.request('/api/admin/ping')
      expect(response.status).toBe(403)
    },
  )

  it('passes through for an admin user', async function () {
    const app = createApp(async () => sessionWith(true))
    const response = await app.request('/api/admin/ping')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('re-evaluates admin status from the canonical session on every request', async function () {
    const database = { isAdmin: true, sessionActive: true }
    const app = createApp(async function getSession() {
      return database.sessionActive ? sessionWith(database.isAdmin) : null
    })

    expect((await app.request('/api/admin/ping')).status).toBe(200)

    database.isAdmin = false
    expect((await app.request('/api/admin/ping')).status).toBe(403)

    database.sessionActive = false
    expect((await app.request('/api/admin/ping')).status).toBe(401)
  })
})
