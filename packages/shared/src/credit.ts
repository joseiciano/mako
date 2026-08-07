import { z } from 'zod'

export const defaultCreditTransactionHistoryLimit = 20
export const maxCreditTransactionHistoryLimit = 100

export const creditTransactionSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().nonnegative(),
  credits_granted: z.number().int().nonnegative(),
  status: z.string().min(1),
  created_at: z.string(),
})
export type CreditTransaction = z.infer<typeof creditTransactionSchema>

export const creditTransactionHistoryResponseSchema = z.object({
  transactions: z.array(creditTransactionSchema),
  total: z.number().int().nonnegative(),
})
export type CreditTransactionHistoryResponse = z.infer<
  typeof creditTransactionHistoryResponseSchema
>

export const creditTransactionHistoryQuerySchema = z
  .object({
    limit: queryIntegerParameterSchema(
      z.coerce.number().int().positive().max(maxCreditTransactionHistoryLimit),
    ).default(defaultCreditTransactionHistoryLimit),
    offset: queryIntegerParameterSchema(
      z.coerce.number().int().nonnegative(),
    ).default(0),
  })
  .strict()

export type CreditTransactionHistoryQuery = z.infer<
  typeof creditTransactionHistoryQuerySchema
>

function queryIntegerParameterSchema<TSchema extends z.ZodType<number>>(
  schema: TSchema,
) {
  return z.preprocess(
    function normalizeQueryIntegerInput(value) {
      if (value === undefined) {
        return undefined
      }

      if (typeof value === 'string' && value.trim() === '') {
        return Number.NaN
      }

      return value
    },
    schema.optional(),
  )
}
