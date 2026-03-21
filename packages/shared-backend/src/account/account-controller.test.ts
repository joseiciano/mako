import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import {
  AccountService,
  type AccountControllerEnvironment,
  registerAccountController,
} from './index'

type TestEnvironment = AccountControllerEnvironment

describe('registerAccountController', function accountControllerSuite() {
  it('returns 401 when requester is not authenticated', async function testUnauthorizedResponse() {
    const app = new Hono<TestEnvironment>()

    const repository = {
      deleteAccount: vi.fn(async function deleteAccount() {
        return true
      }),
      invalidateSessions: vi.fn(async function invalidateSessions() {}),
      cancelUpcomingInterviews: vi.fn(async function cancelUpcomingInterviews() {}),
    }

    registerAccountController(app, {
      createAccountService: function createService() {
        return new AccountService(repository)
      },
      resolveAuthenticatedUserId: function resolveAuthenticatedUserId() {
        return null
      },
    })

    const response = await app.request('http://localhost/api/account', {
      method: 'DELETE',
    })

    expect(response.status).toBe(401)
    expect(repository.deleteAccount).not.toHaveBeenCalled()
  })

  it('deletes account for authenticated user', async function testDeleteAccountResponse() {
    const app = new Hono<TestEnvironment>()

    app.use('*', async function addAuthUserToContext(c, next) {
      c.set('authUserId', '21a6fa6d-f13c-489f-8385-cd97f9dc1761')
      await next()
    })

    const deleteAccount = vi.fn(async function deleteAccount() {
      return { success: true }
    })

    registerAccountController(app, {
      createAccountService: function createService() {
        return {
          deleteAccount,
        } as unknown as AccountService
      },
      resolveAuthenticatedUserId: function resolveAuthenticatedUserId(context) {
        return context.get('authUserId')
      },
    })

    const response = await app.request('http://localhost/api/account', {
      method: 'DELETE',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(deleteAccount).toHaveBeenCalledWith(
      '21a6fa6d-f13c-489f-8385-cd97f9dc1761',
    )
  })
})
