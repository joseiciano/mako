import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealtimeKitWebhookSignatureVerifier } from '../../../backend-rest/src/realtimekit-webhook-signature.ts'
import { handleRequest } from '../app.ts'
import { buildRecordingStatusEvent, signRealtimeKitPayload } from './realtime-webhooks.ts'

const KEY_URL = 'http://fakes.test/realtimekit/.well-known/webhooks.json'
const RECORDING_ID = '11111111-1111-4111-8111-111111111111'
const bytes = (text: string) => new TextEncoder().encode(text)

const send = (body: unknown) =>
  handleRequest(
    new Request('http://fakes.test/realtimekit/recording-uploaded', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.stubEnv('FAKES_BACKEND_URL', 'http://backend.test')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('signed UPLOADED webhook', () => {
  const verifierFetchingFakeKey = () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(handleRequest(new Request(input, init))),
    )
    return new RealtimeKitWebhookSignatureVerifier(KEY_URL)
  }

  it('posts an event the backend verifier accepts using the key the fakes serve', async () => {
    const sent: { url: string; headers: Record<string, string>; payload: string }[] = []
    const verifier = verifierFetchingFakeKey()
    const fakeFetch = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if (url.startsWith('http://fakes.test')) return fakeFetch(url, init)
      sent.push({ url, headers: init.headers as Record<string, string>, payload: init.body as string })
      return new Response('{"ok":true}', { status: 200 })
    })

    const response = await send({ recording_id: RECORDING_ID })

    expect(response.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('http://backend.test/api/webhooks/realtimekit')
    expect(sent[0].headers['rtk-uuid']).toBeTruthy()
    expect(JSON.parse(sent[0].payload)).toEqual(buildRecordingStatusEvent(RECORDING_ID, 'UPLOADED'))
    expect(await verifier.verify(bytes(sent[0].payload), sent[0].headers['rtk-signature'])).toBe('valid')
  })

  it('produces a signature the backend verifier rejects for a changed body or a foreign signature', async () => {
    const verifier = verifierFetchingFakeKey()
    const payload = JSON.stringify(buildRecordingStatusEvent(RECORDING_ID, 'UPLOADED'))
    const signature = signRealtimeKitPayload(payload)

    expect(await verifier.verify(bytes(payload), signature)).toBe('valid')
    expect(await verifier.verify(bytes(`${payload} `), signature)).toBe('invalid')
    expect(await verifier.verify(bytes(payload), btoa('not a real signature'))).toBe('invalid')
  })

  it('requires a UUID recording_id', async () => {
    const response = await send({ recording_id: 'not-a-uuid' })

    expect(response.status).toBe(400)
  })

  it('surfaces a backend rejection as 502', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":"unauthorized"}', { status: 401 }))

    const response = await send({ recording_id: RECORDING_ID })

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ backend_status: 401 })
  })

  it('answers 502 when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('connect ECONNREFUSED')
    })

    const response = await send({ recording_id: RECORDING_ID })

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'backend unreachable' })
  })
})

describe('recording download and listing', () => {
  const authed = { headers: { Authorization: 'Bearer x' } }
  const recordings = 'http://fakes.test/client/v4/accounts/a/realtime/kit/b/recordings'

  it('serves the declared download URLs as webm and lists started recordings', async () => {
    const start = await handleRequest(
      new Request(`${recordings}/track`, {
        method: 'POST',
        body: JSON.stringify({ meeting_id: 'm-list', user_ids: ['22222222-2222-4222-8222-222222222222'] }),
        ...authed,
      }),
    )
    const id = ((await start.json()) as { data: { id: string } }).data.id
    const details = (await (await handleRequest(new Request(`${recordings}/${id}`, authed))).json()) as {
      data: { download_urls: Array<{ download_urls: Record<string, string> }> }
    }
    const [[fileName, url]] = Object.entries(details.data.download_urls[0].download_urls)

    expect(fileName).toBe(`22222222-2222-4222-8222-222222222222-${id}.webm`)

    const download = await handleRequest(new Request(`http://fakes.test${new URL(url).pathname}`))
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('video/webm')
    expect((await download.arrayBuffer()).byteLength).toBeGreaterThan(0)

    const listed = (await (await handleRequest(new Request('http://fakes.test/realtimekit/recordings'))).json()) as {
      recordings: Array<{ recording_id: string; kind: string; meeting_id: string }>
    }
    expect(listed.recordings.at(-1)).toEqual({ recording_id: id, kind: 'participant_track', meeting_id: 'm-list' })
  })
})
