import {
  recordingConsentResponseSchema,
  type ConsentDecision,
  type RecordingConsentResponse,
} from '@mako/shared'
import type { RecordingStarter } from './recording-control-service'
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
    private readonly recordingStarter?: RecordingStarter,
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
      decision: input.decision,
      consent_copy_version: input.consent_copy_version,
    })

    const response = this.toConsentResponse(result)

    if (response.decision === 'consented') {
      await this.recordingStarter?.ensureRecordingStarted(input.interview_id)
    }

    return response
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
      case 'already_revoked': {
        // The repository always provides consent for these outcomes.
        const consent = result.consent!
        return recordingConsentResponseSchema.parse({
          interview_id: consent.interview_id,
          user_id: consent.user_id,
          decision: consent.decision,
          consent_copy_version: consent.consent_copy_version,
          recording_status: result.recording_status ?? 'not_started',
          revoked_at: consent.revoked_at,
        })
      }
      case 'invalid_status':
        throw new InterviewConflictError(
          'Recording consent can only be changed before recording has started.',
        )
      case 'no_consent':
        throw new InterviewConflictError(
          'No recording consent found to revoke.',
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
