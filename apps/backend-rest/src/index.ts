import { createHealthResponse } from '@mako/shared'
import {
  AccountRepository,
  AccountService,
  backendRuntime,
  createHeaderSessionResolver,
  createInMemoryAccountDataSource,
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

const demoSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'demo@mako.dev',
}

const seededAccountDataSource = createInMemoryAccountDataSource([
  {
    id: demoSession.userId,
    email: demoSession.email,
    displayName: 'Demo Candidate',
    credits: 8,
    freeStandardInterviews: 1,
    freeAiInterviews: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  },
])

registerAccountController(app, {
  createService: function createService(context) {
    return new AccountService(
      new AccountRepository({
        dataSource: seededAccountDataSource,
        queryExecutor: {
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
        },
      }),
    )
  },
  resolveSession: createHeaderSessionResolver(demoSession),
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
