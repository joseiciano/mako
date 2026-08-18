import { describe, expect, it } from 'vitest'
import {
  parseInterview,
  parseInterviewListItem,
  parseInterviewDetail,
} from './types'

describe('interview booking_channel parse after DB contraction', function bookingChannelParseSuite() {
  it('parses a row with an explicit booking_channel', function run() {
    const parsed = parseInterview({
      ...interviewRowFixture,
      booking_channel: 'verified_interviewer',
    })

    expect(parsed.booking_channel).toBe('verified_interviewer')
  })

  it('parses a list item row with an explicit booking_channel', function run() {
    const parsed = parseInterviewListItem({
      id: interviewRowFixture.id,
      scheduler_id: interviewRowFixture.scheduler_id,
      scheduler_alias: interviewRowFixture.scheduler_alias,
      interviewer_id: interviewRowFixture.interviewer_id,
      interviewer_alias: interviewRowFixture.interviewer_alias,
      type: interviewRowFixture.type,
      mode: 'peer_to_peer',
      booking_channel: 'standard_match',
      tier: interviewRowFixture.tier,
      status: interviewRowFixture.status,
      scheduled_at: interviewRowFixture.scheduled_at,
      created_at: interviewRowFixture.created_at,
      updated_at: interviewRowFixture.updated_at,
    })

    expect(parsed.booking_channel).toBe('standard_match')
    expect(parsed.cancellation_reason).toBeNull()
  })

  it('defaults a missing cancellation_reason to null for historical and non-premium rows', function run() {
    const parsed = parseInterviewListItem({
      id: interviewRowFixture.id,
      scheduler_id: interviewRowFixture.scheduler_id,
      scheduler_alias: interviewRowFixture.scheduler_alias,
      interviewer_id: interviewRowFixture.interviewer_id,
      interviewer_alias: interviewRowFixture.interviewer_alias,
      type: interviewRowFixture.type,
      mode: 'ai_led',
      booking_channel: 'ai_direct',
      tier: interviewRowFixture.tier,
      status: interviewRowFixture.status,
      scheduled_at: interviewRowFixture.scheduled_at,
      created_at: interviewRowFixture.created_at,
      updated_at: interviewRowFixture.updated_at,
    })

    expect(parsed.cancellation_reason).toBeNull()
  })

  it('parses a refund ledger reason on a cancelled verified_interviewer list row', function run() {
    const parsed = parseInterviewListItem({
      id: interviewRowFixture.id,
      scheduler_id: interviewRowFixture.scheduler_id,
      scheduler_alias: interviewRowFixture.scheduler_alias,
      interviewer_id: interviewRowFixture.interviewer_id,
      interviewer_alias: interviewRowFixture.interviewer_alias,
      type: interviewRowFixture.type,
      mode: 'peer_to_peer',
      booking_channel: 'verified_interviewer',
      tier: 'premium',
      status: 'cancelled',
      scheduled_at: interviewRowFixture.scheduled_at,
      created_at: interviewRowFixture.created_at,
      updated_at: interviewRowFixture.updated_at,
      cancellation_reason: 'interviewer_account_deleted',
    })

    expect(parsed.cancellation_reason).toBe('interviewer_account_deleted')
  })

  it('parses a detail row with an explicit booking_channel', function run() {
    const parsed = parseInterviewDetail({
      ...interviewDetailRowFixture,
      booking_channel: 'ai_direct',
    })

    expect(parsed.booking_channel).toBe('ai_direct')
  })

  it('rejects a row with a null booking_channel after contraction', function run() {
    expect(() =>
      parseInterview({
        ...interviewRowFixture,
        booking_channel: null,
      }),
    ).toThrow()
  })

  it('rejects a row that omits booking_channel after contraction', function run() {
    const row = { ...interviewRowFixture }
    delete (row as Record<string, unknown>).booking_channel

    expect(() => parseInterview(row)).toThrow()
  })

  it('has no mode-derived fallback after DB contraction', function run() {
    // Story 7.11: the persisted-row parser removed its equivalent fallback
    // after the NOT NULL contraction. Persisted rows must always carry an
    // explicit booking_channel and never rely on derivation from mode.
    const row = { ...interviewRowFixture }
    delete (row as Record<string, unknown>).booking_channel

    expect(() => parseInterview(row)).toThrow()
    expect(() =>
      parseInterview({
        ...interviewRowFixture,
        booking_channel: null,
      }),
    ).toThrow()
  })
})

const interviewRowFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  scheduler_id: '22222222-2222-4222-8222-222222222222',
  scheduler_alias: 'Scheduler',
  interviewer_id: null,
  interviewer_alias: 'Interviewer',
  type: 'system_design',
  mode: 'ai_led',
  booking_channel: 'ai_direct',
  tier: 'standard',
  status: 'scheduled',
  scheduled_at: '2026-05-22T10:00:00.000Z',
  realtime_session_id: null,
  excalidraw_room_id: null,
  excalidraw_key: null,
  recording_url: null,
  screenshot_urls: null,
  feedback: null,
  started_at: null,
  expires_at: null,
  warning_at: null,
  created_at: '2026-05-22T09:00:00.000Z',
  updated_at: '2026-05-22T09:00:00.000Z',
}

const interviewDetailRowFixture = {
  ...interviewRowFixture,
  recording_status: 'not_started',
  transcript: null,
  feedback_status: 'not_started',
  feedback_unavailable_reason: null,
  feedback_error_code: null,
  feedback_prompt_version: null,
  feedback_generated_at: null,
  screenshots_finalized_at: null,
}
