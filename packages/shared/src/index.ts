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
  aiChatHistoryMessageSchema,
  aiChatParamsSchema,
  aiChatRequestSchema,
  aiChatResponseSchema,
  aiChatMaxHistoryContentLength,
  aiChatMaxHistoryMessages,
  aiChatMaxMessageLength,
  aiChatMaxSceneBytes,
  artifactAvailabilitySchema,
  artifactKindSchema,
  cancelInterviewParamsSchema,
  cancelInterviewResponseSchema,
  createInterviewRequestSchema,
  createInterviewResponseSchema,
  defaultInterviewListLimit,
  endInterviewParamsSchema,
  feedbackDimensionSchema,
  feedbackErrorCodeSchema,
  feedbackImprovementSchema,
  feedbackStatusSchema,
  feedbackStrengthSchema,
  feedbackUnavailableReasonSchema,
  interviewCreateScheduledAtSchema,
  interviewDetailResponseSchema,
  interviewDetailSchema,
  interviewFeedbackStatusResponseSchema,
  interviewFeedbackRowSchema,
  interviewFeedbackSchema,
  interviewFeedbackV1Schema,
  interviewLifecycleResponseSchema,
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
  provisionInterviewParamsSchema,
  provisionInterviewResponseSchema,
  recordingStatusSchema,
  startInterviewParamsSchema,
} from './interviews'
export type {
  AiChatHistoryMessage,
  AiChatParams,
  AiChatRequest,
  AiChatResponse,
  ArtifactAvailability,
  ArtifactKind,
  CancelInterviewParams,
  CancelInterviewResponse,
  CreateInterviewRequest,
  CreateInterviewResponse,
  EndInterviewParams,
  FeedbackDimension,
  FeedbackErrorCode,
  FeedbackImprovement,
  FeedbackStatus,
  FeedbackStrength,
  FeedbackUnavailableReason,
  Interview,
  InterviewDetail,
  InterviewDetailResponse,
  InterviewFeedbackStatusResponse,
  InterviewFeedback,
  InterviewFeedbackV1,
  InterviewLifecycleResponse,
  InterviewListItem,
  InterviewListQuery,
  InterviewListResponse,
  InterviewMode,
  InterviewTier,
  InterviewType,
  ProvisionInterviewParams,
  ProvisionInterviewResponse,
  RecordingStatus,
  StartInterviewParams,
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

export {
  creditPackageSchema,
  creditPackageListResponseSchema,
  createPaymentIntentRequestSchema,
  createPaymentIntentResponseSchema,
} from './credit-packages'
export {
  creditTransactionHistoryQuerySchema,
  creditTransactionSchema,
  creditTransactionHistoryResponseSchema,
  defaultCreditTransactionHistoryLimit,
  maxCreditTransactionHistoryLimit,
} from './credit'
export type {
  CreditTransaction,
  CreditTransactionHistoryQuery,
  CreditTransactionHistoryResponse,
} from './credit'
export type {
  CreditPackage,
  CreditPackageListResponse,
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
} from './credit-packages'

export {
  employmentCompanyNameSchema,
  employmentHistorySnapshotReadSchema,
  employmentHistorySnapshotSchema,
  employmentRecordCompatibilityResponseSchema,
  employmentRecordInputSchema,
  employmentRecordSchema,
} from './employment'
export type {
  EmploymentHistorySnapshot,
  EmploymentHistorySnapshotRead,
  EmploymentRecord,
  EmploymentRecordCompatibilityResponse,
  EmploymentRecordInput,
} from './employment'

export {
  applicationEmploymentHistoryEntrySchema,
  interviewerApplicationRequestSchema,
  interviewerApplicationResponseSchema,
  interviewerApplicationSchema,
  interviewerApplicationStatusResponseSchema,
  interviewerApplicationStatusSchema,
} from './interviewer-application'
export type {
  ApplicationEmploymentHistoryEntry,
  InterviewerApplication,
  InterviewerApplicationRequest,
  InterviewerApplicationResponse,
  InterviewerApplicationStatus,
  InterviewerApplicationStatusResponse,
} from './interviewer-application'
