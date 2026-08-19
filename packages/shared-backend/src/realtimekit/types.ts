import type { RealtimeKitRecordingState } from '@mako/shared'

// ============================================================================
// RealtimeKit webhook domain types (Story 5.11)
// ============================================================================

export const REALTIMEKIT_WEBHOOK_EVENT_TYPE = 'recording.statusUpdate'

export type RealtimeKitWebhookEventStatus =
  | 'accepted'
  | 'finalizing'
  | 'processed'
  | 'failed'

export const DEFAULT_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL =
  'https://api.realtime.cloudflare.com/.well-known/webhooks.json'

export const DEFAULT_REALTIMEKIT_SWEEP_DELAY_MS = 5 * 60 * 1000

export const DEFAULT_REALTIMEKIT_MAX_SWEEP_ATTEMPTS = 10

export const REALTIMEKIT_RECORDING_FINALIZATION_WORKFLOW_VERSION = 'v1'

// Safe error codes only. Provider error bodies are never persisted.
export const REALTIMEKIT_SAFE_ERROR_CODES = {
  provider_upload_failed: 'provider_upload_failed',
  provider_download_failed: 'provider_download_failed',
  invalid_provider_asset: 'invalid_provider_asset',
  internal_error: 'internal_error',
  sweep_exhausted: 'sweep_exhausted',
  recordings_bucket_not_configured: 'recordings_bucket_not_configured',
} as const

export type RealtimeKitSafeErrorCode =
  (typeof REALTIMEKIT_SAFE_ERROR_CODES)[keyof typeof REALTIMEKIT_SAFE_ERROR_CODES]

// Ordering used to reject provider state regression. Lower is earlier.
export function realtimekitEventStatusPriority(
  status: RealtimeKitWebhookEventStatus,
): number {
  switch (status) {
    case 'accepted':
      return 1
    case 'finalizing':
      return 2
    case 'processed':
      return 3
    case 'failed':
      return 4
  }
}

export function mapRealtimeKitStateToWebhookStatus(
  state: RealtimeKitRecordingState,
): RealtimeKitWebhookEventStatus {
  switch (state) {
    case 'INVOKED':
    case 'RECORDING':
      return 'accepted'
    case 'UPLOADING':
      return 'finalizing'
    case 'UPLOADED':
      return 'processed'
    case 'ERRORED':
      return 'failed'
  }
}

export function buildRecordingFinalizationInstanceId(
  providerRecordingId: string,
  attempt: number,
): string {
  return `recording-finalize-${REALTIMEKIT_RECORDING_FINALIZATION_WORKFLOW_VERSION}-${providerRecordingId}-${attempt}`
}

// ============================================================================
// Webhook repository port
// ============================================================================

export type ResolvedRecordingJob = {
  id: string
  interview_id: string
  provider_recording_id: string
  recording_type: 'composite' | 'participant_track'
  participant_id: string | null
  participant_role: string | null
  provider_status: string | null
  finalization_status: 'pending' | 'processing' | 'finalized' | 'failed'
}

export type RealtimeKitWebhookAcceptanceInput = {
  provider_event_id: string
  event_type: string
  provider_recording_id: string
  provider_asset_id: string | null
  mapped_status: RealtimeKitWebhookEventStatus
  provider_status: string
  next_attempt_at: string | null
  received_at: string
  last_error_code: string | null
}

export type RealtimeKitWebhookAcceptanceResult = {
  outcome: 'recorded' | 'duplicate' | 'stale' | 'unknown_recording'
}

export type RealtimeKitWebhookRepositoryPort = {
  acceptWebhookEvent(
    input: RealtimeKitWebhookAcceptanceInput,
  ): Promise<RealtimeKitWebhookAcceptanceResult>
}

export type RealtimeKitWebhookLogger = {
  info(event: string, context?: Record<string, unknown>): void
  warn(event: string, context?: Record<string, unknown>): void
  error(event: string, context?: Record<string, unknown>): void
}

export type RealtimeKitWorkflowTriggerPort = {
  trigger(providerRecordingId: string, attempt: number): Promise<void>
}

export class RealtimeKitWebhookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RealtimeKitWebhookError'
  }
}

export class RealtimeKitPublicKeyUnavailableError extends RealtimeKitWebhookError {
  constructor(message: string) {
    super(message)
    this.name = 'RealtimeKitPublicKeyUnavailableError'
  }
}

export class RealtimeKitInvalidPublicKeyError extends RealtimeKitWebhookError {
  constructor(message: string) {
    super(message)
    this.name = 'RealtimeKitInvalidPublicKeyError'
  }
}
