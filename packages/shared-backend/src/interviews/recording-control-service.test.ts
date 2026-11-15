import { describe, expect, it, vi } from 'vitest'
import type {
  RecordingClaimResult,
  RecordingControlRepository,
  RecordingRow,
} from './recording-control-repository'
import { RecordingControlService } from './recording-control-service'
import {
  RealtimeRecordingError,
  type ProviderRecording,
  type RealtimeRecordingProvider,
} from './realtime-recording-provider'

const interviewId = 'int-1'
const scheduler = '11111111-1111-4111-8111-111111111111'
const interviewer = '22222222-2222-4222-8222-222222222222'

type FakeState = {
  status: string
  recording_status: string
  interviewer_id: string | null
  consents: string[]
  claimed_at: string | null
  rows: RecordingRow[]
  stopped: string[]
}

function createFakeRepository(initial: Partial<FakeState> = {}) {
  const state: FakeState = {
    status: 'ongoing',
    recording_status: 'not_started',
    interviewer_id: null,
    consents: [scheduler],
    claimed_at: null,
    rows: [],
    stopped: [],
    ...initial,
  }
  const repository = {
    async claimStart(input: {
      claim_id: string
      now: string
      stale_before: string
    }): Promise<RecordingClaimResult> {
      const required = state.interviewer_id ? 2 : 1
      const ctx = {
        interview_id: interviewId,
        scheduler_id: scheduler,
        interviewer_id: state.interviewer_id,
        realtime_session_id: 'meeting-1',
        claim_id: input.claim_id,
      }
      if (
        state.status === 'ongoing' &&
        state.recording_status === 'not_started' &&
        state.consents.length === required
      ) {
        state.recording_status = 'pending'
        state.claimed_at = input.now
        return { outcome: 'claimed', context: { ...ctx, takeover: false } }
      }
      if (
        state.status === 'ongoing' &&
        state.recording_status === 'pending' &&
        state.claimed_at! < input.stale_before
      ) {
        state.claimed_at = input.now
        return { outcome: 'claimed', context: { ...ctx, takeover: true } }
      }
      if (state.status === 'ongoing' && state.recording_status === 'pending') {
        return { outcome: 'in_progress' }
      }
      if (state.status === 'ongoing' && state.recording_status !== 'not_started') {
        return { outcome: 'already_started' }
      }
      return { outcome: 'not_eligible' }
    },
    async listRecordings() {
      return [...state.rows]
    },
    async insertRecording(input: RecordingRow) {
      if (!state.rows.some((r) => r.provider_recording_id === input.provider_recording_id)) {
        state.rows.push({
          provider_recording_id: input.provider_recording_id,
          recording_type: input.recording_type,
          participant_id: input.participant_id,
          participant_role: input.participant_role,
        })
      }
    },
    async isInterviewOngoing() {
      return state.status === 'ongoing'
    },
    async markRecordingStopped(providerId: string) {
      state.stopped.push(providerId)
    },
    async listStalePendingInterviewIds(input: { stale_before: string }) {
      return state.status === 'ongoing' &&
        state.recording_status === 'pending' &&
        state.claimed_at! < input.stale_before
        ? [interviewId]
        : []
    },
    async finishClaim(input: { status: string }) {
      state.recording_status = input.status
      return true
    },
  }
  return { state, repository: repository as unknown as RecordingControlRepository }
}

function createFakeProvider(overrides: Partial<RealtimeRecordingProvider> = {}) {
  let counter = 0
  const started: string[] = []
  const provider: RealtimeRecordingProvider = {
    async startCompositeRecording() {
      started.push('composite')
      return { id: `rec-c-${++counter}`, kind: 'composite', status: 'INVOKED', outputFileName: null }
    },
    async startParticipantTrackRecording(input) {
      started.push(`track:${input.participantUserIds.join(',')}`)
      return {
        id: `rec-t-${++counter}`,
        kind: 'participant_track',
        status: 'INVOKED',
        outputFileName: 'default_x.mp3',
      }
    },
    async stopRecording() {},
    async listActiveRecordings() {
      return []
    },
    async getRecording() {
      throw new Error('not used')
    },
    ...overrides,
  }
  return { provider, started }
}

