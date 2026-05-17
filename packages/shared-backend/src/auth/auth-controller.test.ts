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

  describe('structured logging for registration requests', function () {
    it('emits structured logs for POST /api/auth/sign-up/email', async function () {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
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

      const response = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
      })

      expect(response.status).toBe(200)
      expect(consoleSpy).toHaveBeenCalledTimes(2)

      const requestLog = consoleSpy.mock.calls[0][0]
      expect(requestLog).toMatchObject({
        level: 'info',
        message: 'Auth registration request received',
        method: 'POST',
        path: '/api/auth/sign-up/email',
      })

      const responseLog = consoleSpy.mock.calls[1][0]
      expect(responseLog).toMatchObject({
        level: 'info',
        message: 'Auth registration request completed',
        method: 'POST',
        path: '/api/auth/sign-up/email',
        status: 200,
        success: true,
      })

      consoleSpy.mockRestore()
    })

    it('logs registration request when Better Auth is unavailable (503)', async function () {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const app = new Hono<{ Bindings: Record<string, never> }>()
      registerAuthController(app, {
        getAuth: function getAuth() {
          return null
        },
      })

      const response = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
      })

      expect(response.status).toBe(503)
      expect(consoleSpy).toHaveBeenCalledTimes(2)

      const requestLog = consoleSpy.mock.calls[0][0]
      expect(requestLog).toMatchObject({
        level: 'info',
        message: 'Auth registration request received',
        method: 'POST',
        path: '/api/auth/sign-up/email',
      })

      const responseLog = consoleSpy.mock.calls[1][0]
      expect(responseLog).toMatchObject({
        level: 'info',
        message: 'Auth registration request completed',
        method: 'POST',
        path: '/api/auth/sign-up/email',
        status: 503,
        success: false,
      })

      consoleSpy.mockRestore()
    })

    it('does not emit registration logs for non-registration routes', async function () {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
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
      expect(consoleSpy).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('does not log sensitive values like email or password', async function () {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
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

      await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'secret123',
        }),
        headers: {
          'content-type': 'application/json',
        },
      })

      for (const call of consoleSpy.mock.calls) {
        const logOutput = JSON.stringify(call[0])
        expect(logOutput).not.toContain('test@example.com')
        expect(logOutput).not.toContain('secret123')
      }

      consoleSpy.mockRestore()
    })

    it('logs failed registration responses correctly', async function () {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const handler = vi.fn(async function handleAuthRequest() {
        return new Response(JSON.stringify({ error: 'Email already exists' }), {
          status: 400,
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

      const response = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
      })

      expect(response.status).toBe(400)
      expect(consoleSpy).toHaveBeenCalledTimes(2)

      const responseLog = consoleSpy.mock.calls[1][0]
      expect(responseLog).toMatchObject({
        level: 'info',
        message: 'Auth registration request completed',
        method: 'POST',
        path: '/api/auth/sign-up/email',
        status: 400,
        success: false,
      })

      consoleSpy.mockRestore()
    })

    it('logs registration completion when auth handler throws', async function () {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const handler = vi.fn(async function handleAuthRequest() {
        throw new Error('Database connection failed')
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

      const response = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
      })

      expect(response.status).toBe(500)
      expect(consoleSpy).toHaveBeenCalledTimes(2)

      const requestLog = consoleSpy.mock.calls[0][0]
      expect(requestLog).toMatchObject({
        level: 'info',
        message: 'Auth registration request received',
        method: 'POST',
        path: '/api/auth/sign-up/email',
      })

      const responseLog = consoleSpy.mock.calls[1][0]
      expect(responseLog).toMatchObject({
        level: 'info',
        message: 'Auth registration request completed',
        method: 'POST',
        path: '/api/auth/sign-up/email',
        status: 500,
        success: false,
      })

      const logOutput = JSON.stringify(responseLog)
      expect(logOutput).not.toContain('Database connection failed')

      consoleSpy.mockRestore()
    })
  })
})
