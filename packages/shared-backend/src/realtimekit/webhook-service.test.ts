import { describe, expect, it, vi } from 'vitest'
import { RealtimeKitWebhookService } from './webhook-service'
import { RealtimeKitWebhookRepository } from './webhook-repository'
import { RecordingFinalizationRepository } from './finalization-repository'
import { createRealtimeKitWorkflowTriggerPort } from './workflow-trigger'
import { buildRecordingFinalizationInstanceId } from './types'
import type { SqlQueryExecutor } from '../index'
import type {
  RealtimeKitSignatureVerifier,
} from './webhook-signature'
import type { RealtimeKitWebhookLogger } from './types'
import {
  createInMemoryWebhookRepository,
  createRecordingJob,
  encodeText,
} from './test-utils'

const EVENT_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const RECORDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function createNoopLogger(): RealtimeKitWebhookLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function createSignatureVerifier(result: boolean): RealtimeKitSignatureVerifier {
  return {
    async verify() {
      return result
    },
  }
}

function createService(options: {
  repository?: ReturnType<typeof createInMemoryWebhookRepository>
  signatureResult?: boolean
  workflowTrigger?: { trigger: ReturnType<typeof vi.fn> } | undefined
  logger?: RealtimeKitWebhookLogger
}) {
  const repo = options.repository ?? createInMemoryWebhookRepository()
  const logger = options.logger ?? createNoopLogger()
  const service = new RealtimeKitWebhookService(
    repo.repository,
    createSignatureVerifier(options.signatureResult ?? true),
    options.workflowTrigger,
    logger,
    { sweepDelayMs: 5 * 60 * 1000 },
  )
  return { service, repo, logger }
}

function buildBody(state: string, eventType = 'recording.statusUpdate'): ArrayBuffer {
  return encodeText(
    JSON.stringify({
      type: eventType,
      recording: { id: RECORDING_ID, state },
    }),
  )
}

