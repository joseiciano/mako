import type {
  RealtimeKitWebhookAcceptanceInput,
  RealtimeKitWebhookAcceptanceResult,
  RealtimeKitWebhookEventStatus,
  RealtimeKitWebhookRepositoryPort,
  ResolvedRecordingJob,
} from './types'

// ============================================================================
// RSA helpers for signature tests
// ============================================================================

export type GeneratedRsaKeyPair = {
  keyPair: CryptoKeyPair
  publicKeyPem: string
  publicKeyDer: ArrayBuffer
}

export async function generateRsaKeyPair(): Promise<GeneratedRsaKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )

  const publicKeyDer = await crypto.subtle.exportKey('spki', keyPair.publicKey)
  const publicKeyPem = [
    '-----BEGIN PUBLIC KEY-----',
    toBase64(publicKeyDer),
    '-----END PUBLIC KEY-----',
  ].join('\n')

  return { keyPair, publicKeyPem, publicKeyDer }
}

export async function signWithKey(
  privateKey: CryptoKey,
  data: ArrayBuffer | Uint8Array<ArrayBuffer>,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    data,
  )
  return toBase64(signature)
}

export function toBase64(data: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return Buffer.from(bytes).toString('base64')
}

export function encodeText(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer
}

// ============================================================================
// In-memory webhook repository (service tests)
// ============================================================================

export type InMemoryWebhookRepositoryOptions = {
  job?: ResolvedRecordingJob | null
  eventsByEventId?: Map<string, { status: RealtimeKitWebhookEventStatus; received_at: string }>
  eventsByRecordingId?: Map<string, Array<{ provider_event_id: string; status: RealtimeKitWebhookEventStatus; received_at: string }>>
}

export function createInMemoryWebhookRepository(
  options: InMemoryWebhookRepositoryOptions = {},
): {
  repository: RealtimeKitWebhookRepositoryPort
  accepts: RealtimeKitWebhookAcceptanceInput[]
  results: RealtimeKitWebhookAcceptanceResult[]
  job: () => ResolvedRecordingJob | null
} {
  let job = options.job ?? null
  const eventsByEventId = new Map(options.eventsByEventId ?? new Map())
  const eventsByRecordingId = new Map(
    (options.eventsByRecordingId ?? new Map()) as Map<
      string,
      Array<{ provider_event_id: string; status: RealtimeKitWebhookEventStatus; received_at: string }>
    >,
  )
  const accepts: RealtimeKitWebhookAcceptanceInput[] = []
  const results: RealtimeKitWebhookAcceptanceResult[] = []

  const repository: RealtimeKitWebhookRepositoryPort = {
    async acceptWebhookEvent(input) {
      accepts.push(input)

      if (!job) {
        const result: RealtimeKitWebhookAcceptanceResult = { outcome: 'unknown_recording' }
        results.push(result)
        return result
      }

      if (eventsByEventId.has(input.provider_event_id)) {
        const result: RealtimeKitWebhookAcceptanceResult = { outcome: 'duplicate' }
        results.push(result)
        return result
      }

      const latestForRecording = eventsByRecordingId.get(input.provider_recording_id) ?? []
      const [latest] = latestForRecording

      if (
        latest &&
        realtimekitStatusPriority(input.mapped_status) <
          realtimekitStatusPriority(latest.status)
      ) {
        const result: RealtimeKitWebhookAcceptanceResult = { outcome: 'stale' }
        results.push(result)
        return result
      }

      eventsByEventId.set(input.provider_event_id, {
        status: input.mapped_status,
        received_at: input.received_at,
      })
      eventsByRecordingId.set(input.provider_recording_id, [
        {
          provider_event_id: input.provider_event_id,
          status: input.mapped_status,
          received_at: input.received_at,
        },
        ...latestForRecording,
      ])
      job = {
        ...job,
        provider_status: input.provider_status,
      }

      const result: RealtimeKitWebhookAcceptanceResult = { outcome: 'recorded' }
      results.push(result)
      return result
    },
  }

  return {
    repository,
    accepts,
    results,
    job: () => job,
  }
}

export function realtimekitStatusPriority(status: RealtimeKitWebhookEventStatus): number {
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

export function createRecordingJob(
  overrides: Partial<ResolvedRecordingJob> = {},
): ResolvedRecordingJob {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    interview_id: '22222222-2222-4222-8222-222222222222',
    provider_recording_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    recording_type: 'composite',
    participant_id: null,
    participant_role: null,
    provider_status: 'UPLOADED',
    finalization_status: 'pending',
    ...overrides,
  }
}
