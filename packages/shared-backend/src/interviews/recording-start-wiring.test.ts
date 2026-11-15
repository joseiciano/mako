import { describe, expect, it, vi } from 'vitest'
import type { Interview, InterviewDetail } from '@mako/shared'
import { createInMemoryInterviewDataSource, InterviewRepository } from './interview-repository'
import { InterviewService } from './interview-service'
import type { RecordingConsentRepository } from './recording-consent-repository'
import { RecordingConsentService } from './recording-consent-service'

const userId = '11111111-1111-4111-8111-111111111111'
const interviewId = '33333333-3333-4333-8333-333333333333'
const session = { userId, email: 'user@mako.dev' }

function interviewRecord(status: Interview['status']): Interview & InterviewDetail {
  return {
    id: interviewId,
    scheduler_id: userId,
    scheduler_alias: 'Scheduler',
    interviewer_id: null,
    interviewer_alias: 'Interviewer',
    type: 'system_design',
    mode: 'ai_led',
    booking_channel: 'ai_direct',
    tier: 'standard',
    status,
    scheduled_at: '2026-05-22T10:00:00.000Z',
    realtime_session_id: 'meeting-1',
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    recording_status: 'not_started',
    transcript: null,
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    screenshots_finalized_at: null,
    started_at: status === 'ongoing' ? '2026-05-22T10:00:00.000Z' : null,
    expires_at: status === 'ongoing' ? '2026-05-22T10:45:00.000Z' : null,
    warning_at: status === 'ongoing' ? '2026-05-22T10:40:00.000Z' : null,
    created_at: '2026-05-22T09:00:00.000Z',
    updated_at: '2026-05-22T09:00:00.000Z',
  } as Interview & InterviewDetail
}

function repositoryFor(status: Interview['status']) {
  return new InterviewRepository(
    createInMemoryInterviewDataSource(
      [{ userId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
      [interviewRecord(status)],
    ),
  )
}

describe('InterviewService recording start wiring', function suite() {
  it('ensures recording after a successful start and after an already_ongoing start', async function run() {
    const starter = { ensureRecordingStarted: vi.fn().mockResolvedValue('started') }
    const service = new InterviewService(
      repositoryFor('scheduled'),
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      starter,
    )

    await service.startInterview(session, { id: interviewId })
    await service.startInterview(session, { id: interviewId })

    expect(starter.ensureRecordingStarted).toHaveBeenCalledTimes(2)
    expect(starter.ensureRecordingStarted).toHaveBeenCalledWith(interviewId)
  })

  it('does not fail the start request when recording start throws, and logs it', async function run() {
    const starter = { ensureRecordingStarted: vi.fn().mockRejectedValue(new Error('provider down')) }
    const logger = { error: vi.fn(), info: vi.fn() }
    const service = new InterviewService(
      repositoryFor('scheduled'),
      undefined, undefined, undefined, undefined,
      logger,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      starter,
    )

    const response = await service.startInterview(session, { id: interviewId })

    expect(response.interview.status).toBe('ongoing')
    expect(logger.error).toHaveBeenCalledWith(
      'interview.recording_start_failure',
      expect.objectContaining({ interview_id: interviewId }),
    )
  })
})

describe('RecordingConsentService recording start wiring', function consentSuite() {
  function build(decision: 'consented' | 'declined') {
    const consentRepository = {
      upsertConsent: vi.fn().mockResolvedValue({
        outcome: 'recorded',
        consent: {
          interview_id: interviewId,
          user_id: userId,
          decision,
          consent_copy_version: 'v1',
          decided_at: '2026-05-22T10:00:00.000Z',
          revoked_at: null,
          created_at: '2026-05-22T10:00:00.000Z',
          updated_at: '2026-05-22T10:00:00.000Z',
        },
        recording_status: 'not_started',
      }),
    } as unknown as RecordingConsentRepository
    const starter = { ensureRecordingStarted: vi.fn().mockResolvedValue('started') }
    const service = new RecordingConsentService(consentRepository, repositoryFor('ongoing'), starter)
    return { service, starter }
  }

  it('ensures recording after a consent grant', async function run() {
    const { service, starter } = build('consented')
    await service.setConsent(session, {
      interview_id: interviewId,
      decision: 'consented',
      consent_copy_version: 'v1',
    })
    expect(starter.ensureRecordingStarted).toHaveBeenCalledWith(interviewId)
  })

  it('does not attempt a start after a declined decision', async function run() {
    const { service, starter } = build('declined')
    await service.setConsent(session, {
      interview_id: interviewId,
      decision: 'declined',
      consent_copy_version: 'v1',
    })
    expect(starter.ensureRecordingStarted).not.toHaveBeenCalled()
  })
})
