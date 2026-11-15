import { describe, expect, it } from 'vitest'
import type { Interview, InterviewDetail } from '@mako/shared'
import type { SqlQuery } from '../index'
import { createInMemoryInterviewDataSource, InterviewRepository } from './interview-repository'
import { RecordingStopService } from './recording-stop-service'
import type { RecordingStopRepository, StopRecordingRow } from './recording-stop-repository'
import {
  RealtimeRecordingError,
  type RealtimeRecordingProvider,
} from './realtime-recording-provider'

const interviewId = '33333333-3333-4333-8333-333333333333'
const participantId = '11111111-1111-4111-8111-111111111111'

function ongoingInterview(): Interview & InterviewDetail {
  return {
    id: interviewId,
    scheduler_id: participantId,
    scheduler_alias: 'Scheduler',
    interviewer_id: null,
    interviewer_alias: 'Interviewer',
    type: 'system_design',
    mode: 'ai_led',
    booking_channel: 'ai_direct',
    tier: 'standard',
    status: 'ongoing',
    scheduled_at: '2026-05-22T10:00:00.000Z',
    realtime_session_id: 'meeting-1',
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    recording_status: 'recording',
    transcript: null,
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    screenshots_finalized_at: null,
    started_at: '2026-05-22T10:00:00.000Z',
    expires_at: '2026-05-22T10:45:00.000Z',
    warning_at: '2026-05-22T10:40:00.000Z',
    created_at: '2026-05-22T09:00:00.000Z',
    updated_at: '2026-05-22T09:00:00.000Z',
  } as Interview & InterviewDetail
}

