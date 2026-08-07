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
    expect(payload).toEqual({
      id: 'demo-user',
      email: 'demo@mako.dev',
      displayName: 'Demo Candidate',
      credits: 8,
      freeStandardInterviews: 1,
      freeAiInterviews: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
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
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.json()).resolves.toEqual({
      companies: [
        {
          id: createdCompanyId,
          userId: authenticatedUserId,
          company: 'mako',
          role: 'backend engineer',
          start: '2024-01-01',
          end: null,
          isComplete: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          joined: '2024-01-01T00:00:00.000Z',
        },
      ],
    })
  })

  it('returns 403 for companies when account is inactive', async function shouldRejectInactiveAccount() {
    const app = createCompaniesApp({ activeUser: false })

    const response = await app.request('/api/companies', {
      method: 'GET',
      headers: {
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Account is inactive or deleted.',
    })
  })

  it('creates a canonical company record for authenticated user', async function shouldAddCanonicalCompany() {
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
        role: 'Software Engineer',
        start: '2023-08-10',
        end: null,
      }),
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.json()).resolves.toEqual({
      company: {
        id: createdCompanyId,
        userId: authenticatedUserId,
        company: 'stripe',
        role: 'Software Engineer',
        start: '2023-08-10',
        end: null,
        isComplete: true,
        createdAt: '2023-08-10T00:00:00.000Z',
        updatedAt: '2023-08-10T00:00:00.000Z',
        joined: '2023-08-10T00:00:00.000Z',
      },
    })
  })

  it('creates a legacy company record for authenticated user', async function shouldAddLegacyCompany() {
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
        role: null,
        start: '2023-08-10',
        end: null,
        isComplete: false,
        createdAt: '2023-08-10T00:00:00.000Z',
        updatedAt: '2023-08-10T00:00:00.000Z',
        joined: '2023-08-10T00:00:00.000Z',
      },
    })
  })

  it('rejects payload mixing canonical and legacy fields', async function shouldRejectMixedPayload() {
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
        role: 'Software Engineer',
        start: '2023-08-10',
        end: null,
        joined: '2023-08-10',
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Cannot mix canonical and legacy fields.',
    })
  })

  it('rejects invalid canonical company payload', async function shouldRejectBadCanonicalPayload() {
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
        role: 'Software Engineer',
        start: 'not-a-date',
        end: null,
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('rejects invalid legacy company payload', async function shouldRejectBadLegacyPayload() {
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

  it('returns 401 when posting company without session', async function shouldRejectPostUnauthed() {
    const app = createCompaniesApp()

    const response = await app.request('/api/companies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: 'Stripe',
        role: 'Software Engineer',
        start: '2023-08-10',
        end: null,
      }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 403 when posting company for inactive account', async function shouldRejectPostInactive() {
    const app = createCompaniesApp({ activeUser: false })

    const response = await app.request('/api/companies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
      body: JSON.stringify({
        company: 'Stripe',
        role: 'Software Engineer',
        start: '2023-08-10',
        end: null,
      }),
    })

    expect(response.status).toBe(403)
  })

  it('updates a company record for authenticated user', async function shouldUpdateCompany() {
    const app = createCompaniesApp()

    const response = await app.request(`/api/companies/${createdCompanyId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
      body: JSON.stringify({
        company: 'Stripe',
        role: 'Senior Engineer',
        start: '2020-01-15',
        end: '2023-06-30',
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.json()).resolves.toEqual({
      company: {
        id: createdCompanyId,
        userId: authenticatedUserId,
        company: 'stripe',
        role: 'Senior Engineer',
        start: '2020-01-15',
        end: '2023-06-30',
        isComplete: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2023-06-30T00:00:00.000Z',
        joined: '2020-01-15T00:00:00.000Z',
      },
    })
  })

  it('returns 404 when updating a missing company record', async function shouldUpdateMissing() {
    const app = createCompaniesApp({ updateFound: false })

    const response = await app.request(`/api/companies/${createdCompanyId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
      body: JSON.stringify({
        company: 'Stripe',
        role: 'Senior Engineer',
        start: '2020-01-15',
        end: '2023-06-30',
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Employment record not found.',
    })
  })

  it('rejects invalid company update payload', async function shouldRejectBadUpdatePayload() {
    const app = createCompaniesApp()

    const response = await app.request(`/api/companies/${createdCompanyId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
      body: JSON.stringify({
        company: 'Stripe',
        role: 'Senior Engineer',
        start: 'bad-date',
        end: null,
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 401 when updating company without session', async function shouldRejectUpdateUnauthed() {
    const app = createCompaniesApp()

    const response = await app.request(`/api/companies/${createdCompanyId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: 'Stripe',
        role: 'Senior Engineer',
        start: '2020-01-15',
        end: null,
      }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 403 when updating company for inactive account', async function shouldRejectUpdateInactive() {
    const app = createCompaniesApp({ activeUser: false })

    const response = await app.request(`/api/companies/${createdCompanyId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
      body: JSON.stringify({
        company: 'Stripe',
        role: 'Senior Engineer',
        start: '2020-01-15',
        end: null,
      }),
    })

    expect(response.status).toBe(403)
  })

  it('deletes a company record for authenticated user', async function shouldDeleteCompany() {
    const app = createCompaniesApp()

    const response = await app.request(`/api/companies/${createdCompanyId}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.json()).resolves.toEqual({ success: true })
  })

  it('returns 404 when deleting a missing company record', async function shouldDeleteMissing() {
    const app = createCompaniesApp({ deleteFound: false })

    const response = await app.request(`/api/companies/${createdCompanyId}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Employment record not found.',
    })
  })

  it('returns 401 when deleting company without session', async function shouldRejectDeleteUnauthed() {
    const app = createCompaniesApp()

    const response = await app.request(`/api/companies/${createdCompanyId}`, {
      method: 'DELETE',
    })

    expect(response.status).toBe(401)
  })

  it('returns 403 when deleting company for inactive account', async function shouldRejectDeleteInactive() {
    const app = createCompaniesApp({ activeUser: false })

    const response = await app.request(`/api/companies/${createdCompanyId}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': authenticatedUserId,
        'x-user-email': 'user@mako.dev',
      },
    })

    expect(response.status).toBe(403)
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

function createCompaniesApp(options: CompanyExecutorOptions = {}) {
  const app = new Hono<{ Bindings: TestBindings }>()
  const accountService = new AccountService(
    new AccountRepository({
      queryExecutor: createCompanyQueryExecutor(options),
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
      if (queryInput.text.includes('UPDATE "user"')) {
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

type CompanyExecutorOptions = {
  activeUser?: boolean
  updateFound?: boolean
  deleteFound?: boolean
}

function createCompanyQueryExecutor(
  options: CompanyExecutorOptions = {},
): SqlQueryExecutor {
  const activeUser = options.activeUser ?? true
  const updateFound = options.updateFound ?? true
  const deleteFound = options.deleteFound ?? true

  return {
    async query<Row>(queryInput: SqlQuery) {
      const text = queryInput.text

      if (text.includes('SELECT 1 FROM "user"')) {
        return {
          rows: (activeUser ? [{ exists: 1 }] : []) as Row[],
        }
      }

      if (text.includes('INSERT INTO user_companies')) {
        const [, userId, company, role, joined, endedAt] = queryInput.values

        return {
          rows: [
            {
              id: createdCompanyId,
              user_id: userId,
              company,
              role,
              joined,
              ended_at: endedAt,
              created_at: joined,
              updated_at: joined,
              deleted_at: null,
            },
          ] as Row[],
        }
      }

      if (text.includes('UPDATE user_companies')) {
        if (text.includes('SET deleted_at')) {
          return {
            rows: (deleteFound
              ? [{ id: queryInput.values[0] }]
              : []) as Row[],
          }
        }

        const [id, userId, company, role, joined, endedAt] = queryInput.values

        return {
          rows: updateFound
            ? ([
                {
                  id,
                  user_id: userId,
                  company,
                  role,
                  joined,
                  ended_at: endedAt,
                  created_at: '2024-01-01T00:00:00.000Z',
                  updated_at: (endedAt ?? joined) as string,
                  deleted_at: null,
                },
              ] as Row[])
            : ([] as Row[]),
        }
      }

      return {
        rows: [
          {
            id: createdCompanyId,
            user_id: authenticatedUserId,
            company: 'mako',
            role: 'backend engineer',
            joined: '2024-01-01T00:00:00.000Z',
            ended_at: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            deleted_at: null,
          },
        ] as Row[],
      }
    },
  }
}
