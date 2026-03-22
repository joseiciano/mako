import { z } from 'zod'

export const accountProfileSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  displayName: z.string().min(1),
  credits: z.number().int().nonnegative(),
  freeStandardInterviews: z.number().int().nonnegative(),
  freeAiInterviews: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
})

export const updateAccountProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
})

export type AccountProfile = z.infer<typeof accountProfileSchema>
export type UpdateAccountProfileInput = z.infer<
  typeof updateAccountProfileInputSchema
>
