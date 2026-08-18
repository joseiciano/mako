import { describe, expect, it, vi } from 'vitest'
import { createRealtimeKitWorkflowTriggerPort } from './workflow-trigger'

describe('createRealtimeKitWorkflowTriggerPort', function workflowTriggerSuite() {
  it('creates one deterministic workflow instance per recording and attempt', async function run() {
    const createBatch = vi.fn(async () => [])
    const trigger = createRealtimeKitWorkflowTriggerPort({ createBatch })

    await trigger.trigger('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3)

    expect(createBatch).toHaveBeenCalledExactlyOnceWith([
      {
        id: 'recording-finalize-v1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-3',
        params: {
          provider_recording_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          attempt: 3,
        },
      },
    ])
  })

  it('surfaces workflow creation failures for scheduled retry handling', async function run() {
    const createBatch = vi.fn(async () => {
      throw new Error('workflow unavailable')
    })
    const trigger = createRealtimeKitWorkflowTriggerPort({ createBatch })

    await expect(
      trigger.trigger('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0),
    ).rejects.toThrow('workflow unavailable')
  })
})
