import { jsonResponse } from '../http.ts'

type RecordingKind = 'composite' | 'participant_track'

const MAX_REMEMBERED_RECORDINGS = 1000
const recordingKinds = new Map<string, RecordingKind>()

/**
 * Download URLs must be https (the finalization workflow rejects anything else).
 * The host is a reserved `.invalid` name: the fake declares a valid https URL
 * but does not serve it. Serving recording bytes belongs to a later ticket.
 */
export const FAKE_DOWNLOAD_ORIGIN = 'https://fakes.invalid'

const RECORDINGS_PATH = /^\/recordings$/
const TRACK_PATH = /^\/recordings\/track$/
const RECORDING_PATH = /^\/recordings\/([^/]+)$/

function rememberKind(id: string, kind: RecordingKind): void {
  if (recordingKinds.size >= MAX_REMEMBERED_RECORDINGS) {
    const oldest = recordingKinds.keys().next().value
    if (oldest !== undefined) recordingKinds.delete(oldest)
  }
  recordingKinds.set(id, kind)
}

function startedRecording(kind: RecordingKind, meetingId: unknown): Response {
  const id = crypto.randomUUID()
  rememberKind(id, kind)
  return jsonResponse({
    success: true,
    data: {
      id,
      status: 'INVOKED',
      type: kind === 'composite' ? 'COMPOSITE' : 'TRACK',
      meeting_id: typeof meetingId === 'string' ? meetingId : null,
      output_file_name: `${id}.webm`,
    },
  })
}

function uploadedRecording(id: string): Response {
  const kind = recordingKinds.get(id) ?? 'composite'
  const fileName = `${id}.webm`
  const url = `${FAKE_DOWNLOAD_ORIGIN}/recordings/${encodeURIComponent(fileName)}`
  const base = {
    id,
    status: 'UPLOADED',
    type: kind === 'composite' ? 'COMPOSITE' : 'TRACK',
    output_file_name: fileName,
  }

  return jsonResponse({
    success: true,
    data:
      kind === 'composite'
        ? { ...base, download_url: url }
        : { ...base, download_urls: [{ download_urls: { [fileName]: url } }] },
  })
}

/**
 * Fakes the RealtimeKit recording routes `createRealtimeKitRecordingProvider`
 * calls. `path` is relative to `/accounts/:accountId/realtime/kit/:appId`.
 */
export const handleRealtimeRecordings = async (
  request: Request,
  path: string,
): Promise<Response | null> => {
  const { method } = request

  if (method === 'POST' && (RECORDINGS_PATH.test(path) || TRACK_PATH.test(path))) {
    const body = (await request.json().catch(() => ({}))) as { meeting_id?: unknown }
    return startedRecording(TRACK_PATH.test(path) ? 'participant_track' : 'composite', body.meeting_id)
  }

  if (method === 'GET' && RECORDINGS_PATH.test(path)) {
    return jsonResponse({ success: true, data: [] })
  }

  const single = RECORDING_PATH.exec(path)
  if (!single) return null
  const id = decodeURIComponent(single[1] as string)

  if (method === 'PUT') {
    return jsonResponse({ success: true, data: { id, status: 'STOPPING' } })
  }
  if (method === 'GET') return uploadedRecording(id)

  return null
}
