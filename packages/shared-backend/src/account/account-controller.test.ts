import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { AccountService } from './account-service'
import {
  type AddCompanyRecordInput,
  type AccountRepositoryPort,
} from './account-repository'
import { registerAccountController } from './account-controller'
import type { UserCompany } from './types'

type TestBindings = Record<string, unknown>

const authenticatedUserId = '11111111-1111-4111-8111-111111111111'
const createdCompanyId = '22222222-2222-4222-8222-222222222222'

describe('registerAccountController', function registerAccountControllerSuite() {
  it('returns unauthorized without user id', async function shouldRejectUnauthedCalls() {
    const app = createTestApp()

    const response = await app.request('/api/companies')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns companies for authenticated user', async function shouldGetCompanies() {
    const app = createTestApp()

    const response = await app.request('/api/companies', {
      method: 'GET',
      headers: {
        'x-user-id': authenticatedUserId,
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
    const app = createTestApp()

    const response = await app.request('/api/companies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': authenticatedUserId,
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

  it('validates request body', async function shouldRejectBadPayload() {
    const app = createTestApp()

    const response = await app.request('/api/companies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': authenticatedUserId,
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

function createTestApp() {
  const app = new Hono<{ Bindings: TestBindings }>()

  const fakeRepository = createFakeRepository()
  const accountService = new AccountService(fakeRepository)

  registerAccountController(app, {
    createService: function createService() {
      return accountService
    },
    resolveAuthenticatedUserId: function resolveAuthenticatedUserId(context) {
      return context.req.header('x-user-id') ?? null
    },
  })

  return app
}

function createFakeRepository(): AccountRepositoryPort {
  return {
    async getCompaniesByUserId(userId: string): Promise<UserCompany[]> {
      return [
        {
          id: createdCompanyId,
          userId,
          company: 'mako',
          joined: '2024-01-01T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]
    },
    async addCompanyRecord(input: AddCompanyRecordInput): Promise<UserCompany> {
      return {
        id: createdCompanyId,
        userId: input.userId,
        company: input.company,
        joined: input.joined,
        createdAt: input.joined,
        updatedAt: input.joined,
      }
    },
  }
}
