import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerAuthController } from './auth-controller'
import type { BetterAuthLike } from './auth-config'

describe('registerAuthController', function () {
  it('mounts the Better Auth handler on /api/auth/*', async function () {
    const handler = vi.fn(async function handleAuthRequest() {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const app = new Hono<{ Bindings: Record<string, never> }>()
    registerAuthController(app, {
      getAuth: function getAuth() {
        return {
          handler,
          api: {
            getSession: vi.fn(),
          },
        } satisfies BetterAuthLike
      },
    })

    const response = await app.request('/api/auth/get-session')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('returns 503 when Better Auth runtime config is missing', async function () {
    const app = new Hono<{ Bindings: Record<string, never> }>()
    registerAuthController(app, {
      getAuth: function getAuth() {
        return null
      },
    })

    const response = await app.request('/api/auth/get-session')

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error:
        'Better Auth is not configured. Set HYPERDRIVE and BETTER_AUTH_SECRET.',
    })
  })
})
