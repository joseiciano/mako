export type HealthResponse = {
  status: 'ok'
  service: string
  timestamp: string
}

export type AccountUser = {
  id: string
  email: string
  displayName: string
  credits: number
  freeStandardInterviews: number
  freeAiInterviews: number
  createdAt: string
}

export type AccountResponse = AccountUser

export type UpdateAccountRequest = {
  displayName: string
}

export type DeleteAccountResponse = {
  success: boolean
}

export function createHealthResponse(service: string): HealthResponse {
  return {
    status: 'ok',
    service,
    timestamp: new Date().toISOString(),
  }
}

export {
  accountProfileSchema,
  updateAccountProfileInputSchema,
} from './account'
export type { AccountProfile, UpdateAccountProfileInput } from './account'

export {
  cancelInterviewParamsSchema,
  cancelInterviewResponseSchema,
  createInterviewRequestSchema,
  createInterviewResponseSchema,
  defaultInterviewListLimit,
  interviewCreateScheduledAtSchema,
  interviewDetailResponseSchema,
  interviewDetailSchema,
  interviewListQuerySchema,
  interviewSchema,
  interviewListItemSchema,
  interviewListResponseSchema,
  interviewModeSchema,
  interviewScheduledAtSchema,
  interviewStatusSchema,
  interviewTierSchema,
  interviewTypeSchema,
  maxInterviewListLimit,
} from './interviews'
export type {
  CancelInterviewParams,
  CancelInterviewResponse,
  CreateInterviewRequest,
  CreateInterviewResponse,
  Interview,
  InterviewDetail,
  InterviewDetailResponse,
  InterviewListItem,
  InterviewListQuery,
  InterviewListResponse,
  InterviewMode,
  InterviewTier,
  InterviewType,
} from './interviews'

export {
  availabilityRequestSchema,
  availabilitySlotInputSchema,
  availabilitySlotSchema,
  createAvailabilityRequestSchema,
  createAvailabilityResponseSchema,
} from './availability'
export type {
  AvailabilityRequest,
  AvailabilitySlot,
  AvailabilitySlotInput,
  CreateAvailabilityRequest,
  CreateAvailabilityResponse,
} from './availability'
