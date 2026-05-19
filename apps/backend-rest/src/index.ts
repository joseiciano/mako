import {
  createHealthResponse,
  type Interview,
} from '@mako/shared'
import {
  AccountRepository,
  AccountService,
  type CancelInterviewRecordInput,
  type CancelInterviewRecordResult,
  InterviewPolicyConflictError,
  InterviewRepository,
  InterviewService,
  type InterviewServiceLogger,
  backendRuntime,
  createPostgresConnectionPool,
  createAuthSessionMiddleware,
  createBetterAuth,
  createHeaderSessionResolver,
  getAccountSessionFromAuthContext,
  isAuthConfigured,
  listParticipantInterviewsInputSchema,
  parseInterview,
  registerAccountController,
  registerAuthController,
  registerInterviewController,
  createInterviewQueuePostCommitEventPublisher,
  type AccountProfileRecord,
  type AccountRepositoryDataSource,
  type CreateInterviewRecordInput,
  type InterviewRepositoryDataSource,
  type SqlQueryExecutor,
} from '@mako/shared-backend'
import type { SqlQuery } from '@mako/shared-backend'
import type { Context, Next } from 'hono'
import { Hono } from 'hono'

export type DatabaseBinding = {
  query: (
    statementText: string,
    ...statementValues: readonly unknown[]
  ) => Promise<{ rows: unknown[] }>
}

export type HyperdriveBinding = {
  connectionString: string
}

type PostgresClient = Awaited<
  ReturnType<ReturnType<typeof createPostgresConnectionPool>['connect']>
>

type PostgresPool = ReturnType<typeof createPostgresConnectionPool>

export type WorkerBindings = {
  DB?: DatabaseBinding
  HYPERDRIVE?: HyperdriveBinding
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  BETTER_AUTH_TRUSTED_ORIGINS?: string
  INTERVIEW_PROVISIONING_QUEUE?: Queue
}

const demoSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'demo@mako.dev',
}

const seededDemoAccounts: readonly AccountProfileRecord[] = [
  {
    id: demoSession.userId,
    email: demoSession.email,
    displayName: 'Demo Candidate',
    credits: 8,
    freeStandardInterviews: 1,
    freeAiInterviews: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  },
]

const corsAllowedMethods = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
const defaultCorsAllowedHeaders = 'content-type,authorization'
const corsMaxAgeSeconds = '86400'

const consoleInterviewServiceLogger: InterviewServiceLogger = {
  error(event, context) {
    console.error(`[InterviewService] ${event}`, context)
  },
}

