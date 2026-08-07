import { createSqlQuery, type SqlQueryExecutor } from '../index'
import {
  parseTransactionHistoryInput,
  toCreditTransaction,
  type CreditBalance,
  type CreditTransaction,
  type CreditTransactionRow,
  type DecrementCreditsResult,
  type GrantCreditsInput,
  type TransactionHistoryInput,
} from './types'

type CreditRepositoryDependencies = {
  queryExecutor?: SqlQueryExecutor
}

type CreditRepositoryConstructorInput = SqlQueryExecutor | CreditRepositoryDependencies

type CreditBalanceRow = {
  id: string
  credits: number
}

export class CreditRepository {
  private readonly dependencies: CreditRepositoryDependencies

  constructor(input: CreditRepositoryConstructorInput) {
    if (isQueryExecutor(input)) {
      this.dependencies = { queryExecutor: input }
      return
    }

    this.dependencies = input
  }

  async decrementCredits(
    queryExecutor: SqlQueryExecutor,
    userId: string,
    amount: number,
  ): Promise<DecrementCreditsResult> {
    const result = await queryExecutor.query<CreditBalanceRow>(
      createSqlQuery(
        `
          UPDATE "user"
          SET credits = credits - $2,
              "updatedAt" = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
            AND credits >= $2
          RETURNING id, credits;
        `,
        [userId, amount],
      ),
    )
    const [balanceRow] = result.rows

    return {
      rowCount: result.rowCount ?? result.rows.length,
      balance: balanceRow ? toCreditBalance(balanceRow) : null,
    }
  }

  async incrementCredits(
    queryExecutor: SqlQueryExecutor,
    userId: string,
    creditsGranted: number,
  ): Promise<CreditBalance | null> {
    const result = await queryExecutor.query<CreditBalanceRow>(
      createSqlQuery(
        `
          UPDATE "user"
          SET credits = credits + $2,
              "updatedAt" = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id, credits;
        `,
        [userId, creditsGranted],
      ),
    )
    const [balanceRow] = result.rows

    return balanceRow ? toCreditBalance(balanceRow) : null
  }

  async insertCreditTransaction(
    queryExecutor: SqlQueryExecutor,
    input: GrantCreditsInput & { transactionId: string },
  ): Promise<CreditTransaction | null> {
    const createdAt = new Date().toISOString()
    const result = await queryExecutor.query<CreditTransactionRow>(
      createSqlQuery(
        `
          INSERT INTO credit_transactions (
            id,
            user_id,
            stripe_payment_intent_id,
            amount,
            credits_granted,
            status,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, 'succeeded', $6)
          ON CONFLICT (stripe_payment_intent_id) DO NOTHING
          RETURNING
            id,
            user_id,
            stripe_payment_intent_id,
            amount,
            credits_granted,
            status,
            created_at;
        `,
        [
          input.transactionId,
          input.userId,
          input.stripePaymentIntentId,
          input.amount,
          input.creditsGranted,
          createdAt,
        ],
      ),
    )
    const [transactionRow] = result.rows

    return transactionRow ? toCreditTransaction(transactionRow) : null
  }

  async getCreditBalance(userId: string): Promise<CreditBalance | null> {
    const result = await this.getQueryExecutor().query<CreditBalanceRow>(
      createSqlQuery(
        `
          SELECT id, credits
          FROM "user"
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1;
        `,
        [userId],
      ),
    )
    const [balanceRow] = result.rows

    return balanceRow ? toCreditBalance(balanceRow) : null
  }

  async getTransactionHistory(input: TransactionHistoryInput): Promise<CreditTransaction[]> {
    const parsedInput = parseTransactionHistoryInput(input)
    const queryExecutor = this.getQueryExecutor()
    const result = await queryExecutor.query<CreditTransactionRow>(
      createSqlQuery(
        `
          SELECT
            id,
            user_id,
            stripe_payment_intent_id,
            amount,
            credits_granted,
            status,
            created_at
          FROM credit_transactions
          WHERE user_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2
          OFFSET $3;
        `,
        [parsedInput.userId, parsedInput.limit, parsedInput.offset],
      ),
    )

    return result.rows.map(toCreditTransaction)
  }

  async countTransactionHistory(userId: string): Promise<number> {
    const countResult = await this.getQueryExecutor().query<{ count: string }>(
      createSqlQuery(
        `
          SELECT COUNT(*) AS count
          FROM credit_transactions
          WHERE user_id = $1;
        `,
        [userId],
      ),
    )

    return Number(countResult.rows[0]?.count ?? 0)
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.dependencies.queryExecutor

    if (!queryExecutor) {
      throw new Error('CreditRepository requires a query executor.')
    }

    return queryExecutor
  }
}

function isQueryExecutor(input: CreditRepositoryConstructorInput): input is SqlQueryExecutor {
  return typeof (input as SqlQueryExecutor).query === 'function'
}

function toCreditBalance(row: CreditBalanceRow): CreditBalance {
  return {
    userId: row.id,
    credits: row.credits,
  }
}
