import {
  accountProfileSchema,
  updateAccountProfileInputSchema,
} from '@mako/shared'
import type { Context } from 'hono'
import type { Hono } from 'hono'
import { AccountService } from './account-service'
import {
  AccountNotFoundError,
  AccountUnauthorizedError,
  AccountValidationError,
  type AccountSession,
} from './types'

type ControllerBindings = Record<string, unknown>

export interface AccountControllerOptions<Bindings extends ControllerBindings> {
  createService: () => AccountService
  resolveSession: (
    context: Context<{ Bindings: Bindings }>,
  ) => Promise<AccountSession | null> | AccountSession | null
}

export function registerAccountController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: AccountControllerOptions<Bindings>,
): void {
  app.get('/api/account', async function getAccountHandler(c) {
    const accountService = options.createService()
    const session = await options.resolveSession(c)

    try {
      const accountProfile = await accountService.getAccount(session)
      return c.json(accountProfileSchema.parse(accountProfile), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.patch('/api/account', async function patchAccountHandler(c) {
    const accountService = options.createService()
    const session = await options.resolveSession(c)
    const jsonBody = await readRequestBody(c)

    if (jsonBody === null) {
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    try {
      const parsedBody = updateAccountProfileInputSchema.parse(jsonBody)
      const updatedAccount = await accountService.updateProfile(session, parsedBody)
      return c.json(accountProfileSchema.parse(updatedAccount), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })
}

async function readRequestBody(
  context: Context,
): Promise<unknown | null> {
  try {
    return await context.req.json()
  } catch {
    return null
  }
}

function toErrorResponse(
  context: Context,
  error: unknown,
) {
  if (error instanceof AccountUnauthorizedError) {
    return context.json({ error: error.message }, 401)
  }

  if (error instanceof AccountNotFoundError) {
    return context.json({ error: error.message }, 404)
  }

  if (error instanceof AccountValidationError) {
    return context.json({ error: error.message }, 400)
  }

  return context.json({ error: 'Unexpected account error.' }, 500)
}

export function createHeaderSessionResolver(
  defaultSession: AccountSession,
): (context: Context) => AccountSession | null {
  return function headerSessionResolver(context) {
    const userId = context.req.header('x-user-id')
    const email = context.req.header('x-user-email')

    if (!userId && !email) {
      return defaultSession
    }

    if (!userId || !email) {
      return null
    }

    return { userId, email }
  }
}
