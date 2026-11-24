import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthRateLimitMiddleware } from './auth-rate-limit'
import type { AuthRateLimiter, AuthRateLimiters } from './auth-rate-limit'

type FakeLimiter = AuthRateLimiter & { keys: string[] }

function createFakeLimiter(success: boolean): FakeLimiter {
  const keys: string[] = []
  return {
    keys,
    async limit(options) {
      keys.push(options.key)
      return { success }
    },
  }
}

function createApp(limiters: AuthRateLimiters) {
  const handler = vi.fn(function handler(c) {
    return c.json({ reached: true })
  })
  const app = new Hono()
  app.use('/api/auth/*', createAuthRateLimitMiddleware({ getLimiters: () => limiters }))
  app.all('/api/auth/*', handler)
  return { app, handler }
}

function post(app: Hono, path: string, headers: Record<string, string> = { 'cf-connecting-ip': '203.0.113.7' }) {
  return app.request(path, { method: 'POST', headers })
}

describe('createAuthRateLimitMiddleware', function () {
  beforeEach(function silenceWarnings() {
    vi.spyOn(console, 'warn').mockImplementation(function noop() {})
  })

  afterEach(function restore() {
    vi.restoreAllMocks()
  })

  it.each([
    ['/api/auth/sign-in/email', 'credentials'],
    ['/api/auth/sign-up/email', 'credentials'],
    ['/api/auth/request-password-reset', 'email'],
    ['/api/auth/send-verification-email', 'email'],
  ] as const)('POST %s uses only the %s limiter, keyed by ip and path', async function (path, kind) {
    const credentials = createFakeLimiter(true)
    const email = createFakeLimiter(true)
    const { app, handler } = createApp({ credentials, email })

    const response = await post(app, path)

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    const used = kind === 'credentials' ? credentials : email
    const unused = kind === 'credentials' ? email : credentials
    expect(used.keys).toEqual([`203.0.113.7:${path}`])
    expect(unused.keys).toEqual([])
  })

  it('returns 429 JSON and skips the handler when the limiter rejects', async function () {
    const { app, handler } = createApp({ credentials: createFakeLimiter(false) })

    const response = await post(app, '/api/auth/sign-in/email')

    expect(response.status).toBe(429)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ message: expect.any(String) })
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not apply the email limiter result to credential paths', async function () {
    const { app, handler } = createApp({
      credentials: createFakeLimiter(true),
      email: createFakeLimiter(false),
    })

    const response = await post(app, '/api/auth/sign-in/email')

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('never calls a limiter for GET requests on limited paths', async function () {
    const credentials = createFakeLimiter(false)
    const { app, handler } = createApp({ credentials, email: createFakeLimiter(false) })

    const response = await app.request('/api/auth/sign-in/email', {
      method: 'GET',
      headers: { 'cf-connecting-ip': '203.0.113.7' },
    })

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(credentials.keys).toEqual([])
  })

  it('never calls a limiter for unrelated paths such as /api/auth/get-session', async function () {
    const credentials = createFakeLimiter(false)
    const email = createFakeLimiter(false)
    const { app, handler } = createApp({ credentials, email })

    const response = await post(app, '/api/auth/get-session')

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(credentials.keys).toEqual([])
    expect(email.keys).toEqual([])
  })

  it('passes through when the binding for the matched kind is missing', async function () {
    const { app, handler } = createApp({ email: createFakeLimiter(false) })

    const response = await post(app, '/api/auth/sign-in/email')

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes through without calling the limiter when cf-connecting-ip is missing', async function () {
    const credentials = createFakeLimiter(false)
    const { app, handler } = createApp({ credentials })

    const response = await post(app, '/api/auth/sign-in/email', {})

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(credentials.keys).toEqual([])
  })
})
