import { createHealthResponse } from '@mako/shared'
import {
  AccountRepository,
  AccountService,
  backendRuntime,
  registerAccountController,
} from '@mako/shared-backend'
import type { SqlQuery } from '@mako/shared-backend'
import { Hono } from 'hono'

export type DatabaseBinding = {
  query: (
    statementText: string,
    ...statementValues: readonly unknown[]
  ) => Promise<{ rows: unknown[] }>
}

export type WorkerBindings = {
  DB?: DatabaseBinding
}

const app = new Hono<{ Bindings: WorkerBindings }>()

registerAccountController(app, {
  createService: function createService(context) {
    return new AccountService(
      new AccountRepository({
        query: async function query<Row>(queryInput: SqlQuery) {
          const database = context.bindings.DB

          if (!database) {
            throw new Error('Database binding `DB` is not configured')
          }

          const result = await database.query(
            queryInput.text,
            ...queryInput.values,
          )

          return {
            rows: result.rows as Row[],
          }
        },
      }),
    )
  },
  resolveAuthenticatedUserId: async function resolveAuthenticatedUserId(c) {
    return c.req.header('x-user-id') ?? null
  },
})

app.get('/', function rootHandler(c) {
  return c.json({
    message: 'Mako backend API is running.',
    runtime: backendRuntime,
  })
})

app.get('/health', function healthHandler(c) {
  return c.json(createHealthResponse('backend-rest'))
})

export default app
