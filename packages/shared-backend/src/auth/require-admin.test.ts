import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { handleUnexpectedError } from '../http'
import { createAuthSessionMiddleware } from './auth-middleware'
import { requireAdmin } from './require-admin'

function createApp(sessionUser: Record<string, unknown> | null) {
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
            getSession: async function getSession() {
              return sessionUser
                ? {
                    user: sessionUser as { id: string; email: string; isAdmin: boolean },
                    session: { id: 's1' },
                  }
                : null
            },
          },
        }
      },
    }),
  )
  app.get('/api/admin', requireAdmin, function handler(c) {
    return c.json({ ok: true })
  })
  return app
}

const base = { id: '11111111-1111-4111-8111-111111111111', email: 'a@mako.dev' }

describe('requireAdmin', function () {
  it('returns 401 when unauthenticated', async function () {
    const response = await createApp(null).request('/api/admin')
    expect(response.status).toBe(401)
  })

  it('returns 403 for a non-admin user', async function () {
    const response = await createApp({ ...base, isAdmin: false }).request('/api/admin')
    expect(response.status).toBe(403)
  })

  it.each([
    ['missing', undefined],
    ['string', 'true'],
    ['number', 1],
    ['null', null],
  ])('returns 403 when isAdmin is %s', async function (_label, value) {
    const user: Record<string, unknown> = { ...base }
    if (value !== undefined) user.isAdmin = value
    const response = await createApp(user).request('/api/admin')
    expect(response.status).toBe(403)
  })

  it('passes through when isAdmin is true', async function () {
    const response = await createApp({ ...base, isAdmin: true }).request('/api/admin')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('returns 503 when no usable auth runtime is configured', async function () {
    const app = new Hono()
    app.onError(handleUnexpectedError)
    app.get('/x', requireAdmin, (c) => c.text('ok'))
    expect((await app.request('/x')).status).toBe(503)
  })
})
