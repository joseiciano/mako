import { describe, expect, it } from 'vitest'
import type { QueryResult, SqlQuery, SqlQueryExecutor } from '../index'
import { CreditRepository } from './credit-repository'
import { CreditService } from './credit-service'
import {
  CreditAccountNotFoundError,
  CreditIdempotencyConflictError,
  CreditInsufficientBalanceError,
} from './types'

type MockQueryExecutor = SqlQueryExecutor & { queries: SqlQuery[] }

function createMockQueryExecutor(handler: (query: SqlQuery) => QueryResult<unknown>): MockQueryExecutor {
  const queries: SqlQuery[] = []

  return {
    queries,
    async query<Row>(query: SqlQuery): Promise<QueryResult<Row>> {
      queries.push(query)
      return handler(query) as QueryResult<Row>
    },
  }
}

function createService(queryExecutor: MockQueryExecutor): CreditService {
  return new CreditService(new CreditRepository(queryExecutor), queryExecutor, function createId() {
    return '11111111-1111-4111-8111-111111111111'
  })
}

describe('CreditService', function creditServiceSuite() {
  it('grants credits by inserting ledger row and incrementing balance in one transaction', async function testGrantCreditsTransaction() {
    const queryExecutor = createMockQueryExecutor(function handleQuery(query) {
      if (query.text === 'BEGIN;' || query.text === 'COMMIT;' || query.text === 'ROLLBACK;') {
        return { rows: [], rowCount: 0 }
      }

      if (query.text.includes('INSERT INTO "Credit_Transactions"')) {
        return {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              user_id: query.values[1],
              stripe_payment_intent_id: query.values[2],
              amount: query.values[3],
              credits_granted: query.values[4],
              status: 'succeeded',
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
          rowCount: 1,
        }
      }

      if (query.text.includes('SET credits = credits + $2')) {
        return { rows: [{ id: query.values[0], credits: 75 }], rowCount: 1 }
      }

      return { rows: [], rowCount: 0 }
    })
    const service = createService(queryExecutor)

    const result = await service.grantCredits({
      userId: '22222222-2222-4222-8222-222222222222',
      amount: 500,
      creditsGranted: 50,
      stripePaymentIntentId: 'pi_123',
    })

    expect(result).toEqual({
      balance: { userId: '22222222-2222-4222-8222-222222222222', credits: 75 },
      transaction: {
        id: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        amount: 500,
        creditsGranted: 50,
        status: 'succeeded',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(queryExecutor.queries.map(function toText(query) { return query.text })).toEqual([
      'BEGIN;',
      expect.stringContaining('INSERT INTO "Credit_Transactions"'),
      expect.stringContaining('SET credits = credits + $2'),
      'COMMIT;',
    ])
  })

  it('does not increment balance when payment intent already exists', async function testDuplicateGrantDoesNotDoubleGrant() {
    const queryExecutor = createMockQueryExecutor(function handleQuery(query) {
      if (query.text === 'BEGIN;' || query.text === 'COMMIT;' || query.text === 'ROLLBACK;') {
        return { rows: [], rowCount: 0 }
      }

      if (query.text.includes('INSERT INTO "Credit_Transactions"')) {
        return { rows: [], rowCount: 0 }
      }

      if (query.text.includes('SET credits = credits + $2')) {
        throw new Error('must not increment duplicate grant')
      }

      return { rows: [], rowCount: 0 }
    })
    const service = createService(queryExecutor)

    await expect(
      service.grantCredits({
        userId: '22222222-2222-4222-8222-222222222222',
        amount: 500,
        creditsGranted: 50,
        stripePaymentIntentId: 'pi_123',
      }),
    ).rejects.toBeInstanceOf(CreditIdempotencyConflictError)

    expect(queryExecutor.queries.map(function toText(query) { return query.text })).toEqual([
      'BEGIN;',
      expect.stringContaining('INSERT INTO "Credit_Transactions"'),
      'ROLLBACK;',
    ])
  })

  it('rolls back grant when user balance cannot be incremented', async function testGrantUserNotFoundRollback() {
    const queryExecutor = createMockQueryExecutor(function handleQuery(query) {
      if (query.text === 'BEGIN;' || query.text === 'COMMIT;' || query.text === 'ROLLBACK;') {
        return { rows: [], rowCount: 0 }
      }

      if (query.text.includes('INSERT INTO "Credit_Transactions"')) {
        return {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              user_id: query.values[1],
              stripe_payment_intent_id: query.values[2],
              amount: query.values[3],
              credits_granted: query.values[4],
              status: 'succeeded',
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
          rowCount: 1,
        }
      }

      if (query.text.includes('SET credits = credits + $2')) {
        return { rows: [], rowCount: 0 }
      }

      return { rows: [], rowCount: 0 }
    })
    const service = createService(queryExecutor)

    await expect(
      service.grantCredits({
        userId: '22222222-2222-4222-8222-222222222222',
        amount: 500,
        creditsGranted: 50,
        stripePaymentIntentId: 'pi_123',
      }),
    ).rejects.toBeInstanceOf(CreditAccountNotFoundError)

    expect(queryExecutor.queries.at(-1)?.text).toBe('ROLLBACK;')
  })

  it('deducts credits as standalone transaction', async function testDeductCreditsTransaction() {
    const queryExecutor = createMockQueryExecutor(function handleQuery(query) {
      if (query.text === 'BEGIN;' || query.text === 'COMMIT;' || query.text === 'ROLLBACK;') {
        return { rows: [], rowCount: 0 }
      }

      if (query.text.includes('credits = credits - $2')) {
        return { rows: [{ id: query.values[0], credits: 3 }], rowCount: 1 }
      }

      return { rows: [], rowCount: 0 }
    })
    const service = createService(queryExecutor)

    await expect(service.deductCredits('22222222-2222-4222-8222-222222222222', 2)).resolves.toEqual({
      balance: { userId: '22222222-2222-4222-8222-222222222222', credits: 3 },
    })
    expect(queryExecutor.queries.map(function toText(query) { return query.text })).toEqual([
      'BEGIN;',
      expect.stringContaining('credits = credits - $2'),
      'COMMIT;',
    ])
  })

  it('rolls back standalone deduction when balance is insufficient', async function testInsufficientDeductionRollback() {
    const queryExecutor = createMockQueryExecutor(function handleQuery(query) {
      if (query.text === 'BEGIN;' || query.text === 'COMMIT;' || query.text === 'ROLLBACK;') {
        return { rows: [], rowCount: 0 }
      }

      if (query.text.includes('credits = credits - $2')) {
        return { rows: [], rowCount: 0 }
      }

      return { rows: [], rowCount: 0 }
    })
    const service = createService(queryExecutor)

    await expect(
      service.deductCredits('22222222-2222-4222-8222-222222222222', 2),
    ).rejects.toBeInstanceOf(CreditInsufficientBalanceError)

    expect(queryExecutor.queries.at(-1)?.text).toBe('ROLLBACK;')
  })
})
