import { describe, expect, it } from 'vitest'
import type { QueryResult, SqlQuery, SqlQueryExecutor } from '../index'
import { CreditRepository } from './credit-repository'

type MockQueryHandler = (query: SqlQuery) => QueryResult<unknown>

function createMockQueryExecutor(handler: MockQueryHandler): SqlQueryExecutor & { queries: SqlQuery[] } {
  const queries: SqlQuery[] = []

  return {
    queries,
    async query<Row>(query: SqlQuery): Promise<QueryResult<Row>> {
      queries.push(query)
      return handler(query) as QueryResult<Row>
    },
  }
}

describe('CreditRepository', function creditRepositorySuite() {
  it('decrements credits with one atomic conditional update', async function testAtomicCreditDecrement() {
    const queryExecutor = createMockQueryExecutor(function handleQuery() {
      return { rows: [{ id: 'user-1', credits: 4 }], rowCount: 1 }
    })
    const repository = new CreditRepository(queryExecutor)

    const result = await repository.decrementCredits(queryExecutor, 'user-1', 2)

    expect(result).toEqual({ rowCount: 1, balance: { userId: 'user-1', credits: 4 } })
    expect(queryExecutor.queries).toHaveLength(1)
    expect(queryExecutor.queries[0]?.text).toContain('UPDATE "user"')
    expect(queryExecutor.queries[0]?.text).toContain('credits = credits - $2')
    expect(queryExecutor.queries[0]?.text).toContain('credits >= $2')
    expect(queryExecutor.queries[0]?.text).not.toContain('BEGIN')
    expect(queryExecutor.queries[0]?.text).not.toContain('COMMIT')
    expect(queryExecutor.queries[0]?.values).toEqual(['user-1', 2])
  })

  it('returns rowCount zero metadata when balance is insufficient', async function testInsufficientBalanceMetadata() {
    const queryExecutor = createMockQueryExecutor(function handleQuery() {
      return { rows: [], rowCount: 0 }
    })
    const repository = new CreditRepository(queryExecutor)

    const result = await repository.decrementCredits(queryExecutor, 'user-1', 99)

    expect(result).toEqual({ rowCount: 0, balance: null })
  })

  it('keeps concurrent deductions from over-drawing with conditional update semantics', async function testConcurrentDeductionSafety() {
    let credits = 1
    const queryExecutor = createMockQueryExecutor(function handleQuery(query) {
      const amount = Number(query.values[1])
      if (credits >= amount) {
        credits -= amount
        return { rows: [{ id: query.values[0], credits }], rowCount: 1 }
      }

      return { rows: [], rowCount: 0 }
    })
    const repository = new CreditRepository(queryExecutor)

    const [firstResult, secondResult] = await Promise.all([
      repository.decrementCredits(queryExecutor, 'user-1', 1),
      repository.decrementCredits(queryExecutor, 'user-1', 1),
    ])

    expect([firstResult.rowCount, secondResult.rowCount].sort()).toEqual([0, 1])
    expect(credits).toBe(0)
  })

  it('reads paginated transaction history newest first and scoped by user', async function testTransactionHistoryPagination() {
    const queryExecutor = createMockQueryExecutor(function handleQuery() {
      return {
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            user_id: '22222222-2222-4222-8222-222222222222',
            stripe_payment_intent_id: 'pi_123',
            amount: 500,
            credits_granted: 50,
            status: 'succeeded',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        rowCount: 1,
      }
    })
    const repository = new CreditRepository(queryExecutor)

    const result = await repository.getTransactionHistory({
      userId: '22222222-2222-4222-8222-222222222222',
      limit: 10,
      offset: 20,
    })

    expect(result).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        amount: 500,
        creditsGranted: 50,
        status: 'succeeded',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    expect(queryExecutor.queries[0]?.text).toContain('WHERE user_id = $1')
    expect(queryExecutor.queries[0]?.text).toContain('ORDER BY created_at DESC, id DESC')
    expect(queryExecutor.queries[0]?.text).toContain('LIMIT $2')
    expect(queryExecutor.queries[0]?.text).toContain('OFFSET $3')
    expect(queryExecutor.queries[0]?.values).toEqual([
      '22222222-2222-4222-8222-222222222222',
      10,
      20,
    ])
  })
})
