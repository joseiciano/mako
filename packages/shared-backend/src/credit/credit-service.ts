import { createSqlQuery, rollbackTransactionSafely, type SqlQueryExecutor } from '../index'
import { CreditRepository } from './credit-repository'
import {
  CreditAccountNotFoundError,
  CreditIdempotencyConflictError,
  CreditInsufficientBalanceError,
  parseDeductCreditsInput,
  parseGrantCreditsInput,
  parseTransactionHistoryInput,
  type CreditBalance,
  type CreditTransactionHistory,
  type DeductCreditsResult,
  type GrantCreditsInput,
  type GrantCreditsResult,
  type TransactionHistoryInput,
} from './types'

type CreditIdFactory = () => string

const defaultCreateId: CreditIdFactory = function createRandomId() {
  return crypto.randomUUID()
}

export class CreditService {
  constructor(
    private readonly creditRepository: CreditRepository,
    private readonly queryExecutor: SqlQueryExecutor,
    private readonly createId: CreditIdFactory = defaultCreateId,
  ) {}

  async grantCredits(
    inputOrUserId: GrantCreditsInput | string,
    amount?: number,
    creditsGranted?: number,
    stripePaymentIntentId?: string,
  ): Promise<GrantCreditsResult> {
    const input = parseGrantCreditsInput(
      typeof inputOrUserId === 'string'
        ? {
            userId: inputOrUserId,
            amount,
            creditsGranted,
            stripePaymentIntentId,
          }
        : inputOrUserId,
    )

    await this.queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const transaction = await this.creditRepository.insertCreditTransaction(
        this.queryExecutor,
        {
          ...input,
          transactionId: this.createId(),
        },
      )

      if (!transaction) {
        throw new CreditIdempotencyConflictError()
      }

      const balance = await this.creditRepository.incrementCredits(
        this.queryExecutor,
        input.userId,
        input.creditsGranted,
      )

      if (!balance) {
        throw new CreditAccountNotFoundError()
      }

      await this.queryExecutor.query(createSqlQuery('COMMIT;'))

      return { balance, transaction }
    } catch (error) {
      await rollbackTransactionSafely(this.queryExecutor)
      throw error
    }
  }

  async deductCredits(userId: string, creditsToDeduct: number): Promise<DeductCreditsResult> {
    const input = parseDeductCreditsInput({ userId, creditsToDeduct })

    await this.queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const deductionResult = await this.creditRepository.decrementCredits(
        this.queryExecutor,
        input.userId,
        input.creditsToDeduct,
      )

      if (!deductionResult.balance || deductionResult.rowCount === 0) {
        throw new CreditInsufficientBalanceError()
      }

      await this.queryExecutor.query(createSqlQuery('COMMIT;'))

      return { balance: deductionResult.balance }
    } catch (error) {
      await rollbackTransactionSafely(this.queryExecutor)
      throw error
    }
  }

  async getCreditBalance(userId: string): Promise<CreditBalance> {
    const inputUserId = parseTransactionHistoryInput({ userId, limit: 1, offset: 0 }).userId
    const balance = await this.creditRepository.getCreditBalance(inputUserId)

    if (!balance) {
      throw new CreditAccountNotFoundError()
    }

    return balance
  }

  async getTransactionHistory(input: TransactionHistoryInput): Promise<CreditTransactionHistory> {
    const parsedInput = parseTransactionHistoryInput(input)
    const transactions = await this.creditRepository.getTransactionHistory(parsedInput)
    const total = await this.creditRepository.countTransactionHistory(parsedInput.userId)

    return { transactions, total }
  }
}
