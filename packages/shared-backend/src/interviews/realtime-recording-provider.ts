import type { RealtimeKitBindings } from './realtime-provider'

export const RECORDING_MAX_SECONDS = 3600

const RECORDING_FETCH_TIMEOUT_MS = 10_000
const ACTIVE_PROVIDER_STATUSES: readonly string[] = ['INVOKED', 'RECORDING', 'PAUSED']

export type RealtimeRecordingErrorCode =
  | 'provider_unavailable'
  | 'invalid_meeting'
  | 'duplicate_active_recording'
  | 'recording_failed'

/**
 * Typed provider failure. `ambiguous` is true when the provider may have acted
 * on the request (network error, timeout, 5xx, 429), so callers must reconcile
 * active provider recordings before retrying.
 */
export class RealtimeRecordingError extends Error {
  constructor(
    readonly code: RealtimeRecordingErrorCode,
    readonly ambiguous: boolean,
    message: string,
  ) {
    super(message)
    this.name = 'RealtimeRecordingError'
  }
}

export type ProviderRecordingKind = 'composite' | 'participant_track'

export type ProviderRecording = {
  id: string
  kind: ProviderRecordingKind
  status: string
  outputFileName: string | null
}

export type StartParticipantTrackRecordingInput = {
  meetingId: string
  participantUserIds: string[]
}

export type RealtimeRecordingProvider = {
  startCompositeRecording(input: { meetingId: string }): Promise<ProviderRecording>
  startParticipantTrackRecording(
    input: StartParticipantTrackRecordingInput,
  ): Promise<ProviderRecording>
  stopRecording(input: { recordingId: string }): Promise<void>
  listActiveRecordings(input: { meetingId: string }): Promise<ProviderRecording[]>
  getRecording(input: { recordingId: string }): Promise<ProviderRecording>
}

export function createRealtimeKitRecordingProvider(
  bindings: RealtimeKitBindings,
  fetchImpl: typeof fetch = fetch,
): RealtimeRecordingProvider {
  const accountId = bindings.CLOUDFLARE_ACCOUNT_ID
  const apiToken = bindings.CLOUDFLARE_API_TOKEN
  const appId = bindings.CLOUDFLARE_REALTIMEKIT_APP_ID

  if (!accountId || !apiToken || !appId) {
    throw new Error(
      'RealtimeKit recording provider requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_REALTIMEKIT_APP_ID.',
    )
  }

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/realtime/kit/${appId}/recordings`

  async function call(path: string, method: string, body?: unknown): Promise<unknown> {
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(RECORDING_FETCH_TIMEOUT_MS),
      })
    } catch {
      throw new RealtimeRecordingError(
        'provider_unavailable',
        true,
        'RealtimeKit recording request failed before a response was received.',
      )
    }

    if (!response.ok) {
      throw mapHttpError(response.status)
    }

    return response.json().catch(() => {
      throw new RealtimeRecordingError(
        'provider_unavailable',
        true,
        'RealtimeKit recording response was not valid JSON.',
      )
    })
  }

  async function start(
    path: string,
    body: Record<string, unknown>,
    kind: ProviderRecordingKind,
  ): Promise<ProviderRecording> {
    const recording = parseRecording(await call(path, 'POST', body), kind)
    if (!recording) {
      throw new RealtimeRecordingError(
        'provider_unavailable',
        true,
        'RealtimeKit recording response missing recording id.',
      )
    }
    return assertNotErrored(recording)
  }

  return {
    startCompositeRecording(input) {
      return start(
        '',
        {
          meeting_id: input.meetingId,
          max_seconds: RECORDING_MAX_SECONDS,
          allow_multiple_recordings: true,
        },
        'composite',
      )
    },

    startParticipantTrackRecording(input) {
      return start(
        '/track',
        {
          meeting_id: input.meetingId,
          user_ids: input.participantUserIds,
          max_seconds: RECORDING_MAX_SECONDS,
          layers: { default: { media_kind: 'audio' } },
        },
        'participant_track',
      )
    },

    async stopRecording(input) {
      await call(`/${encodeURIComponent(input.recordingId)}`, 'PUT', { action: 'stop' })
    },

    async listActiveRecordings(input) {
      const payload = await call(
        `?meeting_id=${encodeURIComponent(input.meetingId)}`,
        'GET',
      )
      const data = (payload as { data?: unknown })?.data
      const items = Array.isArray(data)
        ? data
        : Array.isArray((data as { recordings?: unknown })?.recordings)
          ? ((data as { recordings: unknown[] }).recordings)
          : []

      return items
        .map((item) => parseRecordingItem(item))
        .filter((item): item is ProviderRecording => item !== null)
        .filter((item) => ACTIVE_PROVIDER_STATUSES.includes(item.status))
    },

    async getRecording(input) {
      const recording = parseRecording(
        await call(`/${encodeURIComponent(input.recordingId)}`, 'GET'),
        'composite',
      )
      if (!recording) {
        throw new RealtimeRecordingError(
          'provider_unavailable',
          true,
          'RealtimeKit recording status response missing recording id.',
        )
      }
      return recording
    },
  }
}

function mapHttpError(status: number): RealtimeRecordingError {
  if (status === 404 || status === 400) {
    return new RealtimeRecordingError(
      'invalid_meeting',
      false,
      `RealtimeKit rejected the meeting or recording (${status}).`,
    )
  }
  if (status === 409) {
    return new RealtimeRecordingError(
      'duplicate_active_recording',
      false,
      'RealtimeKit already has an active recording for this meeting (409).',
    )
  }
  if (status >= 500 || status === 429 || status === 408) {
    return new RealtimeRecordingError(
      'provider_unavailable',
      true,
      `RealtimeKit recording service unavailable (${status}).`,
    )
  }
  return new RealtimeRecordingError(
    'recording_failed',
    false,
    `RealtimeKit rejected the recording request (${status}).`,
  )
}

function assertNotErrored(recording: ProviderRecording): ProviderRecording {
  if (recording.status === 'ERRORED') {
    throw new RealtimeRecordingError(
      'recording_failed',
      false,
      'RealtimeKit recording entered a terminal error state.',
    )
  }
  return recording
}

function parseRecording(
  payload: unknown,
  fallbackKind: ProviderRecordingKind,
): ProviderRecording | null {
  const data = (payload as { data?: Record<string, unknown> } | null)?.data
  const nested = data && typeof data.recording === 'object' ? data.recording : data
  return parseRecordingItem(nested, fallbackKind)
}

function parseRecordingItem(
  item: unknown,
  fallbackKind: ProviderRecordingKind = 'composite',
): ProviderRecording | null {
  if (typeof item !== 'object' || item === null) return null
  const record = item as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) return null

  const kind: ProviderRecordingKind =
    record.type === 'TRACK'
      ? 'participant_track'
      : typeof record.type === 'string'
        ? 'composite'
        : fallbackKind

  return {
    id: record.id,
    kind,
    status: typeof record.status === 'string' ? record.status : 'INVOKED',
    outputFileName:
      typeof record.output_file_name === 'string' ? record.output_file_name : null,
  }
}
