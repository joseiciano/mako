import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { AuthUnavailableError } from '../http/failure-classification'
import {
  createAuthSessionMiddleware,
  getAccountSessionFromAuthContext,
  getAuthSessionFromContext,
  getAuthUserFromContext,
  isAuthConfigured,
} from './auth-middleware'
import type { BetterAuthLike } from './auth-config'

describe('createAuthSessionMiddleware', function () {
  it('stores a Better Auth session on the Hono context', async function () {
    const getSession = vi.fn(async function getSession() {
      return {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'candidate@mako.dev',
          name: 'Candidate',
          isAdmin: false,
        },
        session: {
          id: 'session-1',
          token: 'token-1',
        },
      }
    })

    const app = new Hono()
    app.use(
      '/api/*',
      createAuthSessionMiddleware({
        getAuth: function getAuth() {
          return {
            handler: vi.fn(),
            api: {
              getSession,
            },
          } satisfies BetterAuthLike
        },
      }),
    )

    app.get('/api/session-check', function sessionCheckHandler(c) {
      return c.json({
        configured: isAuthConfigured(c),
        user: getAuthUserFromContext(c),
        session: getAuthSessionFromContext(c),
        accountSession: getAccountSessionFromAuthContext(c),
      })
    })

    const response = await app.request('/api/session-check')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configured: true,
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'candidate@mako.dev',
        name: 'Candidate',
        isAdmin: false,
      },
      session: {
        id: 'session-1',
        token: 'token-1',
      },
      accountSession: {
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'candidate@mako.dev',
      },
    })
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('marks the request as unauthenticated when Better Auth is not configured', async function () {
    const app = new Hono()
    app.use(
      '/api/*',
      createAuthSessionMiddleware({
        getAuth: function getAuth() {
          return null
        },
      }),
    )

    app.get('/api/session-check', function sessionCheckHandler(c) {
      return c.json({
        configured: isAuthConfigured(c),
        accountSession: getAccountSessionFromAuthContext(c),
      })
    })

    const response = await app.request('/api/session-check')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configured: false,
      accountSession: null,
    })
  })

  function createFailingApp(error: unknown) {
    const app = new Hono()
    app.use(
      '/api/*',
      createAuthSessionMiddleware({
        getAuth: function getAuth() {
          return {
            handler: vi.fn(),
            api: {
              getSession: vi.fn(async function getSession() {
                throw error
              }),
            },
          } as unknown as BetterAuthLike
        },
      }),
    )
    app.get('/api/x', (c) => c.text('ok'))
    return app
  }

  it('wraps connectivity failures from getSession in AuthUnavailableError', async function () {
    const cause = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' })
    const app = createFailingApp(cause)
    let thrown: unknown
    app.onError(function capture(error) {
      thrown = error
      return new Response(null, { status: 503 })
    })

    expect((await app.request('/api/x')).status).toBe(503)
    expect(thrown).toBeInstanceOf(AuthUnavailableError)
    expect((thrown as AuthUnavailableError).cause).toBe(cause)
  })

  it('rethrows non-connectivity failures from getSession unchanged', async function () {
    const bug = new TypeError('session bug')
    const app = createFailingApp(bug)
    let thrown: unknown
    app.onError(function capture(error) {
      thrown = error
      return new Response(null, { status: 500 })
    })

    expect((await app.request('/api/x')).status).toBe(500)
    expect(thrown).toBe(bug)
  })
})
