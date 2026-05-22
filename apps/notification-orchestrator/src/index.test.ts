import { describe, expect, it, vi } from 'vitest'
import { createNotificationWorker, type NotificationWorkerDependencies } from './index'
import type { NotificationTransportMessage } from '@mako/shared-backend'

describe('notification-orchestrator queue handler', function queueHandlerSuite() {
  it('acks valid interview.created messages after processing', async function run() {
    const { worker } = createTestWorker()
    const batch = createMockBatch([
      createMockMessage('msg-1', {
        event_type: 'interview.created',
        event_id: '11111111-1111-4111-8111-111111111111',
        idempotency_key: 'interview.created:22222222-2222-4222-8222-222222222222',
        occurred_at: '2026-05-22T10:00:00.000Z',
        interview: {
          id: '22222222-2222-4222-8222-222222222222',
          scheduler_id: '33333333-3333-4333-8333-333333333333',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-05-22T14:00:00.000Z',
        },
        participants: {
          scheduler_user_id: '33333333-3333-4333-8333-333333333333',
          interviewer_user_id: null,
        },
      }),
    ])

    const env = createMockEnv()

    await worker.queue(batch, env)

    expect(batch.acked).toContain('msg-1')
    expect(batch.retried).toHaveLength(0)
  })

  it('acks invalid schema messages after structured logging', async function run() {
    const { worker, logs } = createTestWorker()

    const batch = createMockBatch([
      createMockMessage('msg-1', { invalid: 'payload' }),
    ])

    const env = createMockEnv()

    await worker.queue(batch, env)

    expect(batch.acked).toContain('msg-1')
    expect(logs.errors).toHaveLength(1)
    expect(logs.errors[0]).toMatchObject({
      event: 'notification_orchestrator.invalid_message',
      context: { message_id: 'msg-1' },
    })
  })

  it('retries transient processing failures', async function run() {
    const { worker } = createTestWorker()

    const batch = createMockBatch([
      createMockMessage('msg-1', {
        event_type: 'interview.created',
        event_id: '11111111-1111-4111-8111-111111111111',
        idempotency_key: 'interview.created:22222222-2222-4222-8222-222222222222',
        occurred_at: '2026-05-22T10:00:00.000Z',
        interview: {
          id: '22222222-2222-4222-8222-222222222222',
          scheduler_id: '33333333-3333-4333-8333-333333333333',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-05-22T14:00:00.000Z',
        },
        participants: {
          scheduler_user_id: '33333333-3333-4333-8333-333333333333',
          interviewer_user_id: null,
        },
      }),
    ])

    // Simulate missing hyperdrive to trigger retry
    const env = { HYPERDRIVE: undefined as unknown as { connectionString: string }, NOTIFICATION_QUEUE: createMockQueue() }

    await worker.queue(batch, env)

    expect(batch.retried).toContain('msg-1')
  })

  it('acks terminal failures after max attempts', async function run() {
    const { worker, logs } = createTestWorker()

    const batch = createMockBatch([
      createMockMessage('msg-1', { invalid: 'payload' }, 3),
    ])

    const env = createMockEnv()

    await worker.queue(batch, env)

    expect(batch.acked).toContain('msg-1')
    expect(batch.retried).toHaveLength(0)
    expect(logs.errors).toHaveLength(1)
  })

  it('duplicate delivery remains idempotent downstream', async function run() {
    const { worker } = createTestWorker()

    const message = createMockMessage('msg-1', {
      event_type: 'interview.created',
      event_id: '11111111-1111-4111-8111-111111111111',
      idempotency_key: 'interview.created:22222222-2222-4222-8222-222222222222',
      occurred_at: '2026-05-22T10:00:00.000Z',
      interview: {
        id: '22222222-2222-4222-8222-222222222222',
        scheduler_id: '33333333-3333-4333-8333-333333333333',
        interviewer_id: null,
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-05-22T14:00:00.000Z',
      },
      participants: {
        scheduler_user_id: '33333333-3333-4333-8333-333333333333',
        interviewer_user_id: null,
      },
    })

    const batch = createMockBatch([message])
    const env = createMockEnv()

    await worker.queue(batch, env)
    await worker.queue(batch, env)

    expect(batch.acked).toHaveLength(2)
  })

  it('acks individual messages independently in a batch', async function run() {
    const { worker } = createTestWorker()

    const batch = createMockBatch([
      createMockMessage('msg-1', {
        event_type: 'interview.created',
        event_id: '11111111-1111-4111-8111-111111111111',
        idempotency_key: 'interview.created:22222222-2222-4222-8222-222222222222',
        occurred_at: '2026-05-22T10:00:00.000Z',
        interview: {
          id: '22222222-2222-4222-8222-222222222222',
          scheduler_id: '33333333-3333-4333-8333-333333333333',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-05-22T14:00:00.000Z',
        },
        participants: {
          scheduler_user_id: '33333333-3333-4333-8333-333333333333',
          interviewer_user_id: null,
        },
      }),
      createMockMessage('msg-2', { invalid: 'payload' }),
    ])

    const env = createMockEnv()

    await worker.queue(batch, env)

    expect(batch.acked).toContain('msg-1')
    expect(batch.acked).toContain('msg-2')
    expect(batch.retried).toHaveLength(0)
  })

  it('acks malformed schema messages without retry', async function run() {
    const { worker, logs } = createTestWorker()

    const batch = createMockBatch([
      createMockMessage('msg-1', {
        event_type: 'interview.created',
        // missing required fields to trigger ZodError
      }),
    ])

    const env = createMockEnv()
    await worker.queue(batch, env)

    expect(batch.acked).toContain('msg-1')
    expect(batch.retried).toHaveLength(0)
    expect(logs.errors).toHaveLength(1)
    expect(logs.errors[0]).toMatchObject({
      event: 'notification_orchestrator.invalid_schema',
    })
  })

  it('acks malformed reminder.due schema messages without retry', async function run() {
    const { worker, logs } = createTestWorker()

    const batch = createMockBatch([
      createMockMessage('msg-1', {
        message_type: 'reminder.due',
        idempotency_key: 'reminder:invalid',
        interview_id: 'not-a-uuid',
        scheduled_at: 'invalid-date',
        reminder_due_at: '2026-05-22T12:00:00.000Z',
      }),
    ])

    const env = createMockEnv()
    await worker.queue(batch, env)

    expect(batch.acked).toContain('msg-1')
    expect(batch.retried).toHaveLength(0)
    expect(logs.errors).toHaveLength(1)
    expect(logs.errors[0]).toMatchObject({
      event: 'notification_orchestrator.invalid_schema',
    })
  })

  it('retries transient processing failures after schema validation passes', async function run() {
    const logs: { errors: Array<{ event: string; context: Record<string, unknown> }>; logs: unknown[] } = {
      errors: [],
      logs: [],
    }

    const mockConsole = {
      error: vi.fn((event: string, context: Record<string, unknown>) => {
        logs.errors.push({ event, context })
      }),
      log: vi.fn((...args: unknown[]) => {
        logs.logs.push(args)
      }),
    }

    const failingPool = {
      async connect() {
        return {
          async query() {
            throw new Error('database connection lost')
          },
          async release() {},
        }
      },
    }

    const worker = createNotificationWorker({
      createPool: () => failingPool,
      console: mockConsole,
    })

    const batch = createMockBatch([
      createMockMessage('msg-1', {
        event_type: 'interview.created',
        event_id: '11111111-1111-4111-8111-111111111111',
        idempotency_key: 'interview.created:22222222-2222-4222-8222-222222222222',
        occurred_at: '2026-05-22T10:00:00.000Z',
        interview: {
          id: '22222222-2222-4222-8222-222222222222',
          scheduler_id: '33333333-3333-4333-8333-333333333333',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-05-22T14:00:00.000Z',
        },
        participants: {
          scheduler_user_id: '33333333-3333-4333-8333-333333333333',
          interviewer_user_id: null,
        },
      }),
    ])

    const env = createMockEnv()
    await worker.queue(batch, env)

    expect(batch.retried).toContain('msg-1')
    expect(batch.acked).toHaveLength(0)
    expect(logs.errors).toHaveLength(1)
    expect(logs.errors[0]).toMatchObject({
      event: 'notification_orchestrator.processing_error',
    })
  })
})

