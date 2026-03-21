import { z } from 'zod'

export const accountUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  credits: z.number().int().nonnegative(),
  free_standard_interviews: z.number().int().nonnegative(),
  free_ai_interviews: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
})

export const deleteAccountResponseSchema = z.object({
  success: z.literal(true),
})

export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>
