import { beforeEach, describe, expect, it, vi } from 'vitest'

const { betterAuthMock, createPostgresConnectionPoolMock } = vi.hoisted(
  function createMocks() {
    return {
      betterAuthMock: vi.fn(),
      createPostgresConnectionPoolMock: vi.fn(),
    }
  },
)

vi.mock('better-auth', function mockBetterAuth() {
  return {
    betterAuth: betterAuthMock,
  }
})

vi.mock('../database/postgres-connection-pool', function mockPostgresPool() {
  return {
    createPostgresConnectionPool: createPostgresConnectionPoolMock,
  }
})

describe('createBetterAuth', function () {
  beforeEach(function resetMocks() {
    vi.resetModules()
    betterAuthMock.mockReset()
    createPostgresConnectionPoolMock.mockReset()
    createPostgresConnectionPoolMock.mockReturnValue({ query: vi.fn() })
    betterAuthMock.mockImplementation(function createAuthInstance() {
      return {
        handler: vi.fn(),
        api: {
          getSession: vi.fn(),
        },
      }
    })
  })

  function staticOptions() {
    return {
      connectionString: 'postgres://user:password@localhost:5432/mako',
      secret: 'test-secret',
      baseURL: 'https://mako-backend-rest.icianojn.workers.dev/api/auth',
      trustedOrigins: ['https://mako-frontend.icianojn.workers.dev'],
      requireEmailVerification: true,
    }
  }

  it('configures credentials-friendly cookie attributes for cross-origin auth', async function () {
    const { createBetterAuth } = await import('./auth-config')

    createBetterAuth({
      connectionString: 'postgres://user:password@localhost:5432/mako',
      secret: 'test-secret',
      baseURL: 'https://mako-backend-rest.icianojn.workers.dev/api/auth',
      requireEmailVerification: true,
      trustedOrigins: ['https://mako-frontend.icianojn.workers.dev'],
    })

    expect(betterAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        advanced: expect.objectContaining({
          useSecureCookies: true,
          defaultCookieAttributes: {
            sameSite: 'none',
            secure: true,
            partitioned: true,
          },
        }),
      }),
    )
  })

  it('configures app-side UUID generation instead of database defaults', async function () {
    const { createBetterAuth } = await import('./auth-config')

    createBetterAuth({
      connectionString: 'postgres://user:password@localhost:5432/mako',
      secret: 'test-secret',
      baseURL: 'https://mako-backend-rest.icianojn.workers.dev/api/auth',
      requireEmailVerification: true,
    })
    const callArg = betterAuthMock.mock.calls[0][0]
    const generateId = callArg.advanced?.database?.generateId

    expect(typeof generateId).toBe('function')
    expect(generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('enforces verification policy with one-hour tokens and no auto sign-in', async function () {
    const { createBetterAuth } = await import('./auth-config')

    createBetterAuth({
      ...staticOptions(),
      sendVerificationEmail: vi.fn(),
    })

    expect(betterAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailVerification: {
          expiresIn: 3600,
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: false,
          sendVerificationEmail: expect.any(Function),
        },
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
        },
        rateLimit: {
          enabled: true,
          storage: 'database',
        },
        advanced: expect.objectContaining({
          ipAddress: {
            ipAddressHeaders: ['cf-connecting-ip'],
          },
        }),
        logger: {
          disabled: true,
        },
      }),
    )
  })

  it('adapts the Better Auth user callback to an email-scoped callback', async function () {
    const { createBetterAuth } = await import('./auth-config')
    const sendVerificationEmail = vi.fn(async function send() {})

    createBetterAuth({
      ...staticOptions(),
      sendVerificationEmail,
    })

    const callArg = betterAuthMock.mock.calls[0][0]
    const adaptedCallback = callArg.emailVerification?.sendVerificationEmail

    expect(typeof adaptedCallback).toBe('function')

    const result = adaptedCallback({
      user: { id: 'user-1', email: 'Person@Example.com' },
      url: 'https://backend.example.com/api/auth/verify-email?token=t',
      token: 't',
    })

    await expect(result).resolves.toBeUndefined()
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: 'Person@Example.com',
      url: 'https://backend.example.com/api/auth/verify-email?token=t',
    })
  })

  it('reuses the cached instance for callback-free options', async function () {
    const { createBetterAuth } = await import('./auth-config')

    const first = createBetterAuth(staticOptions())
    const second = createBetterAuth(staticOptions())

    expect(second).toBe(first)
    expect(betterAuthMock).toHaveBeenCalledTimes(1)
  })

  it('never shares a cached instance when a request-scoped callback is present', async function () {
    const { createBetterAuth } = await import('./auth-config')
    const firstCallback = vi.fn(async function first() {})
    const secondCallback = vi.fn(async function second() {})

    const withoutCallback = createBetterAuth(staticOptions())
    const first = createBetterAuth({ ...staticOptions(), sendVerificationEmail: firstCallback })
    const second = createBetterAuth({ ...staticOptions(), sendVerificationEmail: secondCallback })

    expect(betterAuthMock).toHaveBeenCalledTimes(3)
    expect(first).not.toBe(withoutCallback)
    expect(second).not.toBe(withoutCallback)
    expect(second).not.toBe(first)
  })
})
