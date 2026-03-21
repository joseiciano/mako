import { z } from 'zod'

export const authenticatedUserIdSchema = z.uuid()

export const companyNameSchema = z
  .string()
  .trim()
  .min(1, 'Company is required')
  .max(120, 'Company must be 120 characters or fewer')
  .transform(function normalizeCompanyName(value) {
    return value.toLowerCase()
  })

export const joinedDateInputSchema = z
  .string()
  .trim()
  .min(1, 'Joined date is required')
  .refine(function hasValidDate(value) {
    return !Number.isNaN(Date.parse(value))
  }, 'Joined date must be a valid date string')
  .transform(function normalizeJoinedDate(value) {
    return new Date(value).toISOString()
  })

export const addCompanyRequestSchema = z.object({
  company: companyNameSchema,
  joined: joinedDateInputSchema,
})

export const userCompanyRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  company: z.string(),
  joined: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable().optional(),
})

export type UserCompanyRow = z.infer<typeof userCompanyRowSchema>

export const userCompanySchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  company: z.string(),
  joined: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type UserCompany = z.infer<typeof userCompanySchema>

export const getCompaniesResponseSchema = z.object({
  companies: z.array(userCompanySchema),
})

export const addCompanyResponseSchema = z.object({
  company: userCompanySchema,
})

export type GetCompaniesResponse = z.infer<typeof getCompaniesResponseSchema>
export type AddCompanyResponse = z.infer<typeof addCompanyResponseSchema>

export function toUserCompany(rowInput: unknown): UserCompany {
  const row = userCompanyRowSchema.parse(rowInput)

  return {
    id: row.id,
    userId: row.user_id,
    company: row.company,
    joined: row.joined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
