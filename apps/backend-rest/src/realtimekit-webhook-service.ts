import { createDatabaseQueryExecutor } from './database'
import { RealtimeKitWebhookRepository } from './realtimekit-webhook-repository'
import type { RealtimeKitWebhookSignatureVerifier } from './realtimekit-webhook-signature'
import type { DatabaseBindings } from './database'

export type WorkflowBinding = {
  createBatch: (items: Array<{ id: string; params: { recording_id: string; schema_version: 1 } }>) => Promise<unknown>
}

export type WebhookBindings = DatabaseBindings & {
  REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL?: string
  RECORDING_FINALIZATION_WORKFLOW?: WorkflowBinding
}

const SUPPORTED_PROVIDER_STATUSES = ['INVOKED', 'RECORDING', 'UPLOADING', 'UPLOADED', 'ERRORED'] as const
type ProviderStatus = (typeof SUPPORTED_PROVIDER_STATUSES)[number]

const CHECKPOINT_MAP: Record<ProviderStatus, string> = {
  INVOKED: 'accepted',
  RECORDING: 'accepted',
  UPLOADING: 'finalizing',
  UPLOADED: 'processed',
  ERRORED: 'failed',
}

const STATUS_RANK: Record<string, number> = {
  accepted: 1,
  finalizing: 2,
  failed: 3,
  processed: 4,
  // also handle raw provider strings as fallback
  INVOKED: 1,
  RECORDING: 2,
  UPLOADING: 3,
  ERRORED: 3,
  UPLOADED: 4,
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class RealtimeKitWebhookService {
  constructor(
    private readonly repository: RealtimeKitWebhookRepository,
    private readonly verifierFactory: (url: string) => RealtimeKitWebhookSignatureVerifier,
  ) {}

  async handle(input: {
    rawBytes: Uint8Array
    signature: string
    uuid: string
    bindings: WebhookBindings
  }): Promise<{ status: number; body: unknown }> {
    const verifier = this.verifierFactory(input.bindings.REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL ?? 'https://api.realtime.cloudflare.com/.well-known/webhooks.json')
    const verifyResult = await verifier.verify(input.rawBytes, input.signature)
    if (verifyResult === 'unavailable') {
      return { status: 503, body: { error: 'webhook key unavailable' } }
    }
    if (verifyResult === 'invalid') {
      return { status: 401, body: { error: 'invalid signature' } }
    }

    // Parse JSON after verification
    let parsed: unknown
    try {
      const text = new TextDecoder().decode(input.rawBytes)
      parsed = JSON.parse(text)
    } catch {
      return { status: 400, body: { error: 'invalid json' } }
    }

    if (!parsed || typeof parsed !== 'object') {
      return { status: 400, body: { error: 'invalid payload' } }
    }

    const payload = parsed as Record<string, unknown>

    // Validate supported recording.statusUpdate after verification; unsupported returns 200 no DB
    const eventType = typeof payload.event === 'string' ? payload.event : undefined
    if (eventType !== 'recording.statusUpdate') {
      // Check also maybe payload.event_type? But spec says recording.statusUpdate
      // If unsupported but signature valid, return 200 with no side effects
      // We must ensure eventType is missing or not recording.statusUpdate => 200
      // But if eventType is undefined, it's unsupported
      return { status: 200, body: { ok: true } }
    }

    const recording = payload.recording as Record<string, unknown> | undefined
    if (!recording || typeof recording !== 'object') {
      return { status: 400, body: { error: 'invalid recording' } }
    }

    const id = typeof recording.id === 'string' ? recording.id : undefined
    const recordingId = typeof recording.recordingId === 'string' ? recording.recordingId : undefined
    const status = typeof recording.status === 'string' ? recording.status : undefined

    if (!id || !recordingId || !status) {
      return { status: 400, body: { error: 'missing recording fields' } }
    }

    if (id !== recordingId) {
      return { status: 400, body: { error: 'mismatched ids' } }
    }

    if (!UUID_RE.test(id)) {
      return { status: 400, body: { error: 'invalid recording id' } }
    }

    if (!SUPPORTED_PROVIDER_STATUSES.includes(status as ProviderStatus)) {
      return { status: 400, body: { error: 'unsupported status' } }
    }

    const providerStatus = status as ProviderStatus
    const checkpoint = CHECKPOINT_MAP[providerStatus]

    // Transaction
    const executor = createDatabaseQueryExecutor(input.bindings)
    let shouldTrigger = false
    let triggerProviderId: string | null = null

    try {
      const beginResult = await executor.query({ text: 'BEGIN;', values: [] })
      void beginResult

      // Insert webhook event with ON CONFLICT DO NOTHING
      const insertResult = await this.repository.insertWebhookEvent(executor, {
        providerEventId: input.uuid,
        eventType,
        recordingId: id,
        status: checkpoint,
      })

      const insertedRowCount = insertResult.rowCount
      if (insertedRowCount === 0) {
        await executor.query({ text: 'COMMIT;', values: [] })
        return { status: 200, body: { ok: true, deduped: true } }
      }

      const recordingRow = await this.repository.findRecordingForUpdate(executor, id)

      if (!recordingRow) {
        // Preserve diagnostic: still commit the webhook event insert
        await executor.query({ text: 'COMMIT;', values: [] })
        return { status: 200, body: { ok: true } }
      }

      const currentRank = STATUS_RANK[recordingRow.provider_status ?? ''] ?? 0
      const newRank = STATUS_RANK[providerStatus] ?? 0

      if (newRank <= currentRank) {
        await executor.query({ text: 'COMMIT;', values: [] })
        return { status: 200, body: { ok: true } }
      }

      const errorCode = checkpoint === 'failed' ? 'provider_error' : null

      await this.repository.updateRecordingStatus(executor, {
        providerRecordingId: id,
        providerStatus,
        checkpoint,
        errorCode,
      })

      await executor.query({ text: 'COMMIT;', values: [] })

      if (checkpoint === 'processed') {
        shouldTrigger = true
        triggerProviderId = id
      }
    } catch (error) {
      try {
        await executor.query({ text: 'ROLLBACK;', values: [] })
      } catch (rollbackError) {
        console.error({
          event: 'realtimekit_webhook_rollback_failure',
          provider_recording_id: id,
          error_message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        })
      }
      throw error
    }

    if (shouldTrigger && triggerProviderId) {
      const workflow = input.bindings.RECORDING_FINALIZATION_WORKFLOW
      if (workflow?.createBatch) {
        try {
          await workflow.createBatch([
            {
              id: `recording-finalization-v1-${triggerProviderId}`,
              params: { recording_id: triggerProviderId, schema_version: 1 },
            },
          ])
        } catch (error) {
          console.error({
            event: 'realtimekit_webhook_workflow_trigger_failure',
            provider_recording_id: triggerProviderId,
            error_message: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    return { status: 200, body: { ok: true } }
  }
}
