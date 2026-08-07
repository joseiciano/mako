import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { QueryResult, SqlQuery, SqlQueryExecutor } from '../index'
import { registerCreditController } from './credit-controller'
import { CreditRepository } from './credit-repository'
import { CreditService } from './credit-service'
import type { CreditTransactionRow } from './types'

type TestBindings = Record<string, unknown>

type CreditSession = {
  userId: string
  email: string
}

const authenticatedSession: CreditSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@mako.dev',
}

const otherUserId = '99999999-9999-4999-8999-999999999999'

// Rows mirror what the repository's history query returns: already ordered
// newest-first by `ORDER BY created_at DESC, id DESC`, scoped to user_id.
const seededTransactionRows: CreditTransactionRow[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: authenticatedSession.userId,
    stripe_payment_intent_id: 'pi_333',
    amount: 1500,
    credits_granted: 150,
    status: 'succeeded',
    created_at: '2026-06-24T12:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: authenticatedSession.userId,
    stripe_payment_intent_id: 'pi_222',
    amount: 500,
    credits_granted: 50,
    status: 'succeeded',
    created_at: '2026-06-23T12:00:00.000Z',
  },
  {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: authenticatedSession.userId,
    stripe_payment_intent_id: 'pi_111',
    amount: 1000,
    credits_granted: 100,
    status: 'pending',
    created_at: '2026-06-22T12:00:00.000Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    user_id: otherUserId,
    stripe_payment_intent_id: 'pi_444',
    amount: 999,
    credits_granted: 99,
    status: 'succeeded',
    created_at: '2026-06-25T12:00:00.000Z',
  },
]

type MockQueryExecutor = SqlQueryExecutor & { queries: SqlQuery[] }

function createMockQueryExecutor(
  handler: (query: SqlQuery) => QueryResult<unknown>,
): MockQueryExecutor {
  const queries: SqlQuery[] = []

  return {
    queries,
    async query<Row>(query: SqlQuery): Promise<QueryResult<Row>> {
      queries.push(query)
      return handler(query) as QueryResult<Row>
    },
  }
}

describe('CreditController transaction history', function creditTransactionHistorySuite() {
  it('returns only the authenticated user\'s transactions as safe snake_case fields', async function run() {
    const { app } = createCreditApp({ session: authenticatedSession })

    const response = await app.request('/api/account/transactions')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      transactions: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          amount: 1500,
          credits_granted: 150,
          status: 'succeeded',
          created_at: '2026-06-24T12:00:00.000Z',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          amount: 500,
          credits_granted: 50,
          status: 'succeeded',
          created_at: '2026-06-23T12:00:00.000Z',
        },
        {
          id: '11111111-1111-4111-8111-111111111111',
          amount: 1000,
          credits_granted: 100,
          status: 'pending',
          created_at: '2026-06-22T12:00:00.000Z',
        },
      ],
      total: 3,
    })
  })

  it('returns 401 when no session is present', async function run() {
    const { app } = createCreditApp({ session: null })

    const response = await app.request('/api/account/transactions')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('passes limit and offset to the service and reports full count as total', async function run() {
    const { app, queryExecutor } = createCreditApp({ session: authenticatedSession })

    const response = await app.request('/api/account/transactions?limit=2&offset=0')

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.transactions).toHaveLength(2)
    expect(payload.total).toBe(3)

    const historyQuery = queryExecutor.queries.find(function isHistoryQuery(query) {
      return (
        query.text.includes('FROM credit_transactions') && query.text.includes('LIMIT')
      )
    })
    expect(historyQuery).toBeDefined()
    expect(historyQuery?.values).toEqual([authenticatedSession.userId, 2, 0])
  })

  it('preserves newest-first ordering', async function run() {
    const { app } = createCreditApp({ session: authenticatedSession })

    const response = await app.request('/api/account/transactions')

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(
      payload.transactions.map(function toId(transaction: { id: string }) {
        return transaction.id
      }),
    ).toEqual([
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    ])
  })

  it('returns empty transactions and total 0 for a user with no history', async function run() {
    const { app } = createCreditApp({ session: authenticatedSession, transactionRows: [] })

    const response = await app.request('/api/account/transactions')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      transactions: [],
      total: 0,
    })
  })

  it('returns 400 for invalid pagination params', async function run() {
    const { app } = createCreditApp({ session: authenticatedSession })

    const response = await app.request('/api/account/transactions?limit=0')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('excludes stripe payment intent and internal fields from the response', async function run() {
    const { app } = createCreditApp({ session: authenticatedSession })

    const response = await app.request('/api/account/transactions')

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).not.toHaveProperty('stripe_payment_intent_id')

    for (const transaction of payload.transactions) {
      expect(transaction).not.toHaveProperty('stripe_payment_intent_id')
      expect(transaction).not.toHaveProperty('user_id')
    }
  })
})

function createCreditApp(options: {
  session: CreditSession | null
  transactionRows?: CreditTransactionRow[]
}): { app: Hono<{ Bindings: TestBindings }>; queryExecutor: MockQueryExecutor } {
  const transactionRows = options.transactionRows ?? seededTransactionRows

  const queryExecutor = createMockQueryExecutor(function handleQuery(query) {
    if (query.text.includes('FROM credit_transactions') && query.text.includes('LIMIT')) {
      const [userId, limit, offset] = query.values as [string, number, number]
      const userRows = transactionRows.filter(function isOwnedRow(row) {
        return row.user_id === userId
      })
      const page = userRows.slice(offset, offset + limit)

      return { rows: page, rowCount: page.length }
    }

    if (query.text.includes('COUNT(')) {
      const [userId] = query.values as [string]
      const total = transactionRows.filter(function isOwnedRow(row) {
        return row.user_id === userId
      }).length

      return { rows: [{ count: String(total) }] }
    }

    return { rows: [], rowCount: 0 }
  })

  const app = new Hono<{ Bindings: TestBindings }>()
  const creditService = new CreditService(new CreditRepository(queryExecutor), queryExecutor)

  const registrationOptions = {
    createService: function createService() {
      return creditService
    },
    resolveSession: function resolveSession() {
      return options.session
    },
  }

  registerCreditController(app, registrationOptions)

  return { app, queryExecutor }
}
