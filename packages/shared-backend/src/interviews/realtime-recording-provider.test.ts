import { describe, expect, it, vi } from 'vitest'
import {
  createRealtimeKitRecordingProvider,
  RealtimeRecordingError,
} from './realtime-recording-provider'

const bindings = {
  CLOUDFLARE_ACCOUNT_ID: 'acct',
  CLOUDFLARE_API_TOKEN: 'secret-token',
  CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function providerWith(fetchImpl: typeof fetch) {
  return createRealtimeKitRecordingProvider(bindings, fetchImpl)
}

describe('RealtimeKit recording provider', function suite() {
  it('requires all bindings', function run() {
    expect(() => createRealtimeKitRecordingProvider({})).toThrow('requires')
  })

  it('starts a composite recording bounded to 3600 seconds', async function run() {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: true, data: { id: 'rec-1', status: 'INVOKED' } }),
    )
    const result = await providerWith(fetchImpl as unknown as typeof fetch).startCompositeRecording({
      meetingId: 'meeting-1',
    })

    expect(result).toMatchObject({ id: 'rec-1', kind: 'composite' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct/realtime/kit/app/recordings',
    )
    expect(JSON.parse(init.body as string)).toMatchObject({
      meeting_id: 'meeting-1',
      max_seconds: 3600,
    })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token')
  })

  it('starts one participant-separated track recording scoped to the given participants', async function run() {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: { recording: { id: 'rec-t', status: 'INVOKED', type: 'TRACK' } } }),
    )
    const result = await providerWith(fetchImpl as unknown as typeof fetch).startParticipantTrackRecording({
      meetingId: 'meeting-1',
      participantUserIds: ['user-1', 'user-2'],
    })

    expect(result).toMatchObject({ id: 'rec-t', kind: 'participant_track' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url.endsWith('/recordings/track')).toBe(true)
    expect(JSON.parse(init.body as string)).toMatchObject({
      user_ids: ['user-1', 'user-2'],
      max_seconds: 3600,
    })
  })

  it('stops a recording with a PUT stop action', async function run() {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true }))
    await providerWith(fetchImpl as unknown as typeof fetch).stopRecording({ recordingId: 'rec-1' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url.endsWith('/recordings/rec-1')).toBe(true)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ action: 'stop' })
  })

  it('lists only active recordings for the meeting', async function run() {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: 'a', status: 'RECORDING', type: 'TRACK', output_file_name: 'u-1_x.mp3' },
          { id: 'b', status: 'UPLOADED' },
          { id: 'c', status: 'INVOKED' },
        ],
      }),
    )
    const result = await providerWith(fetchImpl as unknown as typeof fetch).listActiveRecordings({
      meetingId: 'meeting-1',
    })
    expect(result.map((r) => [r.id, r.kind])).toEqual([
      ['a', 'participant_track'],
      ['c', 'composite'],
    ])
  })

  it('returns recording status', async function run() {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { id: 'rec-1', status: 'UPLOADING' } }))
    const result = await providerWith(fetchImpl as unknown as typeof fetch).getRecording({
      recordingId: 'rec-1',
    })
    expect(result.status).toBe('UPLOADING')
  })

  it.each([
    [500, 'provider_unavailable', true],
    [429, 'provider_unavailable', true],
    [404, 'invalid_meeting', false],
    [400, 'invalid_meeting', false],
    [409, 'duplicate_active_recording', false],
    [403, 'recording_failed', false],
  ] as const)('maps HTTP %i to %s', async function run(status, code, ambiguous) {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'x' }, status))
    const error = await providerWith(fetchImpl as unknown as typeof fetch)
      .startCompositeRecording({ meetingId: 'm' })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RealtimeRecordingError)
    expect(error).toMatchObject({ code, ambiguous })
    expect((error as Error).message).not.toContain('secret-token')
  })

  it('maps network failure and timeout to ambiguous provider_unavailable', async function run() {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError')
    })
    const error = await providerWith(fetchImpl as unknown as typeof fetch)
      .startCompositeRecording({ meetingId: 'm' })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'provider_unavailable', ambiguous: true })
  })

  it('maps a terminal ERRORED start response to recording_failed', async function run() {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { id: 'rec-1', status: 'ERRORED' } }))
    const error = await providerWith(fetchImpl as unknown as typeof fetch)
      .startCompositeRecording({ meetingId: 'm' })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'recording_failed', ambiguous: false })
  })
})