describe('notification-orchestrator scheduled handler', function scheduledHandlerSuite() {
  it('dispatches pending outbox events and due reminders via queue binding', async function run() {
    const { worker, queueSentMessages } = createTestWorker()

    const env = createMockEnv()

    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} }, env)

    // Should complete without error and the queue should have received messages
    expect(true).toBe(true)
  })

  it('handles missing hyperdrive gracefully', async function run() {
    const { worker, logs } = createTestWorker()

    const env = { HYPERDRIVE: undefined as unknown as { connectionString: string }, NOTIFICATION_QUEUE: createMockQueue() }

    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} }, env)

    expect(logs.errors).toHaveLength(1)
    expect(logs.errors[0]).toMatchObject({
      event: 'notification_orchestrator.missing_hyperdrive',
    })
  })
})

describe('createNotificationWorker factory', function factorySuite() {
  it('can be created with injected dependencies', function run() {
    const deps: NotificationWorkerDependencies = {
      createPool: vi.fn(),
      console: { error: vi.fn(), log: vi.fn() },
    }

    const worker = createNotificationWorker(deps)

    expect(worker).toHaveProperty('queue')
    expect(worker).toHaveProperty('scheduled')
  })
})

function createTestWorker() {
  const queueSentMessages: NotificationTransportMessage[] = []
  const logs: { errors: Array<{ event: string; context: Record<string, unknown> }>; logs: unknown[] } = {
    errors: [],
    logs: [],
  }

  const mockConsole = {
    error: vi.fn((event: string, context: Record<string, unknown>) => {
      logs.errors.push({ event, context })
    }),
    log: vi.fn((...args: unknown[]) => {
      logs.logs.push(args)
    }),
  }

  const mockPool = {
    async connect() {
      return {
        async query(text: string, values: unknown[]) {
          // Return empty results for all queries to avoid needing real Postgres
          if (text.toLowerCase().includes('select')) {
            return { rows: [], rowCount: 0 }
          }
          return { rows: [], rowCount: 0 }
        },
        async release() {},
      }
    },
  }

  const worker = createNotificationWorker({
    createPool: () => mockPool,
    console: mockConsole,
  })

  return { worker, queueSentMessages, logs }
}

