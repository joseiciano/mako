import { createHealthResponse, type Interview } from '@mako/shared'
import {
  AccountRepository,
  AccountService,
  type CancelInterviewRecordInput,
  type CancelInterviewRecordResult,
  InterviewPolicyConflictError,
  InterviewRepository,
  InterviewService,
  backendRuntime,
  createHeaderSessionResolver,
  listParticipantInterviewsInputSchema,
  parseInterview,
  registerAccountController,
  registerInterviewController,
  type AccountProfileRecord,
  type AccountRepositoryDataSource,
  type CreateInterviewRecordInput,
  type InterviewRepositoryDataSource,
  type SqlQueryExecutor,
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

export function createApp(): Hono<{ Bindings: WorkerBindings }> {
  const app = new Hono<{ Bindings: WorkerBindings }>()
  const demoDataSources = createDemoDataSources(seededDemoAccounts)

  registerAccountController(app, {
    createService: function createService(context) {
      return new AccountService(
        new AccountRepository(
          context.bindings.DB
            ? { queryExecutor: createDatabaseQueryExecutor(context.bindings) }
            : {
                dataSource: demoDataSources.account,
                queryExecutor: createDatabaseQueryExecutor(context.bindings),
              },
        ),
      )
    },
    resolveSession: createHeaderSessionResolver(demoSession),
  })

  registerInterviewController(app, {
    createService: function createService(context) {
      return new InterviewService(
        new InterviewRepository(
          context.bindings.DB
            ? { queryExecutor: createDatabaseQueryExecutor(context.bindings) }
            : demoDataSources.interview,
        ),
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
  return {
    async query<Row>(queryInput: SqlQuery) {
      const database = bindings.DB

      if (!database) {
        throw new Error('Database binding `DB` is not configured')
      }

      const result = await database.query(queryInput.text, ...queryInput.values)

      return {
        rows: result.rows as Row[],
      }
    },
  }
}
