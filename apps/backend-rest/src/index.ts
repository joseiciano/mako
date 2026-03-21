import { createHealthResponse } from '@mako/shared'
import {
  AccountRepository,
  AccountService,
  backendRuntime,
  registerAccountController,
  type AccountDatabase,
  type SqlQuery,
} from '@mako/shared-backend'
import { Hono } from 'hono'

export type WorkerBindings = {
  DB?: {
    query: (query: SqlQuery) => Promise<{ rowCount: number }>
  }
}

export type WorkerVariables = {
  authUserId?: string
}

function createAccountDatabase(bindings: WorkerBindings): AccountDatabase {
  if (!bindings.DB) {
    return {
      query: async function queryWithoutConfiguredDatabase() {
        throw new Error('DB binding is not configured for account deletion operations.')
      },
    }
  }

  return {
    query: function queryAccountData(query) {
      return bindings.DB!.query(query)
    },
  }
}

function createAccountService(bindings: WorkerBindings): AccountService {
  const accountRepository = new AccountRepository(createAccountDatabase(bindings))
  return new AccountService(accountRepository)
}

const app = new Hono<{ Bindings: WorkerBindings; Variables: WorkerVariables }>()

app.get('/', function rootHandler(c) {
  return c.json({
    message: 'Mako backend API is running.',
    runtime: backendRuntime,
  })
})

app.get('/health', function healthHandler(c) {
  return c.json(createHealthResponse('backend-rest'))
})

registerAccountController(app, {
  createAccountService: function createService(context) {
    return createAccountService(context.env)
  },
  resolveAuthenticatedUserId: function resolveAuthenticatedUserId(context) {
    return context.get('authUserId')
  },
})

export default app
