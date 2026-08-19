import {
  realtimekitWebhookPayloadSchema,
  type RealtimeKitWebhookPayload,
} from '@mako/shared'
import {
  DEFAULT_REALTIMEKIT_SWEEP_DELAY_MS,
  mapRealtimeKitStateToWebhookStatus,
  REALTIMEKIT_SAFE_ERROR_CODES,
  REALTIMEKIT_WEBHOOK_EVENT_TYPE,
  type RealtimeKitWebhookLogger,
  type RealtimeKitWebhookRepositoryPort,
  type RealtimeKitWorkflowTriggerPort,
} from './types'
import type { RealtimeKitSignatureVerifier } from './webhook-signature'

export type RealtimeKitWebhookServiceConfig = {
  sweepDelayMs: number
}

export const DEFAULT_REALTIMEKIT_WEBHOOK_SERVICE_CONFIG: RealtimeKitWebhookServiceConfig = {
  sweepDelayMs: DEFAULT_REALTIMEKIT_SWEEP_DELAY_MS,
}

export type RealtimeKitWebhookOutcome =
  | 'processed'
  | 'acknowledged'
  | 'duplicate'
  | 'stale'
  | 'unknown_recording'
  | 'unsupported_type'
  | 'invalid_signature'
  | 'invalid_payload'

export type RealtimeKitWebhookHandleResult = {
  httpStatus: 200 | 400
  outcome: RealtimeKitWebhookOutcome
}

export class RealtimeKitWebhookService {
  constructor(
    private readonly repository: RealtimeKitWebhookRepositoryPort,
    private readonly signatureVerifier: RealtimeKitSignatureVerifier,
    private readonly workflowTrigger: RealtimeKitWorkflowTriggerPort | undefined,
    private readonly logger: RealtimeKitWebhookLogger,
    private readonly config: RealtimeKitWebhookServiceConfig = DEFAULT_REALTIMEKIT_WEBHOOK_SERVICE_CONFIG,
  ) {}

  async handleWebhook(input: {
    rawBody: ArrayBuffer
    signatureBase64: string | undefined
    eventUuid: string | undefined
    now?: string
  }): Promise<RealtimeKitWebhookHandleResult> {
    const receivedAt = input.now ?? new Date().toISOString()

    if (!input.signatureBase64 || !input.eventUuid) {
      return { httpStatus: 400, outcome: 'invalid_signature' }
    }

    const signatureValid = await this.signatureVerifier.verify({
      rawBody: input.rawBody,
      signatureBase64: input.signatureBase64,
    })

    if (!signatureValid) {
      return { httpStatus: 400, outcome: 'invalid_signature' }
    }

    const payload = parsePayload(input.rawBody)

    if (!payload) {
      return { httpStatus: 400, outcome: 'invalid_payload' }
    }

    if (payload.type !== REALTIMEKIT_WEBHOOK_EVENT_TYPE) {
      // Validly signed unsupported event types are acknowledged without side effects.
      return { httpStatus: 200, outcome: 'unsupported_type' }
    }

    const parsedPayload = realtimekitWebhookPayloadSchema.safeParse(payload)

    if (!parsedPayload.success) {
      return { httpStatus: 400, outcome: 'invalid_payload' }
    }

    const event = parsedPayload.data
    const providerState = event.recording.state
    const providerRecordingId = event.recording.id
    const mappedStatus = mapRealtimeKitStateToWebhookStatus(providerState)
    const isTerminalFailure = mappedStatus === 'failed'

    const acceptance = await this.repository.acceptWebhookEvent({
      provider_event_id: input.eventUuid,
      event_type: REALTIMEKIT_WEBHOOK_EVENT_TYPE,
      provider_recording_id: providerRecordingId,
      provider_asset_id: extractProviderAssetId(event),
      mapped_status: mappedStatus,
      provider_status: providerState,
      // Every event, including a processed UPLOADED event, keeps a retry
      // checkpoint until finalization calls markEventProcessed(). A null due
      // date would make the sweep skip it, leaving the recording unfinalized
      // if the initial workflow trigger (createBatch) fails.
      next_attempt_at: addMilliseconds(receivedAt, this.config.sweepDelayMs),
      received_at: receivedAt,
      last_error_code: isTerminalFailure
        ? REALTIMEKIT_SAFE_ERROR_CODES.provider_upload_failed
        : null,
    })

    switch (acceptance.outcome) {
      case 'duplicate':
        return { httpStatus: 200, outcome: 'duplicate' }
      case 'stale':
        return { httpStatus: 200, outcome: 'stale' }
      case 'unknown_recording':
        this.logger.warn('realtimekit_webhook.unknown_recording', {
          provider_recording_id: providerRecordingId,
          provider_event_id: input.eventUuid,
        })
        return { httpStatus: 200, outcome: 'unknown_recording' }
      case 'recorded':
        break
    }

    if (mappedStatus === 'processed') {
      await this.triggerFinalization(providerRecordingId, input.eventUuid)
    }

    return {
      httpStatus: 200,
      outcome: mappedStatus === 'processed' ? 'processed' : 'acknowledged',
    }
  }

  private async triggerFinalization(
    providerRecordingId: string,
    providerEventId: string,
  ): Promise<void> {
    if (!this.workflowTrigger) {
      this.logger.warn('realtimekit_webhook.workflow_not_configured', {
        provider_recording_id: providerRecordingId,
      })
      return
    }

    try {
      await this.workflowTrigger.trigger(providerRecordingId, 0)
    } catch (error) {
      // The event is already durably persisted; the scheduled sweep retries.
      this.logger.warn('realtimekit_webhook.workflow_trigger_failed', {
        provider_recording_id: providerRecordingId,
        provider_event_id: providerEventId,
        error_message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

function parsePayload(rawBody: ArrayBuffer): Record<string, unknown> | null {
  try {
    const text = new TextDecoder().decode(rawBody)
    const json = JSON.parse(text) as unknown

    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return null
    }

    return json as Record<string, unknown>
  } catch {
    return null
  }
}

function extractProviderAssetId(event: RealtimeKitWebhookPayload): string | null {
  const recording = event.recording as Record<string, unknown>
  const candidate =
    typeof recording.asset_id === 'string'
      ? recording.asset_id
      : typeof recording.assetId === 'string'
        ? recording.assetId
        : undefined

  return candidate ?? null
}

function addMilliseconds(timestamp: string, millis: number): string {
  return new Date(new Date(timestamp).getTime() + millis).toISOString()
}
