import type { Context, Hono } from 'hono'
import { ZodError } from 'zod'
import { type AccountService } from './account-service'

export type AccountControllerOptions<TBindings extends Record<string, unknown>> = {
  createService: (context: {
    bindings: TBindings
  }) => AccountService
  resolveAuthenticatedUserId: (
    context: Context<{ Bindings: TBindings }>,
  ) => Promise<string | null> | string | null
}

export function registerAccountController<TBindings extends Record<string, unknown>>(
  app: Hono<{ Bindings: TBindings }>,
  options: AccountControllerOptions<TBindings>,
): void {
  app.get('/api/companies', async function getCompaniesHandler(c) {
    const authenticatedUserId = await options.resolveAuthenticatedUserId(c)

    if (!authenticatedUserId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const accountService = options.createService({ bindings: c.env })

    try {
      const companies = await accountService.getCompaniesByUserId(authenticatedUserId)
      return c.json({ companies }, 200)
    } catch (error) {
      return mapControllerError(c, error)
    }
  })

  app.post('/api/companies', async function addCompanyHandler(c) {
    const authenticatedUserId = await options.resolveAuthenticatedUserId(c)

    if (!authenticatedUserId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    let jsonBody: unknown
    try {
      jsonBody = await c.req.json()
    } catch {
      return c.json({ error: 'Request body must be valid JSON' }, 400)
    }

    const accountService = options.createService({ bindings: c.env })

    try {
      const company = await accountService.addCompanyRecord(
        authenticatedUserId,
        jsonBody,
      )
      return c.json({ company }, 201)
    } catch (error) {
      return mapControllerError(c, error)
    }
  })
}

function mapControllerError<TBindings extends Record<string, unknown>>(
  context: Context<{ Bindings: TBindings }>,
  error: unknown,
) {
  if (error instanceof ZodError) {
    return context.json(
      {
        error: 'Invalid request payload',
        details: error.issues,
      },
      400,
    )
  }

  if (error instanceof Error) {
    return context.json({ error: error.message }, 500)
  }

  return context.json({ error: 'Unknown error' }, 500)
}
