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
    betterAuthMock.mockReturnValue({
      handler: vi.fn(),
      api: {
        getSession: vi.fn(),
      },
    })
  })

  it('configures credentials-friendly cookie attributes for cross-origin auth', async function () {
    const { createBetterAuth } = await import('./auth-config')

    createBetterAuth({
      connectionString: 'postgres://user:password@localhost:5432/mako',
      secret: 'test-secret',
      baseURL: 'https://mako-backend-rest.icianojn.workers.dev/api/auth',
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
})