describe('RealtimeKitWebhookService', function webhookServiceSuite() {
  it('maps UPLOADED to processed, persists the event, and triggers the finalization workflow', async function run() {
    const workflowTrigger = { trigger: vi.fn(async () => undefined) }
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({
        job: createRecordingJob({ provider_status: 'UPLOADING' }),
      }),
      workflowTrigger,
    })

    const result = await service.handleWebhook({
      rawBody: buildBody('UPLOADED'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(200)
    expect(result.outcome).toBe('processed')
    expect(repo.accepts).toHaveLength(1)
    expect(repo.accepts[0]).toMatchObject({
      provider_event_id: EVENT_UUID,
      provider_recording_id: RECORDING_ID,
      provider_status: 'UPLOADED',
      mapped_status: 'processed',
      // A processed UPLOADED event stays sweep-eligible until the finalization
      // workflow marks it processed, so a failed createBatch still retries.
      next_attempt_at: '2026-08-17T12:05:00.000Z',
      last_error_code: null,
    })
    expect(workflowTrigger.trigger).toHaveBeenCalledExactlyOnceWith(RECORDING_ID, 0)
  })

  it('maps INVOKED and RECORDING to accepted without triggering the workflow', async function run() {
    for (const state of ['INVOKED', 'RECORDING']) {
      const workflowTrigger = { trigger: vi.fn(async () => undefined) }
      const { service, repo } = createService({
        repository: createInMemoryWebhookRepository({
          job: createRecordingJob(),
        }),
        workflowTrigger,
      })

      const result = await service.handleWebhook({
        rawBody: buildBody(state),
        signatureBase64: 'c2ln',
        eventUuid: `${EVENT_UUID}-${state}`,
        now: '2026-08-17T12:00:00.000Z',
      })

      expect(result.httpStatus).toBe(200)
      expect(result.outcome).toBe('acknowledged')
      expect(repo.accepts[0].mapped_status).toBe('accepted')
      expect(repo.accepts[0].next_attempt_at).not.toBeNull()
      expect(workflowTrigger.trigger).not.toHaveBeenCalled()
    }
  })

  it('maps UPLOADING to finalizing without triggering the workflow', async function run() {
    const workflowTrigger = { trigger: vi.fn(async () => undefined) }
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({ job: createRecordingJob() }),
      workflowTrigger,
    })

    const result = await service.handleWebhook({
      rawBody: buildBody('UPLOADING'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(200)
    expect(result.outcome).toBe('acknowledged')
    expect(repo.accepts[0].mapped_status).toBe('finalizing')
    expect(repo.accepts[0].next_attempt_at).not.toBeNull()
    expect(workflowTrigger.trigger).not.toHaveBeenCalled()
  })

  it('maps ERRORED to failed with a safe error code and makes the checkpoint sweep-eligible', async function run() {
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({ job: createRecordingJob() }),
    })

    const result = await service.handleWebhook({
      rawBody: buildBody('ERRORED'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(200)
    expect(result.outcome).toBe('acknowledged')
    expect(repo.accepts[0].mapped_status).toBe('failed')
    expect(repo.accepts[0].last_error_code).toBe('provider_upload_failed')
    expect(repo.accepts[0].next_attempt_at).not.toBeNull()
  })

  it('treats duplicate event UUIDs as idempotent no-ops', async function run() {
    const workflowTrigger = { trigger: vi.fn(async () => undefined) }
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({
        job: createRecordingJob(),
        eventsByEventId: new Map([
          [
            EVENT_UUID,
            { status: 'processed', received_at: '2026-08-17T11:00:00.000Z' },
          ],
        ]),
      }),
      workflowTrigger,
    })

    const result = await service.handleWebhook({
      rawBody: buildBody('UPLOADED'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(200)
    expect(result.outcome).toBe('duplicate')
    expect(repo.accepts).toHaveLength(1)
    expect(repo.accepts[0].mapped_status).toBe('processed')
    expect(workflowTrigger.trigger).not.toHaveBeenCalled()
  })

  it('treats out-of-order state regression as an idempotent stale no-op', async function run() {
    const workflowTrigger = { trigger: vi.fn(async () => undefined) }
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({
        job: createRecordingJob(),
        eventsByRecordingId: new Map([
          [
            RECORDING_ID,
            [
              {
                provider_event_id: 'older-event',
                status: 'processed',
                received_at: '2026-08-17T11:00:00.000Z',
              },
            ],
          ],
        ]),
      }),
      workflowTrigger,
    })

    const result = await service.handleWebhook({
      rawBody: buildBody('RECORDING'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(200)
    expect(result.outcome).toBe('stale')
    expect(repo.accepts).toHaveLength(1)
    expect(workflowTrigger.trigger).not.toHaveBeenCalled()
  })

  it('acknowledges unknown recording IDs without side effects', async function run() {
    const workflowTrigger = { trigger: vi.fn(async () => undefined) }
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({ job: null }),
      workflowTrigger,
    })

    const result = await service.handleWebhook({
      rawBody: buildBody('UPLOADED'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(200)
    expect(result.outcome).toBe('unknown_recording')
    expect(workflowTrigger.trigger).not.toHaveBeenCalled()
  })

  it('acknowledges validly signed unsupported event types without side effects', async function run() {
    const workflowTrigger = { trigger: vi.fn(async () => undefined) }
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({ job: createRecordingJob() }),
      workflowTrigger,
    })

    const result = await service.handleWebhook({
      rawBody: buildBody('RECORDING', 'meeting.created'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(200)
    expect(result.outcome).toBe('unsupported_type')
    expect(repo.accepts).toHaveLength(0)
    expect(workflowTrigger.trigger).not.toHaveBeenCalled()
  })

  it('rejects an invalid signature with 400 before parsing the body', async function run() {
    const workflowTrigger = { trigger: vi.fn(async () => undefined) }
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({ job: createRecordingJob() }),
      signatureResult: false,
      workflowTrigger,
    })

    const result = await service.handleWebhook({
      rawBody: buildBody('UPLOADED'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(400)
    expect(result.outcome).toBe('invalid_signature')
    expect(repo.accepts).toHaveLength(0)
    expect(workflowTrigger.trigger).not.toHaveBeenCalled()
  })

  it('rejects a malformed body with 400', async function run() {
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({ job: createRecordingJob() }),
    })

    const result = await service.handleWebhook({
      rawBody: encodeText('not-json'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(400)
    expect(result.outcome).toBe('invalid_payload')
    expect(repo.accepts).toHaveLength(0)
  })

  it('rejects requests missing the signature or event uuid headers', async function run() {
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({ job: createRecordingJob() }),
    })

    const missingSignature = await service.handleWebhook({
      rawBody: buildBody('UPLOADED'),
      signatureBase64: undefined,
      eventUuid: EVENT_UUID,
    })
    expect(missingSignature.httpStatus).toBe(400)
    expect(missingSignature.outcome).toBe('invalid_signature')

    const missingUuid = await service.handleWebhook({
      rawBody: buildBody('UPLOADED'),
      signatureBase64: 'c2ln',
      eventUuid: undefined,
    })
    expect(missingUuid.httpStatus).toBe(400)
    expect(missingUuid.outcome).toBe('invalid_signature')

    expect(repo.accepts).toHaveLength(0)
  })

  it('never downloads media or queries the provider during webhook handling', async function run() {
    const workflowTrigger = { trigger: vi.fn(async () => undefined) }
    const { service, repo } = createService({
      repository: createInMemoryWebhookRepository({ job: createRecordingJob() }),
      workflowTrigger,
    })

    const result = await service.handleWebhook({
      rawBody: buildBody('UPLOADED'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(200)
    // The only side effect is one accepted webhook event persisted plus the
    // workflow trigger; no recording client or download code is involved.
    expect(repo.accepts).toHaveLength(1)
    expect(workflowTrigger.trigger).toHaveBeenCalledTimes(1)
  })

  it('acknowledges persisted events even when the workflow trigger fails', async function run() {
    const workflowTrigger = {
      trigger: vi.fn(async () => {
        throw new Error('workflow unavailable')
      }),
    }
    const { service, repo, logger } = createService({
      repository: createInMemoryWebhookRepository({ job: createRecordingJob() }),
      workflowTrigger,
    })

    const result = await service.handleWebhook({
      rawBody: buildBody('UPLOADED'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(200)
    expect(result.outcome).toBe('processed')
    expect(repo.accepts).toHaveLength(1)
    // Even though the trigger failed, the persisted event keeps its scheduled
    // retry checkpoint so the sweep can pick it up and trigger the workflow.
    expect(repo.accepts[0].next_attempt_at).not.toBeNull()
    expect(logger.warn).toHaveBeenCalled()
  })
})

describe('RealtimeKitWebhookService sweep integration', function sweepIntegrationSuite() {
  const LATER_NOW = '2026-08-17T12:06:00.000Z'

  it('keeps a processed UPLOADED event sweep-eligible after createBatch fails and retries it via the sweep', async function run() {
    const fake = createWebhookSweepExecutor({ job: createRecordingJob() })
    const webhookRepository = new RealtimeKitWebhookRepository(fake.executor)
    const finalizationRepository = new RecordingFinalizationRepository(fake.executor)

    let createBatchFailures = 1
    const workflow = {
      createBatch: vi.fn(async () => {
        if (createBatchFailures > 0) {
          createBatchFailures -= 1
          throw new Error('workflow engine unavailable')
        }
        return []
      }),
    }
    const workflowTrigger = createRealtimeKitWorkflowTriggerPort(workflow)
    const service = new RealtimeKitWebhookService(
      webhookRepository,
      createSignatureVerifier(true),
      workflowTrigger,
      createNoopLogger(),
      { sweepDelayMs: 5 * 60 * 1000 },
    )

    const result = await service.handleWebhook({
      rawBody: buildBody('UPLOADED'),
      signatureBase64: 'c2ln',
      eventUuid: EVENT_UUID,
      now: '2026-08-17T12:00:00.000Z',
    })

    expect(result.httpStatus).toBe(200)
    expect(result.outcome).toBe('processed')
    // The initial createBatch (attempt 0) failed and was swallowed by the
    // service, but the event must still be sweep-eligible.
    expect(workflow.createBatch).toHaveBeenCalledTimes(1)
    expect(fake.events).toHaveLength(1)
    expect(fake.events[0].next_attempt_at).toBe('2026-08-17T12:05:00.000Z')

    // The scheduled sweep selects the recording for retry.
    const candidates = await finalizationRepository.listSweepCandidates(10, LATER_NOW)

    expect(candidates).toEqual([
      {
        provider_event_id: EVENT_UUID,
        recording_id: RECORDING_ID,
        attempt_count: 0,
      },
    ])

    // Sweep behavior: trigger the finalization workflow with the next attempt
    // and advance the checkpoint, exactly as the notification orchestrator does.
    const nextAttemptAt = '2026-08-17T12:11:00.000Z'
    const [candidate] = candidates
    await workflowTrigger.trigger(candidate.recording_id!, candidate.attempt_count + 1)
    await finalizationRepository.updateSweepCheckpoint(
      candidate.provider_event_id,
      candidate.attempt_count + 1,
      nextAttemptAt,
      null,
    )

    expect(workflow.createBatch).toHaveBeenLastCalledWith([
      {
        id: buildRecordingFinalizationInstanceId(RECORDING_ID, 1),
        params: { provider_recording_id: RECORDING_ID, attempt: 1 },
      },
    ])

    // Once the workflow finalizes the recording, markEventProcessed removes the
    // event from the sweep entirely.
    await finalizationRepository.markEventProcessed(RECORDING_ID, LATER_NOW)

    const afterProcessing = await finalizationRepository.listSweepCandidates(10, LATER_NOW)
    expect(afterProcessing).toEqual([])
  })
})

function normalizeSql(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function createWebhookSweepExecutor(initial: { job: ReturnType<typeof createRecordingJob> | null }): {
  executor: SqlQueryExecutor
  events: Array<{
    provider_event_id: string
    recording_id: string
    status: string
    attempt_count: number
    next_attempt_at: string | null
    received_at: string
    processed_at: string | null
    last_error_code: string | null
  }>
} {
  let job = initial.job
  const events: Array<{
    provider_event_id: string
    recording_id: string
    status: string
    attempt_count: number
    next_attempt_at: string | null
    received_at: string
    processed_at: string | null
    last_error_code: string | null
  }> = []

  const executor: SqlQueryExecutor = {
    async query<Row>(queryInput: { text: string; values: readonly unknown[] }) {
      const sql = normalizeSql(queryInput.text)
      const values = [...queryInput.values]

      if (sql === 'BEGIN;' || sql === 'COMMIT;' || sql === 'ROLLBACK;') {
        return { rows: [] as Row[] }
      }

      if (sql.includes('FROM interview_recordings') && sql.includes('JOIN interviews')) {
        if (!job) {
          return { rows: [] as Row[] }
        }
        return {
          rows: [
            {
              id: job.id,
              interview_id: job.interview_id,
              provider_recording_id: job.provider_recording_id,
              recording_type: job.recording_type,
              participant_id: job.participant_id,
              participant_role: job.participant_role,
              provider_status: job.provider_status,
              finalization_status: job.finalization_status,
              mode: 'ai_led',
              scheduler_id: '33333333-3333-4333-8333-333333333333',
              interviewer_id: null,
              recording_status: 'processing',
            },
          ] as Row[],
          rowCount: 1,
        }
      }

      if (sql.includes('FROM interview_recordings') && sql.includes('provider_recording_id')) {
        return {
          rows: job ? ([job] as Row[]) : ([] as Row[]),
          rowCount: job ? 1 : 0,
        }
      }

      if (
        sql.includes('FROM realtimekit_webhook_events') &&
        sql.includes('ORDER BY next_attempt_at')
      ) {
        const now = values[0] as string
        const limit = values[1] as number
        return {
          rows: events
            .filter(
              (event) =>
                event.processed_at === null &&
                event.next_attempt_at !== null &&
                event.next_attempt_at <= now,
            )
            .sort(function byNextAttempt(eventA, eventB) {
              if (eventA.next_attempt_at! < eventB.next_attempt_at!) return -1
              if (eventA.next_attempt_at! > eventB.next_attempt_at!) return 1
              if (eventA.provider_event_id < eventB.provider_event_id) return -1
              if (eventA.provider_event_id > eventB.provider_event_id) return 1
              return 0
            })
            .slice(0, limit)
            .map(function toCandidate(event) {
              return {
                provider_event_id: event.provider_event_id,
                recording_id: event.recording_id,
                attempt_count: event.attempt_count,
              }
            }) as Row[],
        }
      }

      if (
        sql.includes('FROM realtimekit_webhook_events') &&
        sql.includes('provider_event_id = $1') &&
        !sql.includes('ORDER BY')
      ) {
        const existing = events.find((event) => event.provider_event_id === values[0])
        return { rows: existing ? ([existing] as Row[]) : ([] as Row[]) }
      }

      if (
        sql.includes('FROM realtimekit_webhook_events') &&
        sql.includes('ORDER BY received_at DESC')
      ) {
        const latest = events.find(
          (event) =>
            event.recording_id === values[0] && event.provider_event_id !== values[1],
        )
        return { rows: latest ? ([latest] as Row[]) : ([] as Row[]) }
      }

      if (sql.includes('INSERT INTO realtimekit_webhook_events')) {
        events.push({
          provider_event_id: values[0] as string,
          recording_id: values[2] as string,
          status: values[4] as string,
          attempt_count: 0,
          next_attempt_at: (values[5] as string | null) ?? null,
          received_at: values[6] as string,
          processed_at: null,
          last_error_code: (values[7] as string | null) ?? null,
        })
        return { rows: [] as Row[] }
      }

      if (sql.includes('UPDATE interview_recordings') && sql.includes('provider_status')) {
        if (job) {
          job = {
            ...job,
            provider_status: values[1] as string,
          }
        }
        return {
          rows: job ? ([{ id: job.id }] as Row[]) : ([] as Row[]),
          rowCount: job ? 1 : 0,
        }
      }

      if (sql.includes('UPDATE realtimekit_webhook_events') && sql.includes("status = 'processed'")) {
        for (const event of events) {
          if (event.recording_id === values[0] && event.processed_at === null) {
            event.status = 'processed'
            event.processed_at = values[1] as string
            event.next_attempt_at = null
            event.last_error_code = null
          }
        }
        return { rows: [] as Row[] }
      }

      if (sql.includes('UPDATE realtimekit_webhook_events') && sql.includes("status = 'failed'")) {
        for (const event of events) {
          if (event.recording_id === values[0] && event.processed_at === null) {
            event.status = 'failed'
            event.last_error_code = values[1] as string
            event.next_attempt_at = values[2] as string
          }
        }
        return { rows: [] as Row[] }
      }

      if (
        sql.includes('UPDATE realtimekit_webhook_events') &&
        sql.includes('next_attempt_at = $2')
      ) {
        for (const event of events) {
          if (event.recording_id === values[0] && event.processed_at === null) {
            event.next_attempt_at = values[1] as string
          }
        }
        return { rows: [] as Row[] }
      }

      if (sql.includes('UPDATE realtimekit_webhook_events') && sql.includes('attempt_count = $2')) {
        for (const event of events) {
          if (event.provider_event_id === values[0]) {
            event.attempt_count = values[1] as number
            event.next_attempt_at = (values[2] as string | null) ?? null
            event.processed_at = (values[3] as string | null) ?? null
          }
        }
        return { rows: [] as Row[] }
      }

      throw new Error(`Unexpected SQL in webhook-sweep fake executor: ${sql}`)
    },
  }

  return { executor, events }
}
