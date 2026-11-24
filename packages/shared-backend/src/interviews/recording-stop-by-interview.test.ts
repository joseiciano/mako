import { describe, expect, it } from 'vitest'
import { RecordingStopService } from './recording-stop-service'
import type { RecordingStopRepository } from './recording-stop-repository'
import {
  RealtimeRecordingError,
  type RealtimeRecordingProvider,
} from './realtime-recording-provider'

const interviewId = '33333333-3333-4333-8333-333333333333'
const now = '2026-05-22T11:00:00.000Z'

type Open = { id: string; interview_id: string; provider_recording_id: string; created_at: string }

function open(id: string, createdAt: string): Open {
  return { id, interview_id: interviewId, provider_recording_id: `prov-${id}`, created_at: createdAt }
}

function fixture(rows: Open[], stopError?: Error) {
  const stopped: string[] = []
  const confirmed: string[] = []
  const failures: string[] = []
  const repository = {
    async listOpenRecordingsForInterview() {
      return rows
    },
    async markStopRequested() {},
    async markStopConfirmed(id: string) {
      confirmed.push(id)
    },
    async recordStopFailure(_id: string, code: string) {
      failures.push(code)
      return 1
    },
  } as unknown as RecordingStopRepository
  const provider = {
    async stopRecording(input: { recordingId: string }) {
      if (stopError) throw stopError
      stopped.push(input.recordingId)
    },
  } as unknown as RealtimeRecordingProvider
  return { service: new RecordingStopService(repository, provider, () => now), stopped, confirmed, failures }
}

describe('RecordingStopService.closeOverdueRecordingsForInterview', () => {
  it('is resolved when no recording is open', async () => {
    const t = fixture([])
    expect(await t.service.closeOverdueRecordingsForInterview({ interviewId, maxAgeSeconds: 3600 })).toEqual({
      outcome: 'resolved',
    })
    expect(t.stopped).toEqual([])
  })

  it('stops and confirms open recordings at or past the max age', async () => {
    const t = fixture([open('a', '2026-05-22T10:00:00.000Z')])
    expect(await t.service.closeOverdueRecordingsForInterview({ interviewId, maxAgeSeconds: 3600 })).toEqual({
      outcome: 'closed',
    })
    expect(t.stopped).toEqual(['prov-a'])
    expect(t.confirmed).toEqual(['a'])
  })

  it('reports early and stops nothing when the open recording is younger than the max age', async () => {
    const t = fixture([open('a', '2026-05-22T10:30:00.000Z')])
    expect(await t.service.closeOverdueRecordingsForInterview({ interviewId, maxAgeSeconds: 3600 })).toEqual({
      outcome: 'early',
      dueAtMs: Date.parse('2026-05-22T11:30:00.000Z'),
    })
    expect(t.stopped).toEqual([])
  })

  it('reports failed and records the failure when the provider stop fails', async () => {
    const t = fixture(
      [open('a', '2026-05-22T10:00:00.000Z')],
      new RealtimeRecordingError('provider_unavailable', true, 'down'),
    )
    expect(await t.service.closeOverdueRecordingsForInterview({ interviewId, maxAgeSeconds: 3600 })).toEqual({
      outcome: 'failed',
    })
    expect(t.failures).toEqual(['provider_unavailable'])
    expect(t.confirmed).toEqual([])
  })
})

describe('RecordingStopService.isFeedbackTriggered', () => {
  function serviceWith(value: boolean) {
    const repository = {
      async isFeedbackTriggered() {
        return value
      },
    } as unknown as RecordingStopRepository
    return new RecordingStopService(repository, {} as RealtimeRecordingProvider, () => now)
  }

  it('reports the repository marker state', async () => {
    expect(await serviceWith(true).isFeedbackTriggered(interviewId)).toBe(true)
    expect(await serviceWith(false).isFeedbackTriggered(interviewId)).toBe(false)
  })
})
