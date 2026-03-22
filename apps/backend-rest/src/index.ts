import { createHealthResponse } from '@mako/shared'
import {
  AccountRepository,
  AccountService,
  backendRuntime,
  createHeaderSessionResolver,
  createInMemoryAccountDataSource,
  registerAccountController,
} from '@mako/shared-backend'
import { Hono } from 'hono'

export type WorkerBindings = Record<string, unknown>

const app = new Hono<{ Bindings: WorkerBindings }>()

const seededAccountRepository = new AccountRepository(
  createInMemoryAccountDataSource([
    {
      id: 'demo-user',
      email: 'demo@mako.dev',
      displayName: 'Demo Candidate',
      credits: 8,
      freeStandardInterviews: 1,
      freeAiInterviews: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    },
  ]),
)
const accountService = new AccountService(seededAccountRepository)

registerAccountController(app, {
  createService: function createService() {
    return accountService
  },
  resolveSession: createHeaderSessionResolver({
    userId: 'demo-user',
    email: 'demo@mako.dev',
  }),
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
