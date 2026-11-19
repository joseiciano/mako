import { jsonResponse } from '../http.ts'

type RecordingKind = 'composite' | 'participant_track'

type StartedRecording = {
  id: string
  kind: RecordingKind
  meetingId: string | null
  userIds: string[]
}

const MAX_REMEMBERED_RECORDINGS = 1000
const startedRecordings = new Map<string, StartedRecording>()

/**
 * Download URLs must be https (the finalization workflow rejects anything else).
 * The host is a reserved `.invalid` name that nothing resolves; the local
 * orchestrator entry (docker/local/orchestrator-fakes-entry.mjs) rewrites it to
 * the fakes service, which serves `/recordings/:file` (see recording-download.ts).
 */
export const FAKE_DOWNLOAD_ORIGIN = 'https://fakes.invalid'

/** Recordings started through the fake, oldest first. */
export const listStartedRecordings = (): StartedRecording[] => [...startedRecordings.values()]

const RECORDINGS_PATH = /^\/recordings$/
const TRACK_PATH = /^\/recordings\/track$/
const RECORDING_PATH = /^\/recordings\/([^/]+)$/

function remember(recording: StartedRecording): void {
  if (startedRecordings.size >= MAX_REMEMBERED_RECORDINGS) {
    const oldest = startedRecordings.keys().next().value
    if (oldest !== undefined) startedRecordings.delete(oldest)
  }
  startedRecordings.set(recording.id, recording)
}

function startedRecording(kind: RecordingKind, body: { meeting_id?: unknown; user_ids?: unknown }): Response {
  const id = crypto.randomUUID()
  const meetingId = typeof body.meeting_id === 'string' ? body.meeting_id : null
  const userIds = Array.isArray(body.user_ids)
    ? body.user_ids.filter((userId): userId is string => typeof userId === 'string')
    : []
  remember({ id, kind, meetingId, userIds })
  return jsonResponse({
    success: true,
    data: {
      id,
      status: 'INVOKED',
      type: kind === 'composite' ? 'COMPOSITE' : 'TRACK',
      meeting_id: meetingId,
      output_file_name: `${id}.webm`,
    },
  })
}

function uploadedRecording(id: string): Response {
  const { kind, userIds } = startedRecordings.get(id) ?? { kind: 'composite' as const, userIds: [] }
  const downloadUrl = (fileName: string) =>
    `${FAKE_DOWNLOAD_ORIGIN}/recordings/${encodeURIComponent(fileName)}`
  const base = {
    id,
    status: 'UPLOADED',
    type: kind === 'composite' ? 'COMPOSITE' : 'TRACK',
    output_file_name: `${id}.webm`,
  }

  if (kind === 'composite') {
    return jsonResponse({ success: true, data: { ...base, download_url: downloadUrl(`${id}.webm`) } })
  }

  // The finalization workflow maps a track file to a participant by the first
  // UUID in its name, so each participant file is named after its user id.
  const files = Object.fromEntries(
    userIds.map((userId) => [`${userId}-${id}.webm`, downloadUrl(`${userId}-${id}.webm`)]),
  )
  return jsonResponse({ success: true, data: { ...base, download_urls: [{ download_urls: files }] } })
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
    const body = (await request.json().catch(() => ({}))) as { meeting_id?: unknown; user_ids?: unknown }
    return startedRecording(TRACK_PATH.test(path) ? 'participant_track' : 'composite', body)
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
