import { describe, expect, it } from 'vitest'
import {
  realtimekitRecordingStateSchema,
  realtimekitWebhookEventTypeSchema,
  realtimekitWebhookPayloadSchema,
} from './interviews'

const VALID_PAYLOAD = {
  type: 'recording.statusUpdate',
  recording: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    state: 'UPLOADED',
  },
}

describe('realtimekitRecordingStateSchema', function realtimekitStateSuite() {
  it('accepts every documented provider state', function run() {
    for (const state of ['INVOKED', 'RECORDING', 'UPLOADING', 'UPLOADED', 'ERRORED']) {
      expect(realtimekitRecordingStateSchema.parse(state)).toBe(state)
    }
  })

  it('rejects an unsupported provider state', function run() {
    const result = realtimekitRecordingStateSchema.safeParse('FAILED')
    expect(result.success).toBe(false)
  })
})

describe('realtimekitWebhookEventTypeSchema', function eventTypeSuite() {
  it('accepts the supported recording.statusUpdate event', function run() {
    expect(realtimekitWebhookEventTypeSchema.parse('recording.statusUpdate')).toBe(
      'recording.statusUpdate',
    )
  })

  it('rejects other event types', function run() {
    expect(realtimekitWebhookEventTypeSchema.safeParse('meeting.created').success).toBe(false)
  })
})

describe('realtimekitWebhookPayloadSchema', function payloadSuite() {
  it('accepts a valid recording.statusUpdate payload with passthrough provider fields', function run() {
    const parsed = realtimekitWebhookPayloadSchema.parse({
      ...VALID_PAYLOAD,
      appId: 'some-app-id',
      meetingId: 'meeting-1',
    })

    expect(parsed).toMatchObject(VALID_PAYLOAD)
    // Unknown provider fields survive passthrough so provider payloads do not break.
    expect(parsed).toHaveProperty('appId')
  })

  it('rejects a payload missing the recording id', function run() {
    const result = realtimekitWebhookPayloadSchema.safeParse({
      type: 'recording.statusUpdate',
      recording: { state: 'UPLOADED' },
    })

    expect(result.success).toBe(false)
  })

  it('rejects a payload with an unsupported recording state', function run() {
    const result = realtimekitWebhookPayloadSchema.safeParse({
      type: 'recording.statusUpdate',
      recording: { id: 'recording-1', state: 'UNKNOWN' },
    })

    expect(result.success).toBe(false)
  })

  it('rejects a payload missing the type discriminator', function run() {
    const result = realtimekitWebhookPayloadSchema.safeParse({
      recording: { id: 'recording-1', state: 'UPLOADED' },
    })

    expect(result.success).toBe(false)
  })
})
