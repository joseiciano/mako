import {
  employmentRecordInputSchema,
  updateAccountProfileInputSchema,
  type AccountProfile,
  type EmploymentRecordInput,
  type UpdateAccountProfileInput,
} from '@mako/shared'
import { z } from 'zod'

export { employmentRecordInputSchema }
export type { EmploymentRecordInput }

export type AccountSession = {
  userId: string
  email: string
}

export class AccountUnauthorizedError extends Error {
  constructor(message = 'You must be authenticated to access this resource.') {
    super(message)
    this.name = 'AccountUnauthorizedError'
  }
}

export class AccountNotFoundError extends Error {
  constructor(message = 'Account was not found for the active session.') {
    super(message)
    this.name = 'AccountNotFoundError'
  }
}

export class AccountValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountValidationError'
  }
}

export class AccountForbiddenError extends Error {
  constructor(message = 'Account is inactive or deleted.') {
    super(message)
    this.name = 'AccountForbiddenError'
  }
}

export type AccountServiceLogger = {
  info(event: string, context: Record<string, unknown>): void
  error(event: string, context: Record<string, unknown>): void
}

export type AccountProfileRecord = AccountProfile

export function parseProfileUpdateInput(
  input: unknown,
): UpdateAccountProfileInput {
  const parsed = updateAccountProfileInputSchema.safeParse(input)

  if (!parsed.success) {
    const error = parsed.error.issues[0]
    throw new AccountValidationError(error?.message ?? 'Invalid profile input.')
  }

  return parsed.data
}

export const authenticatedUserIdSchema = z.string().uuid()

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

export const legacyAddCompanyRequestSchema = z
  .object({
    company: companyNameSchema,
    joined: joinedDateInputSchema,
  })
  .strict()

export const userCompanyRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  company: z.string(),
  role: z.string().nullable(),
  joined: z.string(),
  ended_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable().optional(),
})

export type UserCompanyRow = z.infer<typeof userCompanyRowSchema>

export const employmentRecordCompatibilityResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  company: z.string(),
  role: z.string().nullable(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  isComplete: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  joined: z.string().datetime(),
})

export type EmploymentRecordCompatibilityResponse = z.infer<
  typeof employmentRecordCompatibilityResponseSchema
>

export type UserCompany = EmploymentRecordCompatibilityResponse

export const getCompaniesResponseSchema = z.object({
  companies: z.array(employmentRecordCompatibilityResponseSchema),
})

export const addCompanyResponseSchema = z.object({
  company: employmentRecordCompatibilityResponseSchema,
})

export type GetCompaniesResponse = z.infer<typeof getCompaniesResponseSchema>
export type AddCompanyResponse = z.infer<typeof addCompanyResponseSchema>

export type CompanyRequest =
  | { kind: 'canonical'; data: EmploymentRecordInput }
  | { kind: 'legacy'; data: { company: string; joined: string } }

export function parseCompanyRequest(requestBody: unknown): CompanyRequest {
  if (!isRecord(requestBody)) {
    throw new AccountValidationError('Invalid request body.')
  }

  const hasCanonicalFields =
    'start' in requestBody || 'end' in requestBody || 'role' in requestBody
  const hasLegacyField = 'joined' in requestBody

  // Mixed payload: reject
  if (hasCanonicalFields && hasLegacyField) {
    throw new AccountValidationError('Cannot mix canonical and legacy fields.')
  }

  if (hasLegacyField) {
    return {
      kind: 'legacy',
      data: legacyAddCompanyRequestSchema.parse(requestBody),
    }
  }

  // Canonical
  return {
    kind: 'canonical',
    data: employmentRecordInputSchema.parse(requestBody),
  }
}

export function toUserCompany(
  rowInput: unknown,
): EmploymentRecordCompatibilityResponse {
  const row = userCompanyRowSchema.parse(rowInput)

  return {
    id: row.id,
    userId: row.user_id,
    company: row.company,
    role: row.role,
    start: extractDateOnly(row.joined),
    end: row.ended_at ? extractDateOnly(row.ended_at) : null,
    isComplete: row.role !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    joined: row.joined,
  }
}

export const deleteAccountResponseSchema = z.object({
  success: z.literal(true),
})

export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>

function extractDateOnly(isoTimestamp: string): string {
  // Timestamps are persisted as ISO-8601 UTC strings, so the first 10
  // characters are the UTC date (YYYY-MM-DD) without timezone drift.
  return isoTimestamp.slice(0, 10)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
