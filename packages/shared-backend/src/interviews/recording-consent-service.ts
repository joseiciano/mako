import {
  consentDecisionSchema,
  recordingConsentResponseSchema,
  type ConsentDecision,
  type RecordingConsentResponse,
} from '@mako/shared'
import { InterviewRepository } from './interview-repository'
import {
  RecordingConsentRepository,
  type RecordingConsentResult,
} from './recording-consent-repository'
import {
  authenticatedInterviewUserIdSchema,
  InterviewConflictError,
  InterviewNotFoundError,
  InterviewUnauthorizedError,
  type InterviewSession,
} from './types'

export class RecordingConsentService {
  constructor(
    private readonly consentRepository: RecordingConsentRepository,
    private readonly interviewRepository: InterviewRepository,
  ) {}

  async setConsent(
    session: InterviewSession | null,
    input: {
      interview_id: string
      decision: ConsentDecision
      consent_copy_version: string
    },
  ): Promise<RecordingConsentResponse> {
    const participantUserId = this.requireParticipantUserId(session)

    await this.requireParticipantInterview(input.interview_id, participantUserId)

    const result = await this.consentRepository.upsertConsent({
      interview_id: input.interview_id,
      user_id: participantUserId,
      decision: consentDecisionSchema.parse(input.decision),
      consent_copy_version: input.consent_copy_version,
    })

    return this.toConsentResponse(result)
  }

  async revokeConsent(
    session: InterviewSession | null,
    input: { interview_id: string },
  ): Promise<RecordingConsentResponse> {
    const participantUserId = this.requireParticipantUserId(session)

    await this.requireParticipantInterview(input.interview_id, participantUserId)

    const result = await this.consentRepository.revokeConsent({
      interview_id: input.interview_id,
      user_id: participantUserId,
    })

    return this.toConsentResponse(result)
  }

  private async requireParticipantInterview(
    interviewId: string,
    participantUserId: string,
  ): Promise<void> {
    const interview = await this.interviewRepository.getParticipantInterviewById({
      interview_id: interviewId,
      participant_user_id: participantUserId,
    })

    if (!interview) {
      throw new InterviewNotFoundError(
        'Interview was not found for the active participant.',
      )
    }
  }

  private toConsentResponse(result: RecordingConsentResult): RecordingConsentResponse {
    switch (result.outcome) {
      case 'recorded':
      case 'already_recorded':
        if (!result.consent) {
          throw new InterviewConflictError(
            'Recording consent cannot be revoked before it has been recorded.',
          )
        }

        return recordingConsentResponseSchema.parse({
          interview_id: result.consent.interview_id,
          user_id: result.consent.user_id,
          decision: result.consent.decision,
          consent_copy_version: result.consent.consent_copy_version,
          recording_status: result.recording_status ?? 'not_started',
        })
      case 'invalid_status':
        throw new InterviewConflictError(
          'Recording consent can only be changed before recording has started.',
        )
      case 'not_found':
        throw new InterviewNotFoundError(
          'Interview was not found for the active participant.',
        )
    }

    throw new Error('Unexpected recording consent outcome.')
  }

  private requireParticipantUserId(session: InterviewSession | null): string {
    if (!session) {
      throw new InterviewUnauthorizedError()
    }

    return authenticatedInterviewUserIdSchema.parse(session.userId)
  }
}
