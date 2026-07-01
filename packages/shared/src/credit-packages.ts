import { z } from 'zod'

export const creditPackageSchema = z.object({
  package_id: z.string().min(1),
  display_name: z.string().min(1),
  amount_cents: z.number().int().positive(),
  credits_granted: z.number().int().positive(),
})
export type CreditPackage = z.infer<typeof creditPackageSchema>

export const creditPackageListResponseSchema = z.object({
  packages: z.array(creditPackageSchema),
})
export type CreditPackageListResponse = z.infer<typeof creditPackageListResponseSchema>

export const createPaymentIntentRequestSchema = z.object({
  package_id: z.string().min(1),
})
export type CreatePaymentIntentRequest = z.infer<typeof createPaymentIntentRequestSchema>

export const createPaymentIntentResponseSchema = z.object({
  client_secret: z.string().min(1),
})
export type CreatePaymentIntentResponse = z.infer<typeof createPaymentIntentResponseSchema>
