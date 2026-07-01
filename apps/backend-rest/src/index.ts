import {
  createHealthResponse,
  type Interview,
  type InterviewDetail,
} from '@mako/shared'
import {
  AccountRepository,
  AccountService,
  AvailabilityRepository,
  AvailabilityService,
  type CancelInterviewRecordInput,
  type CancelInterviewRecordResult,
  CREDIT_PACKAGES,
  CreditRepository,
  CreditService,
  InterviewPolicyConflictError,
  InterviewRepository,
  InterviewService,
  type InterviewServiceLogger,
  PaymentService,
  backendRuntime,
  createInMemoryAvailabilityDataSource,
  createAuthSessionMiddleware,
  createBetterAuth,
  createDemoRealtimeProvider,
  createRealtimeKitProvider,
  createHeaderSessionResolver,
  createStripeClient,
  getAccountSessionFromAuthContext,
  isAuthConfigured,
  listParticipantInterviewsInputSchema,
  parseInterview,
  parseInterviewDetail,
  parseInterviewListItem,
  registerAccountController,
  registerAuthController,
  registerAvailabilityController,
  registerInterviewController,
  registerPaymentController,
  createInterviewQueuePostCommitEventPublisher,
  createWorkflowTimerOrchestration,
  NotificationRepository,
  NotificationService,
  NotificationDispatchService,
  type NotificationDispatchServiceLogger,
  type AccountProfileRecord,
  type AccountRepositoryDataSource,
  type AvailabilityRepositoryDataSource,
  type CreateInterviewRecordInput,
  type InterviewRepositoryDataSource,
  type LifecycleInterviewRecordInput,
  type LifecycleInterviewRecordResult,
  type ProvisionInterviewRecordInput,
  type ProvisionInterviewRecordResult,
  type RealtimeProvider,
<<<<<<< HEAD
=======
  type SqlQuery,
  type SqlQueryExecutor,
  type PaymentServiceLogger,
  type StripeClient,
>>>>>>> 92a919e ([milestone-6:6-6] Wire payment routes into backend-rest and add Stripe env bindings)
} from '@mako/shared-backend'
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import {
  createDatabaseQueryExecutor,
  type DatabaseBinding,
  type HyperdriveBinding,
} from './database'
import { SessionTimerWorkflow } from './workflows/session-timer-workflow'

export { SessionTimerWorkflow }

export type WorkerBindings = {
  DB?: DatabaseBinding
  HYPERDRIVE?: HyperdriveBinding
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  BETTER_AUTH_TRUSTED_ORIGINS?: string
  NOTIFICATION_QUEUE?: Queue
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_REALTIMEKIT_APP_ID?: string
  SESSION_TIMER_WORKFLOW?: Workflow
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
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
    console.error({ event, component: 'InterviewService', ...context })
  },
  info(event, context) {
    console.info({ event, component: 'InterviewService', ...context })
  },
}

const consoleNotificationDispatchLogger: NotificationDispatchServiceLogger = {
  error(event, context) {
    console.error({ event, component: 'NotificationDispatch', ...context })
  },
}

const consolePaymentLogger: PaymentServiceLogger = {
  info(event, context) {
    console.info(`[Payment] ${event}`, context)
  },
  error(event, context) {
    console.error(`[Payment] ${event}`, context)
  },
}

