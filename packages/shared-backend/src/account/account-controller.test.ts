import assert from 'node:assert/strict'
import test from 'node:test'
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

test('GET /api/account returns seeded account profile', async function run() {
  const app = createApp()
  const response = await app.request('/api/account')
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.id, 'demo-user')
  assert.equal(payload.displayName, 'Demo Candidate')
})

test('PATCH /api/account updates display name', async function run() {
  const app = createApp()

  const patchResponse = await app.request('/api/account', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ displayName: 'Updated Demo' }),
  })
  const patchPayload = await patchResponse.json()

  assert.equal(patchResponse.status, 200)
  assert.equal(patchPayload.displayName, 'Updated Demo')

  const getResponse = await app.request('/api/account')
  const getPayload = await getResponse.json()
  assert.equal(getPayload.displayName, 'Updated Demo')
})

test('GET /api/account returns 401 when session is invalid', async function run() {
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

  assert.equal(response.status, 401)
  assert.equal(
    payload.error,
    'You must be authenticated to access this resource.',
  )
})
