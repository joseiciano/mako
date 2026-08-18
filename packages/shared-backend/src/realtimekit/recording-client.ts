import type { RealtimeKitRecordingState } from '@mako/shared'
import { RealtimeKitWebhookError } from './types'

export class RealtimeKitRecordingClientError extends RealtimeKitWebhookError {
  constructor(message: string) {
    super(message)
    this.name = 'RealtimeKitRecordingClientError'
  }
}

export type RealtimeKitRecordingAssetKind = 'composite' | 'participant_track'

export type RealtimeKitRecordingAsset = {
  assetId: string
  kind: RealtimeKitRecordingAssetKind
  downloadUrl: string
  contentType: string
}

export type RealtimeKitRecordingStatusResult = {
  recordingId: string
  state: RealtimeKitRecordingState
  capturedAt: string | null
  assets: RealtimeKitRecordingAsset[]
}

export type RealtimeKitRecordingClientPort = {
  getRecordingStatus(
    providerRecordingId: string,
  ): Promise<RealtimeKitRecordingStatusResult>
}

export type RealtimeKitRecordingClientBindings = {
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_REALTIMEKIT_APP_ID?: string
}

const REALTIMEKIT_RECORDING_FETCH_TIMEOUT_MS = 10_000

export function createRealtimeKitRecordingClient(
  bindings: RealtimeKitRecordingClientBindings,
  dependencies?: {
    fetch?: typeof globalThis.fetch
    baseUrl?: string
  },
): RealtimeKitRecordingClientPort {
  const accountId = bindings.CLOUDFLARE_ACCOUNT_ID
  const apiToken = bindings.CLOUDFLARE_API_TOKEN
  const appId = bindings.CLOUDFLARE_REALTIMEKIT_APP_ID

  if (!accountId || !apiToken || !appId) {
    throw new Error(
      'RealtimeKit recording client requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_REALTIMEKIT_APP_ID.',
    )
  }

  const fetchImpl = dependencies?.fetch ?? globalThis.fetch
  const baseUrl =
    dependencies?.baseUrl ??
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/realtime/kit/${appId}`

  return {
    async getRecordingStatus(providerRecordingId) {
      const response = await fetchImpl(`${baseUrl}/recordings/${providerRecordingId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(REALTIMEKIT_RECORDING_FETCH_TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new RealtimeKitRecordingClientError(
          `RealtimeKit recording status request failed (${response.status}).`,
        )
      }

      const json = (await response.json()) as Record<string, unknown>
      const result = getResponseObject(json)
      const recording = isRecord(result.recording) ? result.recording : result

      const recordingId =
        typeof recording.id === 'string' ? recording.id : undefined

      if (!recordingId) {
        throw new RealtimeKitRecordingClientError(
          'RealtimeKit recording status response is missing the recording id.',
        )
      }

      if (recordingId !== providerRecordingId) {
        // Finalization associates the response's download URLs and artifacts
        // with the requested recording's interview. A stale or incorrect
        // response would cross-associate recordings, so reject it.
        throw new RealtimeKitRecordingClientError(
          `RealtimeKit recording status response recording id ${recordingId} does not match the requested provider recording id ${providerRecordingId}.`,
        )
      }

      const state = parseRecordingState(recording)

      return {
        recordingId,
        state,
        capturedAt: parseOptionalString(recording, 'captured_at', 'capturedAt'),
        assets: parseAssets(recording.assets),
      }
    },
  }
}

// Deterministic in-memory client for tests and demo/local workflow runs.
export function createDemoRealtimeKitRecordingClient(
  statusByRecordingId: Record<string, RealtimeKitRecordingStatusResult>,
): RealtimeKitRecordingClientPort {
  return {
    async getRecordingStatus(providerRecordingId) {
      const status = statusByRecordingId[providerRecordingId]

      if (!status) {
        throw new RealtimeKitRecordingClientError(
          `No demo recording status for ${providerRecordingId}.`,
        )
      }

      return status
    },
  }
}

function parseRecordingState(recording: Record<string, unknown>): RealtimeKitRecordingState {
  const rawState =
    typeof recording.state === 'string'
      ? recording.state
      : typeof recording.status === 'string'
        ? recording.status
        : undefined

  const normalized = rawState?.toUpperCase()

  switch (normalized) {
    case 'INVOKED':
    case 'RECORDING':
    case 'UPLOADING':
    case 'UPLOADED':
    case 'ERRORED':
      return normalized
    default:
      throw new RealtimeKitRecordingClientError(
        `RealtimeKit recording status response has unsupported state ${String(rawState)}.`,
      )
  }
}

function parseAssets(value: unknown): RealtimeKitRecordingAsset[] {
  if (!Array.isArray(value)) {
    return []
  }

  const assets: RealtimeKitRecordingAsset[] = []

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue
    }

    const assetId =
      typeof entry.id === 'string'
        ? entry.id
        : typeof entry.asset_id === 'string'
          ? entry.asset_id
          : undefined
    const downloadUrl =
      typeof entry.url === 'string'
        ? entry.url
        : typeof entry.download_url === 'string'
          ? entry.download_url
          : undefined

    if (!assetId || !downloadUrl) {
      continue
    }

    const contentType =
      typeof entry.content_type === 'string'
        ? entry.content_type
        : inferContentType(assetId)

    assets.push({
      assetId,
      kind: inferAssetKind(assetId, entry),
      downloadUrl,
      contentType,
    })
  }

  return assets
}

// Explicit provider-declared asset kinds take precedence. Filename heuristics
// are only a compatibility fallback for provider responses that omit the kind.
const EXPLICIT_KIND_TO_ASSET_KIND: Record<string, RealtimeKitRecordingAssetKind> = {
  composite: 'composite',
  mp4: 'composite',
  video: 'composite',
  'video/mp4': 'composite',
  participant_track: 'participant_track',
  participant: 'participant_track',
  m4a: 'participant_track',
  audio: 'participant_track',
  'audio/mp4': 'participant_track',
}

function inferAssetKind(
  assetId: string,
  entry: Record<string, unknown>,
): RealtimeKitRecordingAssetKind {
  const kind = typeof entry.kind === 'string' ? entry.kind.trim().toLowerCase() : ''

  const explicitKind = EXPLICIT_KIND_TO_ASSET_KIND[kind]
  if (explicitKind) {
    return explicitKind
  }

  if (kind.includes('m4a') || kind.includes('audio')) {
    return 'participant_track'
  }

  if (assetId.toLowerCase().includes('m4a')) {
    return 'participant_track'
  }

  return 'composite'
}

function inferContentType(assetId: string): string {
  return assetId.toLowerCase().includes('m4a') ? 'audio/mp4' : 'video/mp4'
}

function getResponseObject(json: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(json.data)) return json.data
  if (isRecord(json.result)) return json.result
  return json
}

function parseOptionalString(
  record: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
): string | null {
  const value = record[snakeKey] ?? record[camelKey]
  return typeof value === 'string' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
