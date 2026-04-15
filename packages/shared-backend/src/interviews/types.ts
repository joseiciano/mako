import {
  createInterviewResponseSchema,
  interviewSchema,
  interviewStatusSchema,
  interviewTierSchema,
  interviewTypeSchema,
  type CreateInterviewResponse,
  type Interview,
} from '@mako/shared'
import { z } from 'zod'

export type InterviewSession = {
  userId: string
  email: string
}

export class InterviewUnauthorizedError extends Error {
  constructor(message = 'You must be authenticated to access this resource.') {
    super(message)
    this.name = 'InterviewUnauthorizedError'
  }
}

export class InterviewNotFoundError extends Error {
  constructor(message = 'Account was not found for the active session.') {
    super(message)
    this.name = 'InterviewNotFoundError'
  }
}

export class InterviewValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InterviewValidationError'
  }
}

export class InterviewBusinessRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InterviewBusinessRuleError'
  }
}

export class InterviewPolicyConflictError extends Error {
  constructor(message = 'Interview create policy could not be reserved.') {
    super(message)
    this.name = 'InterviewPolicyConflictError'
  }
}

export const authenticatedInterviewUserIdSchema = z.string().uuid()

export const interviewAccountPolicySchema = z.object({
  credits: z.number().int().nonnegative(),
  free_ai_interviews: z.number().int().nonnegative(),
})

export type InterviewAccountPolicy = z.infer<typeof interviewAccountPolicySchema>

export const interviewCreateConsumptionSchema = z.enum([
  'free_ai_interview',
  'credit',
])

export type InterviewCreateConsumption = z.infer<
  typeof interviewCreateConsumptionSchema
>

export const interviewTypeValueSchema = z.enum(
  toNonEmptyEnumValues(interviewTypeSchema.options),
)

export const interviewTierValueSchema = z.enum(
  toNonEmptyEnumValues(interviewTierSchema.options),
)

export const interviewStatusValueSchema = z.enum(
  toNonEmptyEnumValues(interviewStatusSchema.options),
)

export type InterviewTier = z.infer<typeof interviewTierValueSchema>

export type InterviewPolicyConfig = {
  freeAiInterviewTier: InterviewTier
  creditAiInterviewTier: InterviewTier
}

export type ResolvedInterviewCreatePolicy = {
  tier: InterviewTier
  consumption: InterviewCreateConsumption
}

export const createInterviewRecordInputSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  scheduler_alias: z.string().min(1),
  interviewer_id: z.null(),
  interviewer_alias: z.string().min(1),
  type: interviewTypeValueSchema,
  mode: z.literal('ai_led'),
  tier: interviewTierValueSchema,
  status: interviewStatusValueSchema,
  scheduled_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  policy_consumption: interviewCreateConsumptionSchema,
})

export type CreateInterviewRecordInput = z.infer<
  typeof createInterviewRecordInputSchema
>

export function parseInterview(input: unknown): Interview {
  return interviewSchema.parse(input)
}

export function toCreateInterviewResponse(
  interviewInput: unknown,
): CreateInterviewResponse {
  return createInterviewResponseSchema.parse({
    interview: parseInterview(interviewInput),
  })
}

function toNonEmptyEnumValues<Value extends string>(
  values: readonly Value[],
): [Value, ...Value[]] {
  const [firstValue, ...remainingValues] = values

  if (firstValue === undefined) {
    throw new Error('Expected at least one enum value.')
  }

  return [firstValue, ...remainingValues]
}
