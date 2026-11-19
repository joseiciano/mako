import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAiGatewayFeedbackAnalysisAdapter,
  createAiGatewayResponder,
  createRealtimeKitProvider,
  createRealtimeKitRecordingProvider,
  createWorkersAiTranscriptionAdapter,
  DEFAULT_FEEDBACK_ANALYSIS_CONFIG,
  DEFAULT_TRANSCRIPTION_CONFIG,
} from '@mako/shared-backend'
import { interviewFeedbackV1Schema } from '@mako/shared'
import { FAKE_TRANSCRIPT_TEXT, fakeAiRun } from './ai-run.ts'
import { FAKE_CHAT_REPLY } from './routes/ai-chat.ts'
import { handleRequest } from './app.ts'

const BASE = 'http://fakes.test/client/v4'
const bindings = {
  CLOUDFLARE_ACCOUNT_ID: 'acct',
  CLOUDFLARE_API_TOKEN: 'any-token',
  CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
  CLOUDFLARE_API_BASE_URL: BASE,
}

function routeFetchToFakes() {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handleRequest(new Request(input, init))),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('health', () => {
  it('answers without authorization', async () => {
    const response = await handleRequest(new Request('http://fakes.test/health'))
    expect(response.status).toBe(200)
  })
})

describe('authorization', () => {
  it('rejects a RealtimeKit call without an authorization header', async () => {
    const response = await handleRequest(
      new Request(`${BASE}/accounts/a/realtime/kit/b/meetings`, { method: 'POST' }),
    )
    expect(response.status).toBe(401)
  })

  it('returns 404 for an unknown route', async () => {
    const response = await handleRequest(
      new Request(`${BASE}/accounts/a/realtime/kit/b/unknown`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer x' },
      }),
    )
    expect(response.status).toBe(404)
  })
})

describe('room routes parsed by the real RealtimeKit provider', () => {
  it('creates a session and a participant token', async () => {
    routeFetchToFakes()
    const provider = createRealtimeKitProvider(bindings)

    const session = await provider.createSession({ interviewId: 'iv-1' })
    expect(session.realtimeSessionId).toMatch(/^fake-meeting-/)

    const { token } = await provider.createParticipantToken({
      realtimeSessionId: session.realtimeSessionId,
      participantUserId: 'u1',
      participantName: 'Learner',
      participantEmail: 'learner@example.com',
      interviewId: 'iv-1',
    })
    expect(token).toMatch(/^fake-participant-token-/)
  })
})

describe('recording routes parsed by the real recording provider', () => {
  it('starts, lists, stops and reads a composite recording', async () => {
    routeFetchToFakes()
    const provider = createRealtimeKitRecordingProvider(bindings)

    const started = await provider.startCompositeRecording({ meetingId: 'm1' })
    expect(started).toMatchObject({ kind: 'composite', status: 'INVOKED' })
    expect(started.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await provider.listActiveRecordings({ meetingId: 'm1' })).toEqual([])
    await expect(provider.stopRecording({ recordingId: started.id })).resolves.toBeUndefined()

    const fetched = await provider.getRecording({ recordingId: started.id })
    expect(fetched).toMatchObject({ id: started.id, status: 'UPLOADED' })
  })

  it('starts a participant track recording', async () => {
    routeFetchToFakes()
    const provider = createRealtimeKitRecordingProvider(bindings)

    const started = await provider.startParticipantTrackRecording({
      meetingId: 'm1',
      participantUserIds: ['u1'],
    })
    expect(started.kind).toBe('participant_track')
  })

  it('declares https download URLs in the shapes the finalization workflow reads', async () => {
    const authed = { headers: { Authorization: 'Bearer x' } }
    const recordings = `${BASE}/accounts/a/realtime/kit/b/recordings`
    const startBody = async (path: string) => {
      const response = await handleRequest(
        new Request(`${recordings}${path}`, {
          method: 'POST',
          body: JSON.stringify({ meeting_id: 'm' }),
          ...authed,
        }),
      )
      return (await response.json()) as { data: { id: string } }
    }
    const read = async (id: string) => {
      const response = await handleRequest(new Request(`${recordings}/${id}`, authed))
      return (await response.json()) as { data: Record<string, unknown> }
    }

    const composite = await read((await startBody('')).data.id)
    expect(new URL(composite.data.download_url as string).protocol).toBe('https:')

    const track = await read((await startBody('/track')).data.id)
    const layers = track.data.download_urls as Array<{ download_urls: Record<string, string> }>
    const urls = Object.values(layers[0]!.download_urls)
    expect(urls).toHaveLength(1)
    expect(new URL(urls[0]!).protocol).toBe('https:')
  })
})

describe('AI chat routes parsed by the real responder', () => {
  const input: Parameters<ReturnType<typeof createAiGatewayResponder>['generateReply']>[0] = {
    interview_id: '33333333-3333-4333-8333-333333333333',
    session: { userId: '22222222-2222-4222-8222-222222222222', email: 'a@example.com' },
    message: 'What next?',
    interview_type: 'system_design',
    canvas_snapshot: { type: 'excalidraw_scene', scene: { elements: [] } },
    guidance_mode: 'review',
  }

  it('answers the direct Workers AI run URL', async () => {
    routeFetchToFakes()
    const responder = createAiGatewayResponder({ accountId: 'acct', apiToken: 't', apiBaseUrl: BASE })
    const result = await responder.generateReply(input)
    expect(result.reply).toBe(FAKE_CHAT_REPLY)
  })

  it('answers the AI Gateway chat-completions URL', async () => {
    routeFetchToFakes()
    const responder = createAiGatewayResponder({
      accountId: 'acct',
      apiToken: 't',
      gatewayId: 'gw',
      apiBaseUrl: BASE,
    })
    const result = await responder.generateReply(input)
    expect(result.reply).toBe(FAKE_CHAT_REPLY)
  })

  it('requires an authorization header', async () => {
    const response = await handleRequest(
      new Request(`${BASE}/accounts/a/ai/run/@cf/x/y`, { method: 'POST' }),
    )
    expect(response.status).toBe(401)
  })
})

describe('feedback analysis route parsed by the real adapter', () => {
  it('returns a report that passes the feedback schema', async () => {
    routeFetchToFakes()
    const adapter = createAiGatewayFeedbackAnalysisAdapter(DEFAULT_FEEDBACK_ANALYSIS_CONFIG, {
      accountId: 'acct',
      apiToken: 't',
      gatewayId: 'gw',
      apiBaseUrl: BASE,
    })
    const { content } = await adapter.analyze([{ role: 'system', content: 'x' }])
    expect(interviewFeedbackV1Schema.safeParse(JSON.parse(content)).success).toBe(true)
  })
})

describe('fake AI binding run', () => {
  it('returns text the real transcription adapter accepts', async () => {
    const ai = { run: async (model: string) => fakeAiRun(model) } as unknown as Parameters<
      typeof createWorkersAiTranscriptionAdapter
    >[0]
    const adapter = createWorkersAiTranscriptionAdapter(ai, DEFAULT_TRANSCRIPTION_CONFIG)
    const result = await adapter.transcribeChunk({ audioBase64: 'AAAA', language: 'en' } as never)
    expect(result.text).toBe(FAKE_TRANSCRIPT_TEXT)
  })
})
