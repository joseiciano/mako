import {
  creditTransactionHistoryQuerySchema,
  creditTransactionHistoryResponseSchema,
  type CreditTransactionHistoryResponse,
} from '@mako/shared'
import type { Context, Hono } from 'hono'
import type { AccountSession } from '../account/types'
import type { CreditService } from './credit-service'
import { CreditValidationError, type CreditTransactionHistory } from './types'

type ControllerBindings = Record<string, unknown>

export type CreditControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: { bindings: Bindings }) => CreditService
  resolveSession: (
    context: Context<{ Bindings: Bindings }>,
  ) => Promise<AccountSession | null> | AccountSession | null
}

export function registerCreditController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: CreditControllerOptions<Bindings>,
): void {
  app.get('/api/account/transactions', async function getTransactionHistoryHandler(c) {
    const session = await options.resolveSession(c)

    if (!session) {
      return c.json({ error: 'You must be authenticated to access this resource.' }, 401)
    }

    const creditService = options.createService({ bindings: c.env })
    const parsedInput = parseTransactionHistoryQuery(c, session.userId)

    if (!parsedInput) {
      return c.json({ error: 'Invalid request payload' }, 400)
    }

    try {
      const history = await creditService.getTransactionHistory(parsedInput)
      return c.json(
        creditTransactionHistoryResponseSchema.parse(toTransactionHistoryResponse(history)),
        200,
      )
    } catch (error) {
      return toErrorResponse(c, error)
    }
  })
}

function parseTransactionHistoryQuery<Bindings extends ControllerBindings>(
  context: Context<{ Bindings: Bindings }>,
  userId: string,
): { userId: string; limit: number; offset: number } | null {
  const rawLimit = context.req.query('limit')
  const rawOffset = context.req.query('offset')

  const parsed = creditTransactionHistoryQuerySchema.safeParse({
    limit: rawLimit,
    offset: rawOffset,
  })

  return parsed.success ? { userId, ...parsed.data } : null
}

function toTransactionHistoryResponse(
  history: CreditTransactionHistory,
): CreditTransactionHistoryResponse {
  return {
    transactions: history.transactions.map(function toSafeTransaction(transaction) {
      return {
        id: transaction.id,
        amount: transaction.amount,
        credits_granted: transaction.creditsGranted,
        status: transaction.status,
        created_at: transaction.createdAt,
      }
    }),
    total: history.total,
  }
}

function toErrorResponse(context: Context, error: unknown) {
  if (error instanceof CreditValidationError) {
    return context.json({ error: 'Invalid request payload' }, 400)
  }

  return context.json({ error: 'Unexpected credit error.' }, 500)
}
