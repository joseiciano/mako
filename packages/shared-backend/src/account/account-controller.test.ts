import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  AccountRepository,
  createInMemoryAccountDataSource,
  type SqlQueryExecutor,
} from './account-repository'
import type { SqlQuery } from '../index'
import {
  createHeaderSessionResolver,
  registerAccountController,
} from './account-controller'
import { AccountService } from './account-service'

type TestBindings = Record<string, unknown>

const authenticatedUserId = '11111111-1111-4111-8111-111111111111'
const createdCompanyId = '22222222-2222-4222-8222-222222222222'

describe('AccountController', function accountControllerSuite() {
  it('GET /api/account returns seeded account profile', async function run() {
    const app = createAccountApp()
    const response = await app.request('/api/account')
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.id).toBe('demo-user')
    expect(payload.displayName).toBe('Demo Candidate')
  })

  it('PATCH /api/account updates display name', async function run() {
    const app = createAccountApp()

    const patchResponse = await app.request('/api/account', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'Updated Demo' }),
    })
    const patchPayload = await patchResponse.json()

    expect(patchResponse.status).toBe(200)
    expect(patchPayload.displayName).toBe('Updated Demo')

    const getResponse = await app.request('/api/account')
    const getPayload = await getResponse.json()
    expect(getPayload.displayName).toBe('Updated Demo')
  })

  it('GET /api/account returns 401 when session is invalid', async function run() {
    const app = new Hono<{ Bindings: TestBindings }>()
    const accountService = new AccountService(
      new AccountRepository(createInMemoryAccountDataSource([])),
    )

    registerAccountController(app, {
      createService: function createService() {
        return accountService
      },
      resolveSession: function resolveSession() {
        return null
      },
    })

    const response = await app.request('/api/account')
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('You must be authenticated to access this resource.')
  })

  it('DELETE /api/account returns 401 without authenticated session', async function run() {
    const app = createDeletionApp({
      resolveSession: function resolveSession() {
        return null
      },
    })

    const response = await app.request('/api/account', {
      method: 'DELETE',
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('DELETE /api/account deletes authenticated account', async function run() {
    const app = createDeletionApp()

    const response = await app.request('/api/account', {
      method: 'DELETE',
      headers: {
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
  })

  it('returns unauthorized without session for companies', async function shouldRejectUnauthedCalls() {
    const app = createCompaniesApp()

    const response = await app.request('/api/companies')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('returns companies for authenticated user', async function shouldGetCompanies() {
    const app = createCompaniesApp()

    const response = await app.request('/api/companies', {
      method: 'GET',
      headers: {
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      companies: [
        {
          id: createdCompanyId,
          userId: authenticatedUserId,
          company: 'mako',
          joined: '2024-01-01T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    })
  })

  it('creates company record for authenticated user', async function shouldAddCompany() {
    const app = createCompaniesApp()

    const response = await app.request('/api/companies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
      body: JSON.stringify({
        company: 'Stripe',
        joined: '2023-08-10',
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      company: {
        id: createdCompanyId,
        userId: authenticatedUserId,
        company: 'stripe',
        joined: '2023-08-10T00:00:00.000Z',
        createdAt: '2023-08-10T00:00:00.000Z',
        updatedAt: '2023-08-10T00:00:00.000Z',
      },
    })
  })

  it('validates company request body', async function shouldRejectBadPayload() {
    const app = createCompaniesApp()

    const response = await app.request('/api/companies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
      body: JSON.stringify({
        company: '',
        joined: 'not-a-date',
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })
})

function createAccountApp() {
  const app = new Hono<{ Bindings: TestBindings }>()
  const accountService = new AccountService(
    new AccountRepository(
      createInMemoryAccountDataSource([
        {
          id: 'demo-user',
          email: 'demo@mako.dev',
          displayName: 'Demo Candidate',
          credits: 8,
          freeStandardInterviews: 1,
          freeAiInterviews: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    ),
  )

  registerAccountController(app, {
    createService: function createService() {
      return accountService
    },
    resolveSession: createHeaderSessionResolver({
      userId: 'demo-user',
      email: 'demo@mako.dev',
    }),
  })

  return app
}

function createDeletionApp(options?: {
  resolveSession?: Parameters<typeof registerAccountController<TestBindings>>[1]['resolveSession']
}) {
  const app = new Hono<{ Bindings: TestBindings }>()
  const accountService = new AccountService(
    new AccountRepository({
      queryExecutor: createDeleteQueryExecutor(),
      dataSource: createInMemoryAccountDataSource([]),
    }),
  )

  registerAccountController(app, {
    createService: function createService() {
      return accountService
    },
    resolveSession:
      options?.resolveSession ??
      function resolveSession(context) {
        const userId = context.req.header('x-user-id')
        const email = context.req.header('x-user-email')

        if (!userId || !email) {
          return null
        }

        return { userId, email }
      },
  })

  return app
}

function createCompaniesApp() {
  const app = new Hono<{ Bindings: TestBindings }>()
  const accountService = new AccountService(
    new AccountRepository({
      queryExecutor: createCompanyQueryExecutor(),
      dataSource: createInMemoryAccountDataSource([]),
    }),
  )

  registerAccountController(app, {
    createService: function createService() {
      return accountService
    },
    resolveSession: function resolveSession(context) {
      const userId = context.req.header('x-user-id')
      const email = context.req.header('x-user-email')

      if (!userId || !email) {
        return null
      }

      return { userId, email }
    },
  })

  return app
}

function createDeleteQueryExecutor(): SqlQueryExecutor {
  return {
    async query<Row>(queryInput: SqlQuery) {
      if (queryInput.text.includes('UPDATE users')) {
        return {
          rows: [{ id: authenticatedUserId }] as Row[],
        }
      }

      return {
        rows: [] as Row[],
      }
    },
  }
}

function createCompanyQueryExecutor(): SqlQueryExecutor {
  return {
    async query<Row>(queryInput: SqlQuery) {
      if (queryInput.text.includes('INSERT INTO "User_Companies"')) {
        const [userId, company, joined] = queryInput.values

        return {
          rows: [
            {
              id: createdCompanyId,
              user_id: userId,
              company,
              joined,
              created_at: joined,
              updated_at: joined,
              deleted_at: null,
            },
          ] as Row[],
        }
      }

      return {
        rows: [
          {
            id: createdCompanyId,
            user_id: authenticatedUserId,
            company: 'mako',
            joined: '2024-01-01T00:00:00.000Z',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            deleted_at: null,
          },
        ] as Row[],
      }
    },
  }
}
