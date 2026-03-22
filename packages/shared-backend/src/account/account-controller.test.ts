import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { AccountRepository, createInMemoryAccountDataSource } from './account-repository'
import {
  createHeaderSessionResolver,
  registerAccountController,
} from './account-controller'
import { AccountService } from './account-service'

function createApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>()
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

describe('AccountController', function suite() {
  it('GET /api/account returns seeded account profile', async function run() {
    const app = createApp()
    const response = await app.request('/api/account')
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.id).toBe('demo-user')
    expect(payload.displayName).toBe('Demo Candidate')
  })

  it('PATCH /api/account updates display name', async function run() {
    const app = createApp()

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
    const app = new Hono<{ Bindings: Record<string, unknown> }>()
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
})