export function createApp(): Hono<{ Bindings: WorkerBindings }> {
  const app = new Hono<{ Bindings: WorkerBindings }>()
  const demoDataSources = createDemoDataSources(seededDemoAccounts)
  const demoSessionResolver = createHeaderSessionResolver(demoSession)

  app.use('/api/*', applyCorsHeaders)

  app.use(
    '/api/*',
    createAuthSessionMiddleware({
      getAuth: function getAuth(context) {
        return createWorkerAuth(context)
      },
    }),
  )

  registerAuthController(app, {
    getAuth: function getAuth(context) {
      return createWorkerAuth(context)
    },
  })

  registerAccountController(app, {
    createService: function createService(context) {
      return new AccountService(
        new AccountRepository(
          hasDatabaseAccess(context.bindings)
            ? { queryExecutor: createDatabaseQueryExecutor(context.bindings) }
            : {
                dataSource: demoDataSources.account,
                queryExecutor: createDatabaseQueryExecutor(context.bindings),
              },
        ),
      )
    },
    resolveSession: function resolveSession(context) {
      return resolveAppSession(context, demoSessionResolver)
    },
  })

  registerInterviewController(app, {
    createService: function createService(context) {
      const repository = new InterviewRepository(
        hasDatabaseAccess(context.bindings)
          ? { queryExecutor: createDatabaseQueryExecutor(context.bindings) }
          : demoDataSources.interview,
      )
      const postCommitEventPublisher = context.bindings
        .INTERVIEW_PROVISIONING_QUEUE
        ? createInterviewQueuePostCommitEventPublisher({
            send: async function send(message) {
              await context.bindings.INTERVIEW_PROVISIONING_QUEUE!.send(message)
            },
          })
        : undefined

      return new InterviewService(
        repository,
        undefined,
        undefined,
        undefined,
        postCommitEventPublisher,
        consoleInterviewServiceLogger,
      )
    },
    resolveSession: function resolveSession(context) {
      return resolveAppSession(context, demoSessionResolver)
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

  return app
}

const app = createApp()

export default app

function createDemoDataSources(seedAccounts: readonly AccountProfileRecord[]): {
  account: AccountRepositoryDataSource
  interview: InterviewRepositoryDataSource
} {
  const accountProfilesById = new Map<string, AccountProfileRecord>()
  const interviewsById = new Map<string, Interview>()

  for (const account of seedAccounts) {
    accountProfilesById.set(account.id, structuredClone(account))
  }

  return {
    account: {
      async getByUserId(userId: string): Promise<AccountProfileRecord | null> {
        const account = accountProfilesById.get(userId)
        return account ? structuredClone(account) : null
      },
      async updateDisplayName(
        userId: string,
        displayName: string,
      ): Promise<AccountProfileRecord | null> {
        const account = accountProfilesById.get(userId)

        if (!account) {
          return null
        }

        const updatedAccount = {
          ...account,
          displayName,
        }

        accountProfilesById.set(userId, updatedAccount)
        return structuredClone(updatedAccount)
      },
    },
    interview: {
      async getAccountPolicy(userId: string) {
        const account = accountProfilesById.get(userId)

        if (!account) {
          return null
        }

        return {
          credits: account.credits,
          free_ai_interviews: account.freeAiInterviews,
        }
      },
      async createDirectInterview(input: CreateInterviewRecordInput) {
        const account = accountProfilesById.get(input.scheduler_id)

        if (!account) {
          throw new InterviewPolicyConflictError('Account state is unavailable.')
        }

        if (input.policy_consumption === 'free_ai_interview') {
          if (account.freeAiInterviews <= 0) {
            throw new InterviewPolicyConflictError()
          }

          account.freeAiInterviews -= 1
        }

        if (input.policy_consumption === 'credit') {
          if (account.credits <= 0) {
            throw new InterviewPolicyConflictError()
          }

          account.credits -= 1
        }

        const interview = parseInterview(input)
        interviewsById.set(interview.id, structuredClone(interview))
        return structuredClone(interview)
      },
      async listParticipantInterviews(input) {
        const parsedInput = listParticipantInterviewsInputSchema.parse(input)

        return Array.from(interviewsById.values())
          .filter(function isParticipantInterview(interview) {
            return (
              interview.scheduler_id === parsedInput.participant_user_id ||
              interview.interviewer_id === parsedInput.participant_user_id
            )
          })
          .filter(function matchesStatus(interview) {
            return parsedInput.status === undefined
              ? true
              : interview.status === parsedInput.status
          })
          .sort(compareInterviewListOrder)
          .slice(parsedInput.offset, parsedInput.offset + parsedInput.limit)
          .map(function cloneInterview(interview) {
            return structuredClone(interview)
          })
      },
      async cancelInterview(
        input: CancelInterviewRecordInput,
      ): Promise<CancelInterviewRecordResult> {
        const interview = interviewsById.get(input.interview_id)

        if (
          !interview ||
          (interview.scheduler_id !== input.participant_user_id &&
            interview.interviewer_id !== input.participant_user_id)
        ) {
          return { outcome: 'not_found' }
        }

        if (interview.status === 'cancelled') {
          return {
            outcome: 'already_cancelled',
            interview: structuredClone(interview),
          }
        }

        if (interview.status !== 'scheduled') {
          return {
            outcome: 'invalid_status',
            interview: structuredClone(interview),
          }
        }

        const cancelledInterview = parseInterview({
          ...interview,
          status: 'cancelled',
          updated_at: input.updated_at,
        })

        interviewsById.set(cancelledInterview.id, structuredClone(cancelledInterview))

        return {
          outcome: 'cancelled',
          interview: structuredClone(cancelledInterview),
        }
      },
    },
  }
}

function compareInterviewListOrder(left: Interview, right: Interview): number {
  if (left.scheduled_at < right.scheduled_at) {
    return -1
  }

  if (left.scheduled_at > right.scheduled_at) {
    return 1
  }

  if (left.id < right.id) {
    return -1
  }

  if (left.id > right.id) {
    return 1
  }

  return 0
}

function createDatabaseQueryExecutor(bindings: WorkerBindings): SqlQueryExecutor {
  let transactionClient: PostgresClient | null = null

  return {
    async query<Row>(queryInput: SqlQuery) {
      const database = bindings.DB

      if (database) {
        const result = await database.query(queryInput.text, ...queryInput.values)

        return {
          rows: result.rows as Row[],
        }
      }

      const connectionString = bindings.HYPERDRIVE?.connectionString

      if (!connectionString) {
        throw new Error('Database binding `HYPERDRIVE` is not configured')
      }

      const pool = createPostgresConnectionPool(connectionString) as PostgresPool
      const statementValues = [...queryInput.values]
      const normalizedStatementText = normalizeSqlStatement(queryInput.text)
      const isBegin = normalizedStatementText === 'BEGIN;'
      const isCommit = normalizedStatementText === 'COMMIT;'
      const isRollback = normalizedStatementText === 'ROLLBACK;'

      if (isBegin) {
        if (transactionClient) {
          throw new Error('Transaction is already active for this query executor')
        }

        const client = await pool.connect()
        transactionClient = client

        try {
          const result = await client.query(queryInput.text, statementValues)

          return {
            rows: result.rows as Row[],
            rowCount: result.rowCount ?? undefined,
          }
        } catch (error) {
          await client.release()
          transactionClient = null
          throw error
        }
      }

      const activeQueryTarget = transactionClient ?? pool

      try {
        const result = await activeQueryTarget.query(queryInput.text, statementValues)

        return {
          rows: result.rows as Row[],
          rowCount: result.rowCount ?? undefined,
        }
      } finally {
        if ((isCommit || isRollback) && transactionClient) {
          await transactionClient.release()
          transactionClient = null
        }
      }
    },
  }
}

async function applyCorsHeaders(
  context: Context<{ Bindings: WorkerBindings }>,
  next: Next,
): Promise<Response | void> {
  const requestOrigin = context.req.header('origin')
  const allowedOrigins = parseCorsAllowedOrigins(
    context.env?.BETTER_AUTH_TRUSTED_ORIGINS,
  )

  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    setCorsResponseHeaders(context, requestOrigin)
  }

  if (context.req.method === 'OPTIONS') {
    setCorsPreflightHeaders(context)
    return context.body(null, 204)
  }

  await next()

  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    setCorsResponseHeaders(context, requestOrigin)
  }
}

function setCorsResponseHeaders(
  context: Context<{ Bindings: WorkerBindings }>,
  requestOrigin: string,
): void {
  context.header('access-control-allow-origin', requestOrigin)
  context.header('access-control-allow-credentials', 'true')
  context.header('vary', 'Origin')
}

function setCorsPreflightHeaders(
  context: Context<{ Bindings: WorkerBindings }>,
): void {
  const requestedHeaders = context.req.header('access-control-request-headers')

  context.header('access-control-allow-methods', corsAllowedMethods)
  context.header(
    'access-control-allow-headers',
    requestedHeaders && requestedHeaders.length > 0
      ? requestedHeaders
      : defaultCorsAllowedHeaders,
  )
  context.header('access-control-max-age', corsMaxAgeSeconds)
}

function parseCorsAllowedOrigins(
  configuredOrigins: string | undefined,
): Set<string> {
  const allowedOrigins = new Set<string>()

  for (const origin of configuredOrigins?.split(',') ?? []) {
    const trimmedOrigin = origin.trim()

    if (trimmedOrigin.length > 0) {
      allowedOrigins.add(trimmedOrigin)
    }
  }

  return allowedOrigins
}

function hasDatabaseAccess(bindings: WorkerBindings): boolean {
  return (
    bindings.DB !== undefined ||
    typeof bindings.HYPERDRIVE?.connectionString === 'string'
  )
}

function hasRuntimeDatabaseAccess(bindings: WorkerBindings): boolean {
  return typeof bindings.HYPERDRIVE?.connectionString === 'string'
}

function normalizeSqlStatement(statementText: string): string {
  return statementText.trim().replace(/\s+/g, ' ').toUpperCase()
}

function createWorkerAuth(
  context: Context<{ Bindings: WorkerBindings }>,
) {
  const bindings = context.env ?? {}
  const databaseUrl = bindings.HYPERDRIVE?.connectionString
  const secret = bindings.BETTER_AUTH_SECRET

  if (!databaseUrl || !secret) {
    return null
  }

  const baseURL = resolveBetterAuthBaseUrl(context)

  return createBetterAuth({
    connectionString: databaseUrl,
    secret,
    baseURL,
    trustedOrigins: parseConfiguredOrigins(
      bindings.BETTER_AUTH_TRUSTED_ORIGINS,
      baseURL,
    ),
  })
}

function resolveAppSession(
  context: Context<{ Bindings: WorkerBindings }>,
  demoResolver: ReturnType<typeof createHeaderSessionResolver>,
) {
  if (isAuthConfigured(context)) {
    return getAccountSessionFromAuthContext(context)
  }

  if (hasRuntimeDatabaseAccess(context.env ?? {})) {
    return null
  }

  return demoResolver(context)
}

function resolveBetterAuthBaseUrl(
  context: Context<{ Bindings: WorkerBindings }>,
): string {
  const configuredBaseUrl = context.env?.BETTER_AUTH_URL?.trim()

  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  return new URL('/api/auth', context.req.url).toString()
}

function parseConfiguredOrigins(
  configuredOrigins: string | undefined,
  baseURL: string,
): string[] {
  const origins = new Set<string>()

  for (const origin of configuredOrigins?.split(',') ?? []) {
    const trimmedOrigin = origin.trim()

    if (trimmedOrigin.length > 0) {
      origins.add(trimmedOrigin)
    }
  }

  origins.add(new URL(baseURL).origin)
  return Array.from(origins)
}
