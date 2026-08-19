import type { RealtimeKitWorkflowTriggerPort } from './types'
import { buildRecordingFinalizationInstanceId } from './types'

type RecordingFinalizationWorkflowPayload = {
  provider_recording_id: string
  attempt: number
}

type CloudflareWorkflow = {
  createBatch(
    batch: Array<{
      id: string
      params?: RecordingFinalizationWorkflowPayload
    }>,
  ): Promise<unknown>
}

export function createRealtimeKitWorkflowTriggerPort(
  workflow: CloudflareWorkflow,
): RealtimeKitWorkflowTriggerPort {
  return {
    async trigger(providerRecordingId: string, attempt: number): Promise<void> {
      const instanceId = buildRecordingFinalizationInstanceId(
        providerRecordingId,
        attempt,
      )

      await workflow.createBatch([
        {
          id: instanceId,
          params: {
            provider_recording_id: providerRecordingId,
            attempt,
          },
        },
      ])
    },
  }
}