describe('completion transaction recording-stop handoff', function suite() {
  it('SQL path inserts one idempotent handoff inside the completion transaction, with no provider call', async function run() {
    const queries: SqlQuery[] = []
    let completed = false
    const handoffs = new Set<string>()
    const executor = {
      async query<Row>(query: SqlQuery) {
        queries.push(query)
        if (query.text.includes("SET status = 'completed'")) {
          if (completed) return { rows: [] as Row[], rowCount: 0 }
          completed = true
          return {
            rows: [{ ...ongoingInterview(), status: 'completed' }] as Row[],
            rowCount: 1,
          }
        }
        if (query.text.includes('INSERT INTO interview_recording_stop_handoffs')) {
          expect(query.text).toContain('ON CONFLICT (interview_id) DO NOTHING')
          handoffs.add(String(query.values[0]))
          return { rows: [] as Row[], rowCount: 1 }
        }
        if (query.text.trim().startsWith('SELECT')) {
          return { rows: [{ ...ongoingInterview(), status: 'completed' }] as Row[], rowCount: 1 }
        }
        return { rows: [] as Row[], rowCount: 0 }
      },
    }
    const repository = new InterviewRepository({ queryExecutor: executor })
    const input = {
      interview_id: interviewId,
      participant_user_id: participantId,
      action: 'end' as const,
      updated_at: '2026-05-22T10:45:00.000Z',
    }

    expect((await repository.transitionInterviewLifecycle(input)).outcome).toBe('completed')
    expect((await repository.transitionInterviewLifecycle(input)).outcome).toBe('already_completed')

    const texts = queries.map((q) => q.text.trim())
    const begin = texts.indexOf('BEGIN;')
    const handoff = texts.findIndex((t) => t.includes('interview_recording_stop_handoffs'))
    const commit = texts.indexOf('COMMIT;')
    expect(begin).toBeLessThan(handoff)
    expect(handoff).toBeLessThan(commit)
    expect([...handoffs]).toEqual([interviewId])
    expect(queries.filter((q) => q.text.includes('INSERT INTO interview_recording_stop_handoffs'))).toHaveLength(1)
  })

  it('in-memory path records a single handoff even when end is repeated (manual end then timeout)', async function run() {
    const dataSource = createInMemoryInterviewDataSource(
      [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
      [ongoingInterview()],
    )
    const repository = new InterviewRepository(dataSource)
    const input = {
      interview_id: interviewId,
      participant_user_id: participantId,
      action: 'end' as const,
      updated_at: '2026-05-22T10:45:00.000Z',
    }

    expect((await repository.transitionInterviewLifecycle(input)).outcome).toBe('completed')
    expect((await repository.transitionInterviewLifecycle(input)).outcome).toBe('already_completed')
    expect(dataSource.listRecordingStopHandoffInterviewIds?.()).toEqual([interviewId])
  })
})

type FakeStopState = {
  handoff: { realtime_session_id: string | null; processed: boolean; failures: string[] } | null
  rows: StopRecordingRow[]
}

function createStopFixture(
  rows: StopRecordingRow[],
  provider: Partial<RealtimeRecordingProvider> = {},
) {
  const state: FakeStopState = {
    handoff: { realtime_session_id: 'meeting-1', processed: false, failures: [] },
    rows,
  }
  const stopped: string[] = []
  const repository = {
    async getUnprocessedHandoff() {
      return state.handoff && !state.handoff.processed
        ? { interview_id: interviewId, realtime_session_id: state.handoff.realtime_session_id }
        : null
    },
    async listRecordings() {
      return state.rows.map((r) => ({ ...r }))
    },
    async markStopRequested(id: string, now: string) {
      const row = state.rows.find((r) => r.id === id)!
      row.stop_requested_at ??= now
    },
    async markStopConfirmed(id: string, now: string) {
      const row = state.rows.find((r) => r.id === id)!
      row.stop_confirmed_at ??= now
    },
    async recordHandoffFailure(_id: string, code: string) {
      state.handoff!.failures.push(code)
    },
    async markHandoffProcessed() {
      state.handoff!.processed = true
    },
    async listUnprocessedHandoffInterviewIds() {
      return state.handoff && !state.handoff.processed ? [interviewId] : []
    },
  } as unknown as RecordingStopRepository
  const fullProvider: RealtimeRecordingProvider = {
    async startCompositeRecording() {
      throw new Error('not used')
    },
    async startParticipantTrackRecording() {
      throw new Error('not used')
    },
    async stopRecording(input) {
      stopped.push(input.recordingId)
    },
    async listActiveRecordings() {
      return []
    },
    async getRecording() {
      throw new Error('not used')
    },
    ...provider,
  }
  const service = new RecordingStopService(repository, fullProvider, () => '2026-05-22T10:46:00.000Z')
  return { state, stopped, service }
}

function row(id: string, overrides: Partial<StopRecordingRow> = {}): StopRecordingRow {
  return {
    id,
    provider_recording_id: `prov-${id}`,
    stop_requested_at: null,
    stop_confirmed_at: null,
    ...overrides,
  }
}

describe('RecordingStopService.processStopHandoff', function stopSuite() {
  it('stops every recording, checkpoints them and marks the handoff processed', async function run() {
    const t = createStopFixture([row('a'), row('b'), row('c')])
    expect(await t.service.processStopHandoff(interviewId)).toBe('processed')
    expect(t.stopped).toEqual(['prov-a', 'prov-b', 'prov-c'])
    expect(t.state.rows.every((r) => r.stop_requested_at && r.stop_confirmed_at)).toBe(true)
    expect(t.state.handoff?.processed).toBe(true)
  })

  it('is idempotent: a second run is a no-op and does not call the provider again', async function run() {
    const t = createStopFixture([row('a')])
    await t.service.processStopHandoff(interviewId)
    expect(await t.service.processStopHandoff(interviewId)).toBe('no_handoff')
    expect(t.stopped).toEqual(['prov-a'])
  })

  it('treats already-stopped or unknown provider recordings as stopped', async function run() {
    const t = createStopFixture([row('a'), row('b')], {
      async stopRecording(input) {
        throw new RealtimeRecordingError(
          input.recordingId === 'prov-a' ? 'invalid_meeting' : 'duplicate_active_recording',
          false,
          'already stopped',
        )
      },
    })
    expect(await t.service.processStopHandoff(interviewId)).toBe('processed')
  })

  it('keeps the handoff open on transient failure and resumes only unconfirmed recordings', async function run() {
    let failing = true
    const t = createStopFixture([row('a'), row('b')], {
      async stopRecording(input) {
        if (failing && input.recordingId === 'prov-b') {
          throw new RealtimeRecordingError('provider_unavailable', true, 'down')
        }
      },
    })
    expect(await t.service.processStopHandoff(interviewId)).toBe('retry')
    expect(t.state.handoff?.processed).toBe(false)
    expect(t.state.handoff?.failures).toEqual(['provider_unavailable'])
    expect(t.state.rows[0]!.stop_confirmed_at).not.toBeNull()
    expect(t.state.rows[1]!.stop_confirmed_at).toBeNull()

    failing = false
    expect(await t.service.sweepStopHandoffs({ olderThan: 'x', limit: 5 })).toBe(1)
    expect(t.state.handoff?.processed).toBe(true)
  })

  it('stops active provider recordings that were never persisted locally', async function run() {
    const t = createStopFixture([row('a')], {
      async listActiveRecordings() {
        return [
          { id: 'prov-a', kind: 'composite', status: 'RECORDING', outputFileName: null },
          { id: 'orphan', kind: 'composite', status: 'RECORDING', outputFileName: null },
        ]
      },
    })
    expect(await t.service.processStopHandoff(interviewId)).toBe('processed')
    expect(t.stopped).toEqual(['prov-a', 'orphan'])
  })

  it('processes a handoff with no recordings (declined consent) without calling stop', async function run() {
    const t = createStopFixture([])
    expect(await t.service.processStopHandoff(interviewId)).toBe('processed')
    expect(t.stopped).toEqual([])
  })
})
