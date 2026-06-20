import {
  cancelInterviewResponseSchema,
  createInterviewResponseSchema,
  defaultInterviewListLimit,
  interviewDetailResponseSchema,
  interviewDetailSchema,
  interviewListItemSchema,
  interviewSchema,
  interviewListResponseSchema,
  interviewStatusSchema,
  interviewTierSchema,
  interviewTypeSchema,
  maxInterviewListLimit,
  provisionInterviewResponseSchema,
  type CancelInterviewResponse,
  type CreateInterviewResponse,
  type Interview,
  type InterviewDetail,
  type InterviewDetailResponse,
  type InterviewListItem,
  type InterviewListResponse,
  type ProvisionInterviewResponse,
} from '@mako/shared'
import { z } from 'zod'

export { defaultInterviewListLimit, maxInterviewListLimit }
export type { InterviewDetail }

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

export class InterviewConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InterviewConflictError'
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

export const listParticipantInterviewsInputSchema = z.object({
  participant_user_id: authenticatedInterviewUserIdSchema,
  status: interviewStatusValueSchema.optional(),
  limit: z.number().int().positive().max(maxInterviewListLimit).default(defaultInterviewListLimit),
  offset: z.number().int().nonnegative().default(0),
})

export type ListParticipantInterviewsInput = z.input<
  typeof listParticipantInterviewsInputSchema
>

export type ParsedListParticipantInterviewsInput = z.output<
  typeof listParticipantInterviewsInputSchema
>

export const getParticipantInterviewByIdInputSchema = z.object({
  interview_id: z.string().uuid(),
  participant_user_id: authenticatedInterviewUserIdSchema,
})

export type GetParticipantInterviewByIdInput = z.infer<
  typeof getParticipantInterviewByIdInputSchema
>

export const cancelInterviewRecordInputSchema = z.object({
  interview_id: z.string().uuid(),
  participant_user_id: authenticatedInterviewUserIdSchema,
  updated_at: z.string().datetime({ offset: true }),
})

export type CancelInterviewRecordInput = z.infer<
  typeof cancelInterviewRecordInputSchema
>

export type CancelInterviewRecordResult =
  | {
      outcome: 'cancelled'
      interview: Interview
    }
  | {
      outcome: 'already_cancelled'
      interview: Interview
    }
  | {
      outcome: 'invalid_status'
      interview: Interview
    }
  | {
      outcome: 'not_found'
    }

export const provisionInterviewRecordInputSchema = z.object({
  interview_id: z.string().uuid(),
  participant_user_id: authenticatedInterviewUserIdSchema,
  realtime_session_id: z.string().min(1),
  excalidraw_room_id: z.string().min(1),
  excalidraw_key: z.string().min(1),
  updated_at: z.string().datetime({ offset: true }),
})

export type ProvisionInterviewRecordInput = z.infer<
  typeof provisionInterviewRecordInputSchema
>

export type ProvisionInterviewRecordResult =
  | {
      outcome: 'provisioned' | 'already_provisioned'
      interview: Interview
    }
  | {
      outcome: 'invalid_status'
      interview: Interview
    }
  | {
      outcome: 'not_found'
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
  scheduled_at: z.string().datetime({ offset: true }),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  policy_consumption: interviewCreateConsumptionSchema,
})

export type CreateInterviewRecordInput = z.infer<
  typeof createInterviewRecordInputSchema
>

export function parseInterview(input: unknown): Interview {
  return interviewSchema.parse(input)
}

export function parseInterviewListItem(input: unknown): InterviewListItem {
  return interviewListItemSchema.parse(input)
}

export function parseInterviewDetail(input: unknown): InterviewDetail {
  return interviewDetailSchema.parse(input)
}

export function toCreateInterviewResponse(
  interviewInput: unknown,
): CreateInterviewResponse {
  return createInterviewResponseSchema.parse({
    interview: parseInterviewDetail(interviewInput),
  })
}

export function toInterviewListResponse(
  interviewsInput: unknown,
): InterviewListResponse {
  const parsedInterviews = Array.isArray(interviewsInput)
    ? interviewsInput.map(function parseInterviewInput(interviewInput) {
        return parseInterviewListItem(interviewInput)
      })
    : interviewsInput

  return interviewListResponseSchema.parse({
    interviews: parsedInterviews,
  })
}

export function toInterviewDetailResponse(
  interviewInput: unknown,
): InterviewDetailResponse {
  return interviewDetailResponseSchema.parse({
    interview: parseInterviewDetail(interviewInput),
  })
}

export function toCancelInterviewResponse(): CancelInterviewResponse {
  return cancelInterviewResponseSchema.parse({
    success: true,
  })
}

export function toProvisionInterviewResponse(
  interviewInput: unknown,
  token: string,
): ProvisionInterviewResponse {
  const interview = parseInterview(interviewInput)

  if (
    !interview.realtime_session_id ||
    !interview.excalidraw_room_id ||
    !interview.excalidraw_key
  ) {
    throw new InterviewBusinessRuleError('Interview provisioning credentials are incomplete.')
  }

  return provisionInterviewResponseSchema.parse({
    mode: interview.mode,
    realtime: {
      realtime_session_id: interview.realtime_session_id,
      token,
    },
    excalidraw: {
      excalidraw_room_id: interview.excalidraw_room_id,
      excalidraw_key: interview.excalidraw_key,
    },
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
