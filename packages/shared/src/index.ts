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
  bookingChannelSchema,
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
  consentDecisionSchema,
  interviewCreateScheduledAtSchema,
  interviewCancellationReasonSchema,
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
  interviewIdParamsSchema,
  interviewStatusSchema,
  interviewTierSchema,
  interviewTypeSchema,
  maxInterviewListLimit,
  provisionInterviewParamsSchema,
  provisionInterviewResponseSchema,
  recordingConsentRequestSchema,
  recordingConsentResponseSchema,
  recordingStatusSchema,
  realtimekitRecordingStateSchema,
  realtimekitWebhookEventTypeSchema,
  realtimekitWebhookPayloadSchema,
  screenshotUploadRequestSchema,
  screenshotUploadResponseSchema,
  startInterviewParamsSchema,
} from './interviews'
export type {
  AiChatHistoryMessage,
  AiChatParams,
  AiChatRequest,
  AiChatResponse,
  ArtifactAvailability,
  ArtifactKind,
  BookingChannel,
  CancelInterviewParams,
  CancelInterviewResponse,
  ConsentDecision,
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
  InterviewCancellationReason,
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
  InterviewIdParams,
  InterviewTier,
  InterviewType,
  ProvisionInterviewParams,
  ProvisionInterviewResponse,
  RecordingConsentRequest,
  RecordingConsentResponse,
  RecordingStatus,
  RealtimeKitRecordingState,
  RealtimeKitWebhookPayload,
  ScreenshotUploadRequest,
  ScreenshotUploadResponse,
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

export {
  defaultPremiumListLimit,
  maxPremiumListLimit,
  premiumBookingChannelSchema,
  premiumClaimParamsSchema,
  premiumClaimResponseSchema,
  cancelPremiumSlotResponseSchema,
  premiumInterviewTypeSchema,
  premiumInterviewerSlotSchema,
  premiumMarketplaceInterviewerSchema,
  premiumMarketplaceListQuerySchema,
  premiumMarketplaceResponseSchema,
  premiumMarketplaceSlotSchema,
  premiumOwnerListQuerySchema,
  premiumOwnerListResponseSchema,
  premiumPaginationQuerySchema,
  premiumPolicyMetadataSchema,
  premiumSlotStatusSchema,
  publishPremiumSlotInputSchema,
} from './premium'
export type {
  PremiumClaimParams,
  PremiumClaimResponse,
  CancelPremiumSlotResponse,
  PremiumInterviewType,
  PremiumInterviewerSlot,
  PremiumMarketplaceInterviewer,
  PremiumMarketplaceListQuery,
  PremiumMarketplaceResponse,
  PremiumMarketplaceSlot,
  PremiumOwnerListQuery,
  PremiumOwnerListResponse,
  PremiumPolicyMetadata,
  PremiumSlotStatus,
  PublishPremiumSlotInput,
} from './premium'
