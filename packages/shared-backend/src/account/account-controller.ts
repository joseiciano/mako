import {
  accountProfileSchema,
  updateAccountProfileInputSchema,
} from '@mako/shared'
import type { Context, Hono } from 'hono'
import { z, ZodError } from 'zod'
import { AccountService } from './account-service'
import {
  AccountForbiddenError,
  AccountNotFoundError,
  AccountUnauthorizedError,
  AccountValidationError,
  deleteAccountResponseSchema,
  type AccountSession,
} from './types'

type ControllerBindings = Record<string, unknown>

const routeParamIdSchema = z.string().uuid()

export type AccountControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: { bindings: Bindings }) => AccountService
  resolveSession: (
    context: Context<{ Bindings: Bindings }>,
  ) => Promise<AccountSession | null> | AccountSession | null
}

export function registerAccountController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: AccountControllerOptions<Bindings>,
): void {
  app.get('/api/account', async function getAccountHandler(c) {
    const accountService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const accountProfile = await accountService.getAccount(session)
      return c.json(accountProfileSchema.parse(accountProfile), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.patch('/api/account', async function patchAccountHandler(c) {
    const accountService = options.createService({ bindings: c.env })
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

  app.delete('/api/account', async function deleteAccountHandler(c) {
    const accountService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const deleteResponse = await accountService.deleteAccount(session)
      return c.json(deleteAccountResponseSchema.parse(deleteResponse), 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.get('/api/companies', async function getCompaniesHandler(c) {
    const accountService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)

    try {
      const companies = await accountService.getCompaniesByUserId(session)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ companies }, 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.post('/api/companies', async function addCompanyHandler(c) {
    const accountService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)
    const jsonBody = await readRequestBody(c)

    if (jsonBody === null) {
      c.header('Cache-Control', 'private, no-store')
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    try {
      const company = await accountService.addCompanyRecord(session, jsonBody)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ company }, 201)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.patch('/api/companies/:id', async function updateCompanyHandler(c) {
    const accountService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)
    const idParam = c.req.param('id')
    const idValidation = routeParamIdSchema.safeParse(idParam)

    if (!idValidation.success) {
      c.header('Cache-Control', 'private, no-store')
      return c.json({ error: 'Invalid record ID.' }, 400)
    }

    const jsonBody = await readRequestBody(c)

    if (jsonBody === null) {
      c.header('Cache-Control', 'private, no-store')
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }

    try {
      const company = await accountService.updateCompanyRecord(
        session,
        idValidation.data,
        jsonBody,
      )
      c.header('Cache-Control', 'private, no-store')
      return c.json({ company }, 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })

  app.delete('/api/companies/:id', async function deleteCompanyHandler(c) {
    const accountService = options.createService({ bindings: c.env })
    const session = await options.resolveSession(c)
    const idParam = c.req.param('id')
    const idValidation = routeParamIdSchema.safeParse(idParam)

    if (!idValidation.success) {
      c.header('Cache-Control', 'private, no-store')
      return c.json({ error: 'Invalid record ID.' }, 400)
    }

    try {
      await accountService.deleteCompanyRecord(session, idValidation.data)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ success: true }, 200)
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })
}

async function readRequestBody(context: Context): Promise<unknown | null> {
  try {
    return await context.req.json()
  } catch {
    return null
  }
}

function toErrorResponse(context: Context, error: unknown) {
  context.header('Cache-Control', 'private, no-store')

  if (isZodError(error)) {
    return context.json(
      {
        error: 'Invalid request payload',
        details: error.issues,
      },
      400,
    )
  }

  if (error instanceof AccountUnauthorizedError) {
    return context.json({ error: error.message }, 401)
  }

  if (error instanceof AccountForbiddenError) {
    return context.json({ error: error.message }, 403)
  }

  if (error instanceof AccountNotFoundError) {
    return context.json({ error: error.message }, 404)
  }

  if (error instanceof AccountValidationError) {
    return context.json({ error: error.message }, 400)
  }

  return context.json({ error: 'Unexpected account error.' }, 500)
}

function isZodError(error: unknown): error is { issues: unknown[] } {
  // @mako/shared resolves a different zod copy (v4) than this package (v3),
  // so instanceof checks fail for errors thrown by shared schemas.
  return (
    error instanceof ZodError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'ZodError')
  )
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