export function createApp(): Hono<{ Bindings: WorkerBindings }> {
  const app = new Hono<{ Bindings: WorkerBindings }>()
  const demoDataSources = createDemoDataSources(seededDemoAccounts)
  const demoSessionResolver = createHeaderSessionResolver(demoSession)

  let stripeClient: StripeClient | null = null

  function getStripeClient(bindings: WorkerBindings | undefined): StripeClient {
    if (!stripeClient) {
      stripeClient = createStripeClient(bindings?.STRIPE_SECRET_KEY ?? 'sk_test_disabled')
    }
    return stripeClient
  }

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
      const queryExecutor = hasDatabaseAccess(context.bindings)
        ? createDatabaseQueryExecutor(context.bindings)
        : undefined

      let notificationService: NotificationService | undefined
      let notificationDispatchService: NotificationDispatchService | undefined
      const notificationTransport = context.bindings.NOTIFICATION_QUEUE
        ? {
            send: async function send(message: unknown) {
              await context.bindings.NOTIFICATION_QUEUE!.send(message)
            },
          }
        : undefined

      if (queryExecutor) {
        const notificationRepository = new NotificationRepository({ queryExecutor })
        notificationService = new NotificationService(notificationRepository)
        notificationDispatchService = new NotificationDispatchService(notificationService, undefined, consoleNotificationDispatchLogger)
      }

      const repository = new InterviewRepository(
        queryExecutor && notificationService
          ? {
              queryExecutor,
              persistOutboxEvent: async function persistOutboxEvent(event) {
                await notificationService!.persistOutboxEvent(
                  event as Parameters<NotificationService['persistOutboxEvent']>[0],
                )
              },
            }
          : demoDataSources.interview,
      )

      const postCommitEventPublisher = context.bindings.NOTIFICATION_QUEUE
        ? createInterviewQueuePostCommitEventPublisher({
            send: async function send(message) {
              await context.bindings.NOTIFICATION_QUEUE!.send(message)
            },
          })
        : undefined

      const realtimeProvider = createWorkerRealtimeProvider(context.bindings)

      const timerOrchestration = context.bindings.SESSION_TIMER_WORKFLOW
        ? createWorkflowTimerOrchestration(context.bindings.SESSION_TIMER_WORKFLOW)
        : undefined

      return new InterviewService(
        repository,
        undefined,
        undefined,
        undefined,
        postCommitEventPublisher,
        consoleInterviewServiceLogger,
        notificationService,
        notificationDispatchService,
        notificationTransport,
        realtimeProvider,
        timerOrchestration,
      )
    },
    resolveSession: function resolveSession(context) {
      return resolveAppSession(context, demoSessionResolver)
    },
  })

  registerAvailabilityController(app, {
    createService: function createService(context) {
      const queryExecutor = hasDatabaseAccess(context.bindings)
        ? createDatabaseQueryExecutor(context.bindings)
        : undefined

      const repository = new AvailabilityRepository(
        queryExecutor
          ? { queryExecutor }
          : demoDataSources.availability,
      )

      return new AvailabilityService(repository)
    },
    resolveSession: function resolveSession(context) {
      return resolveAppSession(context, demoSessionResolver)
    },
  })

  registerPaymentController(app, {
    createService: function createService(context) {
      const stripe = getStripeClient(context.bindings)
      const queryExecutor = createDatabaseQueryExecutor(context.bindings)
      const creditService = new CreditService(
        new CreditRepository(queryExecutor),
        queryExecutor,
      )
      return new PaymentService(stripe, creditService, CREDIT_PACKAGES, consolePaymentLogger)
    },
    resolveSession: function resolveSession(context) {
      return resolveAppSession(context, demoSessionResolver)
    },
    getWebhookSecret: function getWebhookSecret(bindings) {
      return bindings.STRIPE_WEBHOOK_SECRET
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

function createWorkerRealtimeProvider(bindings: WorkerBindings): RealtimeProvider {
  if (!hasDatabaseAccess(bindings)) {
    return createDemoRealtimeProvider()
  }

  let realtimeProvider: RealtimeProvider | undefined

  function getRealtimeProvider(): RealtimeProvider {
    // Cache provider so Cloudflare bindings and base URL resolve once per Worker isolate.
    realtimeProvider ??= createRealtimeKitProvider(bindings)
    return realtimeProvider
  }

  return {
    async createSession(input) {
      return getRealtimeProvider().createSession(input)
    },
    async createParticipantToken(input) {
      return getRealtimeProvider().createParticipantToken(input)
    },
  }
}

function createDemoDataSources(seedAccounts: readonly AccountProfileRecord[]): {
  account: AccountRepositoryDataSource
  interview: InterviewRepositoryDataSource
  availability: AvailabilityRepositoryDataSource
} {
  const accountProfilesById = new Map<string, AccountProfileRecord>()
  const interviewsById = new Map<string, Interview>()
  const availabilityDataSource = createInMemoryAvailabilityDataSource()

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
          free_standard_interviews: account.freeStandardInterviews,
          free_ai_interviews: account.freeAiInterviews,
        }
      },
      async getInterviewById(interviewId: string) {
        const interview = interviewsById.get(interviewId)
        return interview ? structuredClone(interview) : null
      },
      async getParticipantInterviewById(input): Promise<InterviewDetail | null> {
        const interview = interviewsById.get(input.interview_id)

        if (
          !interview ||
          (interview.scheduler_id !== input.participant_user_id &&
            interview.interviewer_id !== input.participant_user_id)
        ) {
          return null
        }

        const detail = parseInterviewDetail({
          ...interview,
          realtime_session_id: undefined,
          excalidraw_room_id: undefined,
          excalidraw_key: undefined,
        })

        return structuredClone(detail)
      },
      async createDirectInterview(
        input: CreateInterviewRecordInput,
        _outboxEvent?: unknown,
      ) {
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

        const interview = parseInterview({
          ...input,
          realtime_session_id: null,
          excalidraw_room_id: null,
          excalidraw_key: null,
          recording_url: null,
          screenshot_urls: null,
          feedback: null,
          started_at: null,
          expires_at: null,
          warning_at: null,
        })
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
            return parseInterviewListItem(structuredClone(interview))
          })
      },
      async provisionInterview(
        input: ProvisionInterviewRecordInput,
      ): Promise<ProvisionInterviewRecordResult> {
        const interview = interviewsById.get(input.interview_id)

        if (
          !interview ||
          (interview.scheduler_id !== input.participant_user_id &&
            interview.interviewer_id !== input.participant_user_id)
        ) {
          return { outcome: 'not_found' }
        }

        if (interview.status !== 'scheduled' && interview.status !== 'ongoing') {
          return {
            outcome: 'invalid_status',
            interview: structuredClone(interview),
          }
        }

        if (
          interview.realtime_session_id &&
          interview.excalidraw_room_id &&
          interview.excalidraw_key
        ) {
          return {
            outcome: 'already_provisioned',
            interview: structuredClone(interview),
          }
        }

        const provisionedInterview = parseInterview({
          ...interview,
          realtime_session_id: interview.realtime_session_id ?? input.realtime_session_id,
          excalidraw_room_id: interview.excalidraw_room_id ?? input.excalidraw_room_id,
          excalidraw_key: interview.excalidraw_key ?? input.excalidraw_key,
          updated_at: input.updated_at,
        })

        interviewsById.set(interview.id, structuredClone(provisionedInterview))

        return {
          outcome: 'provisioned',
          interview: structuredClone(provisionedInterview),
        }
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
      async transitionInterviewLifecycle(
        input: LifecycleInterviewRecordInput,
      ): Promise<LifecycleInterviewRecordResult> {
        const interview = interviewsById.get(input.interview_id)

        if (
          !interview ||
          (interview.scheduler_id !== input.participant_user_id &&
            interview.interviewer_id !== input.participant_user_id)
        ) {
          return { outcome: 'not_found' }
        }

        if (input.action === 'start') {
          if (interview.status === 'ongoing') {
            return {
              outcome: 'already_ongoing',
              interview: structuredClone(interview),
            }
          }

          if (interview.status !== 'scheduled') {
            return {
              outcome: 'invalid_status',
              interview: structuredClone(interview),
            }
          }

          const startedInterview = parseInterview({
            ...interview,
            status: 'ongoing',
            updated_at: input.updated_at,
          })

          interviewsById.set(startedInterview.id, structuredClone(startedInterview))

          return {
            outcome: 'started',
            interview: structuredClone(startedInterview),
          }
        }

        if (interview.status === 'completed') {
          return {
            outcome: 'already_completed',
            interview: structuredClone(interview),
          }
        }

        if (interview.status !== 'ongoing') {
          return {
            outcome: 'invalid_status',
            interview: structuredClone(interview),
          }
        }

        const completedInterview = parseInterview({
          ...interview,
          status: 'completed',
          updated_at: input.updated_at,
        })

        interviewsById.set(completedInterview.id, structuredClone(completedInterview))

        return {
          outcome: 'completed',
          interview: structuredClone(completedInterview),
        }
      },
    },
    availability: availabilityDataSource,
  }
}

function compareInterviewListOrder(left: Interview, right: Interview): number {
  const leftTime = new Date(left.scheduled_at).getTime()
  const rightTime = new Date(right.scheduled_at).getTime()

  if (leftTime < rightTime) {
    return -1
  }

  if (leftTime > rightTime) {
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