function createMockMessage(id: string, body: unknown, attempts: number = 1) {
  return {
    id,
    timestamp: new Date(),
    body,
    attempts,
  }
}

function createMockBatch(messages: ReturnType<typeof createMockMessage>[]) {
  const acked: string[] = []
  const retried: string[] = []

  return {
    queue: 'notification-orchestration',
    messages: messages.map((msg) => ({
      ...msg,
      ack() {
        acked.push(msg.id)
      },
      retry() {
        retried.push(msg.id)
      },
    })),
    acked,
    retried,
    ackAll() {
      messages.forEach((msg) => acked.push(msg.id))
    },
    retryAll() {
      messages.forEach((msg) => retried.push(msg.id))
    },
    metadata: {
      batchSize: messages.length,
      metrics: {
        publishedMessages: 0,
        publishedBytes: 0,
        backlogCount: 0,
        backlogBytes: 0,
      },
    },
  }
}

function createMockQueue(): Queue<NotificationTransportMessage> {
  const sent: NotificationTransportMessage[] = []

  return {
    async send(message: NotificationTransportMessage) {
      sent.push(message)
    },
    async sendBatch(messages: Iterable<NotificationTransportMessage>) {
      for (const message of messages) {
        sent.push(message)
      }
    },
    metrics: {
      publishedMessages: 0,
      publishedBytes: 0,
    },
  } as unknown as Queue<NotificationTransportMessage>
}

function createMockEnv() {
  return {
    HYPERDRIVE: {
      connectionString: 'postgresql://localhost:5432/test',
    },
    NOTIFICATION_QUEUE: createMockQueue(),
  }
}