function build(initial: Partial<FakeState> = {}, overrides: Partial<RealtimeRecordingProvider> = {}) {
  const fakeRepo = createFakeRepository(initial)
  const fakeProvider = createFakeProvider(overrides)
  const errors: Array<{ event: string; context: Record<string, unknown> }> = []
  let tick = 0
  let ids = 0
  const service = new RecordingControlService(
    fakeRepo.repository,
    fakeProvider.provider,
    { error: (event, context) => void errors.push({ event, context }) },
    () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick)).toISOString(),
    () => `id-${++ids}`,
  )
  return { ...fakeRepo, ...fakeProvider, service, errors, advance: (s: number) => (tick += s) }
}

describe('RecordingControlService.ensureRecordingStarted', function suite() {
  it('does not start before the interview is ongoing', async function run() {
    const t = build({ status: 'scheduled' })
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('not_eligible')
    expect(t.started).toEqual([])
  })

  it('does not start without every required consent (peer needs both)', async function run() {
    const t = build({ interviewer_id: interviewer, consents: [scheduler] })
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('not_eligible')
    expect(t.started).toEqual([])
  })

  it('AI-led: starts composite plus candidate-role track for the scheduler', async function run() {
    const t = build()
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('started')
    expect(t.started).toEqual(['composite', `track:${scheduler}`])
    expect(t.state.recording_status).toBe('recording')
    expect(t.state.rows.map((r) => [r.recording_type, r.participant_id, r.participant_role])).toEqual([
      ['composite', null, null],
      ['participant_track', scheduler, 'candidate'],
    ])
  })

  it('peer: one composite plus one track recording scoped to both scheduler and interviewer', async function run() {
    const t = build({ interviewer_id: interviewer, consents: [scheduler, interviewer] })
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('started')
    expect(t.started).toEqual(['composite', `track:${scheduler},${interviewer}`])
    expect(t.state.rows).toHaveLength(2)
    expect(new Set(t.state.rows.map((r) => r.provider_recording_id)).size).toBe(2)
    expect(t.state.rows.map((r) => r.recording_type)).toEqual(['composite', 'participant_track'])
  })

  it('never starts more than once across retries and concurrent callers', async function run() {
    const t = build()
    const results = await Promise.all([
      t.service.ensureRecordingStarted(interviewId),
      t.service.ensureRecordingStarted(interviewId),
    ])
    expect(results.sort()).toEqual(['in_progress', 'started'])
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('already_started')
    expect(t.started).toEqual(['composite', `track:${scheduler}`])
  })

  it('start-before-final-consent and final-consent-before-start both yield exactly one start', async function run() {
    const t = build({ interviewer_id: interviewer, consents: [scheduler] })
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('not_eligible')
    t.state.consents.push(interviewer)
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('started')
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('already_started')
    expect(t.started).toHaveLength(2)

    const reverse = build({ interviewer_id: interviewer, consents: [scheduler, interviewer], status: 'scheduled' })
    expect(await reverse.service.ensureRecordingStarted(interviewId)).toBe('not_eligible')
    reverse.state.status = 'ongoing'
    expect(await reverse.service.ensureRecordingStarted(interviewId)).toBe('started')
    expect(await reverse.service.ensureRecordingStarted(interviewId)).toBe('already_started')
    expect(reverse.started).toHaveLength(2)
  })

  it('reconciles an ambiguous start from active provider recordings before retrying', async function run() {
    const lost: ProviderRecording = {
      id: 'rec-lost',
      kind: 'composite',
      status: 'RECORDING',
      outputFileName: null,
    }
    let compositeCalls = 0
    const t = build(
      {},
      {
        async startCompositeRecording() {
          compositeCalls += 1
          throw new RealtimeRecordingError('provider_unavailable', true, 'timeout')
        },
        async listActiveRecordings() {
          return [lost]
        },
      },
    )

    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('started')
    expect(compositeCalls).toBe(1)
    expect(t.state.rows[0]).toMatchObject({ provider_recording_id: 'rec-lost', recording_type: 'composite' })
    expect(t.started).toEqual([`track:${scheduler}`])
  })

  it('does not adopt an active provider recording of unknown kind during reconcile', async function run() {
    const t = build(
      {},
      {
        async startCompositeRecording() {
          throw new RealtimeRecordingError('provider_unavailable', true, 'timeout')
        },
        async listActiveRecordings() {
          return [{ id: 'rec-mystery', kind: 'unknown', status: 'RECORDING', outputFileName: null }]
        },
      },
    )
    await t.service.ensureRecordingStarted(interviewId)
    expect(t.state.rows.map((r) => r.provider_recording_id)).not.toContain('rec-mystery')
  })

  it('keeps the claim pending when ambiguity cannot be reconciled and retries only after the claim is stale', async function run() {
    let fail = true
    const t = build(
      {},
      {
        async startCompositeRecording() {
          if (fail) throw new RealtimeRecordingError('provider_unavailable', true, 'timeout')
          return { id: 'rec-ok', kind: 'composite', status: 'INVOKED', outputFileName: null }
        },
      },
    )

    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('pending_retry')
    expect(t.state.recording_status).toBe('pending')
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('in_progress')

    fail = false
    t.advance(120)
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('started')
    expect(t.state.rows.map((r) => r.provider_recording_id)).toContain('rec-ok')
  })

  it('marks recording failed on a terminal provider error and logs only safe fields', async function run() {
    const t = build(
      {},
      {
        async startCompositeRecording() {
          throw new RealtimeRecordingError('invalid_meeting', false, 'nope')
        },
      },
    )
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('failed')
    expect(t.state.recording_status).toBe('failed')
    expect(t.errors[0]).toEqual({
      event: 'recording.provider_start_failed',
      context: { interview_id: interviewId, error_code: 'invalid_meeting', error_name: 'RealtimeRecordingError' },
    })
  })

  it('never throws on unexpected errors', async function run() {
    const t = build()
    const spy = vi.spyOn(t.repository, 'claimStart').mockRejectedValue(new Error('db down'))
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('error')
    spy.mockRestore()
  })

  it('partial start: stops the already-started composite before marking failed', async function run() {
    const stopCalls: string[] = []
    const t = build(
      {},
      {
        async startParticipantTrackRecording() {
          throw new RealtimeRecordingError('recording_failed', false, 'nope')
        },
        async stopRecording(input) {
          stopCalls.push(input.recordingId)
        },
      },
    )
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('failed')
    expect(stopCalls).toEqual(['rec-c-1'])
    expect(t.state.stopped).toEqual(['rec-c-1'])
    expect(t.state.recording_status).toBe('failed')
  })

  it('partial start: keeps the claim pending when the cleanup stop fails', async function run() {
    const t = build(
      {},
      {
        async startParticipantTrackRecording() {
          throw new RealtimeRecordingError('recording_failed', false, 'nope')
        },
        async stopRecording() {
          throw new RealtimeRecordingError('provider_unavailable', true, 'down')
        },
      },
    )
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('pending_retry')
    expect(t.state.recording_status).toBe('pending')
  })

  it('stops recordings that were started while the interview completed mid-start', async function run() {
    const stopCalls: string[] = []
    let state: FakeState | undefined
    const t = build(
      {},
      {
        async startParticipantTrackRecording() {
          state!.status = 'completed'
          return { id: 'rec-t-late', kind: 'participant_track', status: 'INVOKED', outputFileName: null }
        },
        async stopRecording(input) {
          stopCalls.push(input.recordingId)
        },
      },
    )
    state = t.state
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('started')
    expect(stopCalls).toEqual(['rec-c-1', 'rec-t-late'])
    expect(t.state.stopped).toEqual(['rec-c-1', 'rec-t-late'])
  })
})

describe('RecordingControlService.sweepStalePendingClaims', function sweepSuite() {
  it('retries a stale pending claim left behind by pending_retry', async function run() {
    let fail = true
    const t = build(
      {},
      {
        async startCompositeRecording() {
          if (fail) throw new RealtimeRecordingError('provider_unavailable', true, 'timeout')
          return { id: 'rec-ok', kind: 'composite', status: 'INVOKED', outputFileName: null }
        },
      },
    )
    expect(await t.service.ensureRecordingStarted(interviewId)).toBe('pending_retry')
    expect(await t.service.sweepStalePendingClaims({ limit: 10 })).toBe(0)

    fail = false
    t.advance(120)
    expect(await t.service.sweepStalePendingClaims({ limit: 10 })).toBe(1)
    expect(t.state.recording_status).toBe('recording')
  })
})
