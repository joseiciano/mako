import type { InterviewDetail } from '@mako/shared'

export function makeInterview(overrides?: Partial<InterviewDetail>): InterviewDetail {
  return {
    id: 'int-1',
    scheduler_id: 'sch-1',
    scheduler_alias: 'Bob',
    interviewer_id: 'intv-1',
    interviewer_alias: 'Alice',
    type: 'behavioral',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-06-20T10:00:00Z',
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: '2026-06-19T10:00:00Z',
    updated_at: '2026-06-19T10:00:00Z',
    ...overrides,
  }
}
