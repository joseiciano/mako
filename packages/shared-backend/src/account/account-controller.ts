import type { Context, Hono } from 'hono'
import {
  AccountDeletionNotFoundError,
  AccountDeletionUnauthorizedError,
  AccountService,
} from './account-service'

export type AccountControllerEnvironment = {
  Bindings: Record<string, unknown>
  Variables: {
    authUserId?: string
  }
}

export interface AccountControllerOptions {
  createAccountService: (context: Context<AccountControllerEnvironment>) => AccountService
  resolveAuthenticatedUserId: (
    context: Context<AccountControllerEnvironment>,
  ) => string | null | undefined
}

export function registerAccountController(
  app: Hono<AccountControllerEnvironment>,
  options: AccountControllerOptions,
): void {
  app.delete('/api/account', async function deleteAccountHandler(c) {
    try {
      const accountService = options.createAccountService(c)
      const authenticatedUserId = options.resolveAuthenticatedUserId(c)

      const result = await accountService.deleteAccount(authenticatedUserId)
      return c.json(result, 200)
    } catch (error: unknown) {
      if (error instanceof AccountDeletionUnauthorizedError) {
        return c.json({ error: error.message }, 401)
      }

      if (error instanceof AccountDeletionNotFoundError) {
        return c.json({ error: error.message }, 404)
      }

      return c.json({ error: 'Failed to delete account.' }, 500)
    }
  })
}
