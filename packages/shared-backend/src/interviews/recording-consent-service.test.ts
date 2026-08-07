import type { Interview } from '@mako/shared'
import { describe, expect, it, vi } from 'vitest'
import {
  InterviewRepository,
  createInMemoryInterviewDataSource,
} from './interview-repository'
import {
  RecordingConsentRepository,
  type RecordingConsentRecord,
  type RecordingConsentResult,
  type RevokeConsentInput,
  type UpsertConsentInput,
} from './recording-consent-repository'
import { RecordingConsentService } from './recording-consent-service'
import {
  InterviewConflictError,
  InterviewNotFoundError,
  InterviewUnauthorizedError,
  type InterviewSession,
} from './types'

const schedulerSession: InterviewSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'scheduler@mako.dev',
}

const interviewerSession: InterviewSession = {
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'interviewer@mako.dev',
}

const interviewId = '33333333-3333-4333-8333-333333333333'

describe('RecordingConsentService', function recordingConsentServiceSuite() {
  it('records an AI-led participant consent and returns the current recording state', async function run() {
    const consentRepository = createMockConsentRepository()
    consentRepository.upsertConsent.mockResolvedValue({
      outcome: 'recorded',
      consent: createConsentRecord({
        user_id: schedulerSession.userId,
        decision: 'consented',
      }),
      recording_status: 'not_started',
    })

    const { service } = createRecordingConsentService(consentRepository, [
      createInterviewRecord({ id: interviewId, scheduler_id: schedulerSession.userId }),
    ])

    const response = await service.setConsent(schedulerSession, {
      interview_id: interviewId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })

    expect(response).toEqual({
      interview_id: interviewId,
      user_id: schedulerSession.userId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
      recording_status: 'not_started',
    })
    expect(consentRepository.upsertConsent).toHaveBeenCalledWith({
      interview_id: interviewId,
      user_id: schedulerSession.userId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })
  })

  it('records independent decisions for both peer-to-peer participants', async function run() {
    const consentRepository = createMockConsentRepository()
    consentRepository.upsertConsent
      .mockResolvedValueOnce({
        outcome: 'recorded',
        consent: createConsentRecord({
          user_id: schedulerSession.userId,
          decision: 'consented',
        }),
        recording_status: 'not_started',
      })
      .mockResolvedValueOnce({
        outcome: 'recorded',
        consent: createConsentRecord({
          user_id: interviewerSession.userId,
          decision: 'declined',
        }),
        recording_status: 'not_started',
      })

    const { service } = createRecordingConsentService(consentRepository, [
      createInterviewRecord({
        id: interviewId,
        scheduler_id: schedulerSession.userId,
        interviewer_id: interviewerSession.userId,
        mode: 'peer_to_peer',
      }),
    ])

    const schedulerResponse = await service.setConsent(schedulerSession, {
      interview_id: interviewId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })
    const interviewerResponse = await service.setConsent(interviewerSession, {
      interview_id: interviewId,
      decision: 'declined',
      consent_copy_version: 'consent-copy-v1',
    })

    expect(schedulerResponse.user_id).toBe(schedulerSession.userId)
    expect(schedulerResponse.decision).toBe('consented')
    expect(interviewerResponse.user_id).toBe(interviewerSession.userId)
    expect(interviewerResponse.decision).toBe('declined')
  })

  it('rejects consent from users who are not participants', async function run() {
    const consentRepository = createMockConsentRepository()

    const { service } = createRecordingConsentService(consentRepository, [
      createInterviewRecord({
        id: interviewId,
        scheduler_id: schedulerSession.userId,
        interviewer_id: interviewerSession.userId,
      }),
    ])

    const strangerSession: InterviewSession = {
      userId: '99999999-9999-4999-8999-999999999999',
      email: 'stranger@mako.dev',
    }

    await expect(
      service.setConsent(strangerSession, {
        interview_id: interviewId,
        decision: 'consented',
        consent_copy_version: 'consent-copy-v1',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)
    expect(consentRepository.upsertConsent).not.toHaveBeenCalled()
  })

  it('rejects consent revocation after recording has started', async function run() {
    const consentRepository = createMockConsentRepository()
    consentRepository.revokeConsent.mockResolvedValue({
      outcome: 'invalid_status',
      recording_status: 'recording',
    })

    const { service } = createRecordingConsentService(consentRepository, [
      createInterviewRecord({
        id: interviewId,
        scheduler_id: schedulerSession.userId,
        status: 'ongoing',
      }),
    ])

    await expect(
      service.revokeConsent(schedulerSession, { interview_id: interviewId }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
  })

  it('rejects recording consent changes after recording has started', async function run() {
    const consentRepository = createMockConsentRepository()
    consentRepository.upsertConsent.mockResolvedValue({
      outcome: 'invalid_status',
      recording_status: 'recording',
    })

    const { service } = createRecordingConsentService(consentRepository, [
      createInterviewRecord({
        id: interviewId,
        scheduler_id: schedulerSession.userId,
        status: 'ongoing',
      }),
    ])

    await expect(
      service.setConsent(schedulerSession, {
        interview_id: interviewId,
        decision: 'consented',
        consent_copy_version: 'consent-copy-v1',
      }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
  })

  it('does not reveal the other participant decision', async function run() {
    const consentRepository = createMockConsentRepository()
    consentRepository.upsertConsent
      .mockResolvedValueOnce({
        outcome: 'recorded',
        consent: createConsentRecord({
          user_id: schedulerSession.userId,
          decision: 'consented',
        }),
        recording_status: 'not_started',
      })
      .mockResolvedValueOnce({
        outcome: 'recorded',
        consent: createConsentRecord({
          user_id: interviewerSession.userId,
          decision: 'declined',
        }),
        recording_status: 'not_started',
      })

    const { service } = createRecordingConsentService(consentRepository, [
      createInterviewRecord({
        id: interviewId,
        scheduler_id: schedulerSession.userId,
        interviewer_id: interviewerSession.userId,
        mode: 'peer_to_peer',
      }),
    ])

    await service.setConsent(schedulerSession, {
      interview_id: interviewId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })
    const interviewerResponse = await service.setConsent(interviewerSession, {
      interview_id: interviewId,
      decision: 'declined',
      consent_copy_version: 'consent-copy-v1',
    })

    expect(interviewerResponse).toEqual({
      interview_id: interviewId,
      user_id: interviewerSession.userId,
      decision: 'declined',
      consent_copy_version: 'consent-copy-v1',
      recording_status: 'not_started',
    })
    expect(interviewerResponse).not.toHaveProperty('all_consented')
    expect(interviewerResponse.decision).not.toBe('consented')
  })

  it('returns the same response on idempotent consent retries', async function run() {
    const consentRepository = createMockConsentRepository()
    const recorded = {
      outcome: 'recorded',
      consent: createConsentRecord({
        user_id: schedulerSession.userId,
        decision: 'consented',
      }),
      recording_status: 'not_started',
    } as const
    const alreadyRecorded = {
      outcome: 'already_recorded',
      consent: createConsentRecord({
        user_id: schedulerSession.userId,
        decision: 'consented',
      }),
      recording_status: 'not_started',
    } as const
    consentRepository.upsertConsent
      .mockResolvedValueOnce(recorded)
      .mockResolvedValueOnce(alreadyRecorded)

    const { service } = createRecordingConsentService(consentRepository, [
      createInterviewRecord({ id: interviewId, scheduler_id: schedulerSession.userId }),
    ])

    const input = {
      interview_id: interviewId,
      decision: 'consented' as const,
      consent_copy_version: 'consent-copy-v1',
    }
    const firstResponse = await service.setConsent(schedulerSession, input)
    const retryResponse = await service.setConsent(schedulerSession, input)

    expect(firstResponse).toEqual(retryResponse)
  })

  it('revocation is idempotent across retries', async function run() {
    const consentRepository = createMockConsentRepository()
    const revoked = createConsentRecord({
      user_id: schedulerSession.userId,
      decision: 'consented',
      revoked_at: '2026-04-13T11:00:00.000Z',
    })
    consentRepository.revokeConsent
      .mockResolvedValueOnce({ outcome: 'recorded', consent: revoked, recording_status: 'not_started' })
      .mockResolvedValueOnce({ outcome: 'already_recorded', consent: revoked, recording_status: 'not_started' })

    const { service } = createRecordingConsentService(consentRepository, [
      createInterviewRecord({ id: interviewId, scheduler_id: schedulerSession.userId }),
    ])

    const firstResponse = await service.revokeConsent(schedulerSession, { interview_id: interviewId })
    const retryResponse = await service.revokeConsent(schedulerSession, { interview_id: interviewId })

    expect(firstResponse).toEqual(retryResponse)
    expect(retryResponse.decision).toBe('consented')
    expect(retryResponse.recording_status).toBe('not_started')
  })

  it('requires an authenticated session', async function run() {
    const consentRepository = createMockConsentRepository()

    const { service } = createRecordingConsentService(consentRepository, [
      createInterviewRecord({ id: interviewId, scheduler_id: schedulerSession.userId }),
    ])

    await expect(
      service.setConsent(null, {
        interview_id: interviewId,
        decision: 'consented',
        consent_copy_version: 'consent-copy-v1',
      }),
    ).rejects.toBeInstanceOf(InterviewUnauthorizedError)
  })

  it('rejects consent for an interview that does not exist', async function run() {
    const consentRepository = createMockConsentRepository()

    const { service } = createRecordingConsentService(consentRepository, [])

    await expect(
      service.setConsent(schedulerSession, {
        interview_id: interviewId,
        decision: 'consented',
        consent_copy_version: 'consent-copy-v1',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)
    expect(consentRepository.upsertConsent).not.toHaveBeenCalled()
  })
})

function createMockConsentRepository() {
  const upsertConsent = vi.fn<MockUpsertConsent>()
  const revokeConsent = vi.fn<MockRevokeConsent>()
  const getConsentForUser = vi.fn<MockGetConsentForUser>()
  const getAllConsents = vi.fn<MockGetAllConsents>()
  const getRecordingStatus = vi.fn<MockGetRecordingStatus>()

  return {
    upsertConsent,
    revokeConsent,
    getConsentForUser,
    getAllConsents,
    getRecordingStatus,
  }
}

type MockUpsertConsent = (
  input: UpsertConsentInput,
) => Promise<RecordingConsentResult>

type MockRevokeConsent = (
  input: RevokeConsentInput,
) => Promise<RecordingConsentResult>

type MockGetConsentForUser = (
  interviewId: string,
  userId: string,
) => Promise<RecordingConsentRecord | null>

type MockGetAllConsents = (interviewId: string) => Promise<RecordingConsentRecord[]>

type MockGetRecordingStatus = (interviewId: string) => Promise<string | null>

function createRecordingConsentService(
  consentRepository: ReturnType<typeof createMockConsentRepository>,
  seedInterviews: readonly Interview[],
): { service: RecordingConsentService } {
  const interviewRepository = new InterviewRepository(
    createInMemoryInterviewDataSource(
      [
        {
          userId: schedulerSession.userId,
          credits: 0,
          freeStandardInterviews: 1,
          freeAiInterviews: 0,
        },
        {
          userId: interviewerSession.userId,
          credits: 0,
          freeStandardInterviews: 1,
          freeAiInterviews: 0,
        },
      ],
      seedInterviews,
    ),
  )

  return {
    service: new RecordingConsentService(
      consentRepository as unknown as RecordingConsentRepository,
      interviewRepository,
    ),
  }
}

function createConsentRecord(
  overrides: Partial<RecordingConsentRecord> = {},
): RecordingConsentRecord {
  return {
    interview_id: interviewId,
    user_id: schedulerSession.userId,
    decision: 'consented',
    consent_copy_version: 'consent-copy-v1',
    decided_at: '2026-04-13T10:00:00.000Z',
    revoked_at: null,
    created_at: '2026-04-13T10:00:00.000Z',
    updated_at: '2026-04-13T10:00:00.000Z',
    ...overrides,
  }
}

function createInterviewRecord(overrides: Partial<Interview> = {}): Interview {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-04-13T10:00:00.000Z',
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    recording_status: 'not_started',
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    transcript: null,
    screenshots_finalized_at: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: '2026-04-13T09:55:00.000Z',
    updated_at: '2026-04-13T09:55:00.000Z',
    ...overrides,
  }
}
