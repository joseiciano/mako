import { z } from 'zod'

const positiveIntegerSchema = z.number().int().positive()

export const creditUserIdSchema = z.string().min(1)
export const creditPaginationLimitSchema = z.number().int().positive().max(100).default(25)
export const creditPaginationOffsetSchema = z.number().int().nonnegative().default(0)
export const creditTransactionStatusSchema = z.string().trim().min(1)

export const creditTransactionRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  stripe_payment_intent_id: z.string().min(1),
  amount: z.number().int().positive(),
  credits_granted: z.number().int().positive(),
  status: creditTransactionStatusSchema,
  created_at: z.string(),
})

export type CreditTransactionRow = z.infer<typeof creditTransactionRowSchema>

export const creditBalanceSchema = z.object({
  userId: creditUserIdSchema,
  credits: z.number().int().nonnegative(),
})
export type CreditBalance = {
  userId: string
  credits: number
}


export const creditTransactionSchema = z.object({
  id: z.string(),
  userId: creditUserIdSchema,
  amount: positiveIntegerSchema,
  creditsGranted: positiveIntegerSchema,
  status: creditTransactionStatusSchema,
  createdAt: z.string(),
})
export type CreditTransaction = {
  id: string
  userId: string
  amount: number
  creditsGranted: number
  status: string
  createdAt: string
}

export type GrantCreditsInput = {
  userId: string
  amount: number
  creditsGranted: number
  stripePaymentIntentId: string
}

export const grantCreditsInputSchema = z.object({
  userId: creditUserIdSchema,
  amount: positiveIntegerSchema,
  creditsGranted: positiveIntegerSchema,
  stripePaymentIntentId: z.string().trim().min(1),
})

export type GrantCreditsResult = {
  balance: CreditBalance
  transaction: CreditTransaction
}

export type DeductCreditsResult = {
  balance: CreditBalance
}

export const deductCreditsInputSchema = z.object({
  userId: creditUserIdSchema,
  creditsToDeduct: positiveIntegerSchema,
})

export type DeductCreditsInput = z.infer<typeof deductCreditsInputSchema>

export type DecrementCreditsResult = {
  rowCount: number
  balance: CreditBalance | null
}

export type TransactionHistoryInput = {
  userId: string
  limit?: number
  offset?: number
}

export const transactionHistoryInputSchema = z.object({
  userId: creditUserIdSchema,
  limit: creditPaginationLimitSchema,
  offset: creditPaginationOffsetSchema,
})

export class CreditValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CreditValidationError'
  }
}

export class CreditAccountNotFoundError extends Error {
  constructor(message = 'Credit account was not found.') {
    super(message)
    this.name = 'CreditAccountNotFoundError'
  }
}

export class CreditInsufficientBalanceError extends Error {
  constructor(message = 'Insufficient credit balance.') {
    super(message)
    this.name = 'CreditInsufficientBalanceError'
  }
}

export class CreditIdempotencyConflictError extends Error {
  constructor(message = 'Credit grant already exists for this payment intent.') {
    super(message)
    this.name = 'CreditIdempotencyConflictError'
  }
}

export function parsePositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value <= 0) {
    throw new CreditValidationError(`${fieldName} must be a positive integer.`)
  }

  return value
}

export function parseGrantCreditsInput(input: unknown): GrantCreditsInput {
  const parsed = grantCreditsInputSchema.safeParse(input)

  if (!parsed.success) {
    throw new CreditValidationError(
      parsed.error.issues[0]?.message ?? 'Invalid credit grant input.',
    )
  }

  return parsed.data
}

export function parseDeductCreditsInput(input: unknown): DeductCreditsInput {
  const parsed = deductCreditsInputSchema.safeParse(input)

  if (!parsed.success) {
    throw new CreditValidationError(
      parsed.error.issues[0]?.message ?? 'Invalid credit deduction input.',
    )
  }

  return parsed.data
}

export function parseTransactionHistoryInput(input: unknown): Required<TransactionHistoryInput> {
  const parsed = transactionHistoryInputSchema.safeParse(input)

  if (!parsed.success) {
    throw new CreditValidationError(
      parsed.error.issues[0]?.message ?? 'Invalid credit transaction history input.',
    )
  }

  return parsed.data
}

export function toCreditTransaction(rowInput: unknown): CreditTransaction {
  const row = creditTransactionRowSchema.parse(rowInput)

  return {
    id: row.id,
    userId: row.user_id,
    amount: row.amount,
    creditsGranted: row.credits_granted,
    status: row.status,
    createdAt: row.created_at,
  }
}
