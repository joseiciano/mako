import { generateKeyPairSync, sign } from 'node:crypto'
import { jsonResponse } from '../http.ts'
import { listStartedRecordings } from './realtime-recordings.ts'

const KEY_PATH = '/realtimekit/.well-known/webhooks.json'
const RECORDINGS_PATH = '/realtimekit/recordings'
const SEND_PATH = '/realtimekit/recording-uploaded'
const BACKEND_WEBHOOK_PATH = '/api/webhooks/realtimekit'
const DEFAULT_BACKEND_URL = 'http://workers:8787'

/**
 * Local webhook signing key, generated when the fakes process starts. The
 * backend fetches the public half from `KEY_PATH` (its
 * REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL var points there while fakes are on), so
 * no key is committed and a restart simply serves the new key.
 */
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

/** RealtimeKit signing scheme as the backend verifies it: base64 RSASSA-PKCS1-v1_5 / SHA-256 over the raw body. */
export const signRealtimeKitPayload = (payload: string): string =>
  sign('sha256', Buffer.from(payload), privateKey).toString('base64')

export const buildRecordingStatusEvent = (recordingId: string, status: string) => ({
  event: 'recording.statusUpdate',
  recording: { id: recordingId, recordingId, status },
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET  /realtimekit/.well-known/webhooks.json  the public key the backend verifies against.
 * GET  /realtimekit/recordings                 recordings started through the fake, oldest first.
 * POST /realtimekit/recording-uploaded         signs a `recording.statusUpdate` UPLOADED event for
 *                                              `{ recording_id }` and posts it to the backend.
 */
export const handleRealtimeWebhooks = async (request: Request, path: string): Promise<Response | null> => {
  if (request.method === 'GET' && path === KEY_PATH) {
    return jsonResponse({ success: true, data: { publicKey: publicKeyPem } })
  }

  if (request.method === 'GET' && path === RECORDINGS_PATH) {
    return jsonResponse({
      recordings: listStartedRecordings().map(({ id, kind, meetingId }) => ({
        recording_id: id,
        kind,
        meeting_id: meetingId,
      })),
    })
  }

  if (request.method !== 'POST' || path !== SEND_PATH) return null

  const body = (await request.json().catch(() => ({}))) as { recording_id?: unknown }
  if (typeof body.recording_id !== 'string' || !UUID.test(body.recording_id)) {
    return jsonResponse({ error: 'recording_id (a UUID) is required.' }, 400)
  }

  const payload = JSON.stringify(buildRecordingStatusEvent(body.recording_id, 'UPLOADED'))
  const backendUrl = (process.env.FAKES_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, '')
  let backendResponse: Response
  try {
    backendResponse = await fetch(`${backendUrl}${BACKEND_WEBHOOK_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'rtk-signature': signRealtimeKitPayload(payload),
        'rtk-uuid': crypto.randomUUID(),
      },
      body: payload,
    })
  } catch (error) {
    return jsonResponse(
      { error: 'backend unreachable', detail: error instanceof Error ? error.message : String(error) },
      502,
    )
  }

  return jsonResponse(
    { backend_status: backendResponse.status, backend_body: await backendResponse.text() },
    backendResponse.ok ? 200 : 502,
  )
}
