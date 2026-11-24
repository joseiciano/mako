import { describe, expect, it, vi } from 'vitest'
import { createNotificationWorker, type NotificationWorkerDependencies } from './index'
import type { NotificationTransportMessage } from '@mako/shared-backend'
import type { FeedbackWorkflowPayload } from './workflows/feedback-workflow'

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

  it('acks valid interview.premium_booked messages after processing', async function run() {
    const { worker } = createTestWorker()
    const batch = createMockBatch([
      createMockMessage('msg-1', {
        event_type: 'interview.premium_booked',
        event_id: '11111111-1111-4111-8111-111111111111',
        idempotency_key: 'premium-booking:22222222-2222-4222-8222-222222222222',
        occurred_at: '2026-05-22T10:00:00.000Z',
        interview: {
          id: '22222222-2222-4222-8222-222222222222',
          scheduler_id: '33333333-3333-4333-8333-333333333333',
          interviewer_id: '44444444-4444-4444-8444-444444444444',
          type: 'behavioral',
          mode: 'peer_to_peer',
          booking_channel: 'verified_interviewer',
          tier: 'premium',
          status: 'scheduled',
          scheduled_at: '2026-05-22T14:00:00.000Z',
        },
        participants: {
          scheduler_user_id: '33333333-3333-4333-8333-333333333333',
          interviewer_user_id: '44444444-4444-4444-8444-444444444444',
        },
      }),
    ])

    const env = createMockEnv()

    await worker.queue(batch, env)

    expect(batch.acked).toContain('msg-1')
    expect(batch.retried).toHaveLength(0)
  })

  it('acks legacy interview.created messages that omit booking_channel by deriving it from mode', async function run() {
    const { worker, logs } = createTestWorker()

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
      createMockMessage('msg-2', {
        event_type: 'interview.match.created',
        event_id: '22222222-2222-4222-8222-222222222222',
        idempotency_key: 'interview.match.created:44444444-4444-4444-8444-444444444444',
        occurred_at: '2026-05-22T10:00:00.000Z',
        interview: {
          id: '44444444-4444-4444-8444-444444444444',
          scheduler_id: '55555555-5555-4555-8555-555555555555',
          interviewer_id: '66666666-6666-4666-8666-666666666666',
          type: 'behavioral',
          mode: 'peer_to_peer',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-05-22T14:00:00.000Z',
        },
        participants: {
          scheduler_user_id: '55555555-5555-4555-8555-555555555555',
          interviewer_user_id: '66666666-6666-4666-8666-666666666666',
        },
      }),
    ])

    const env = createMockEnv()

    await worker.queue(batch, env)

    expect(batch.acked).toContain('msg-1')
    expect(batch.acked).toContain('msg-2')
    expect(batch.retried).toHaveLength(0)
    expect(logs.errors).toHaveLength(0)
  })

  it('acks invalid schema messages after structured logging with redacted metadata', async function run() {
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
    expect(logs.errors[0].context).not.toHaveProperty('body')
    expect(logs.errors[0].context).toHaveProperty('payload_type')
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

  it('retries transient failures at max attempts so queue DLQ policy can handle terminal routing', async function run() {
    const { worker } = createTestWorker()

    const batch = createMockBatch([
      createMockMessage(
        'msg-1',
        {
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
        },
        3,
      ),
    ])

    const env = {
      HYPERDRIVE: undefined as unknown as { connectionString: string },
      NOTIFICATION_QUEUE: createMockQueue(),
    }

    await worker.queue(batch, env)

    expect(batch.retried).toContain('msg-1')
    expect(batch.acked).toHaveLength(0)
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

  it('acks malformed schema messages without retry and logs sanitized metadata', async function run() {
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
      context: { message_id: 'msg-1', event_type: 'interview.created' },
    })
    expect(logs.errors[0].context).not.toHaveProperty('body')
    expect(logs.errors[0].context).toHaveProperty('error_message')
    expect(logs.errors[0].context).toHaveProperty('validation_issues')
    expect(Array.isArray(logs.errors[0].context.validation_issues)).toBe(true)
    expect((logs.errors[0].context.validation_issues as Array<unknown>).length).toBeGreaterThan(0)
  })

  it('acks malformed reminder.due schema messages without retry and logs sanitized metadata', async function run() {
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
      context: { message_id: 'msg-1', message_type: 'reminder.due' },
    })
    expect(logs.errors[0].context).not.toHaveProperty('body')
    expect(logs.errors[0].context).toHaveProperty('error_message')
    expect(logs.errors[0].context).toHaveProperty('validation_issues')
    expect(Array.isArray(logs.errors[0].context.validation_issues)).toBe(true)
    expect((logs.errors[0].context.validation_issues as Array<unknown>).length).toBeGreaterThan(0)
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
      async end() {},
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


  describe('interview.completed feedback workflow triggering', function completedSuite() {
    const completedEventBody = {
      event_type: 'interview.completed',
      event_id: '11111111-1111-4111-8111-111111111111',
      idempotency_key: 'interview.completed:22222222-2222-4222-8222-222222222222',
      occurred_at: '2026-05-22T10:00:00.000Z',
      interview: {
        id: '22222222-2222-4222-8222-222222222222',
        scheduler_id: '33333333-3333-4333-8333-333333333333',
        interviewer_id: null,
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'completed',
        scheduled_at: '2026-05-22T14:00:00.000Z',
      },
      participants: {
        scheduler_user_id: '33333333-3333-4333-8333-333333333333',
        interviewer_user_id: null,
      },
    }

    it('triggers feedback workflow on interview.completed event', async function run() {
      const { worker, logs } = createTestWorker()
      const feedbackWorkflow = createMockFeedbackWorkflow()

      const batch = createMockBatch([
        createMockMessage('msg-1', completedEventBody),
      ])

      const env = createMockEnvWithFeedback(feedbackWorkflow)

      await worker.queue(batch, env)

      expect(batch.acked).toContain('msg-1')
      expect(batch.retried).toHaveLength(0)

      const expectedInstanceId = `feedback-v1-${completedEventBody.interview.id}`
      expect(feedbackWorkflow.createBatch).toHaveBeenCalledTimes(1)
      expect(feedbackWorkflow.createBatch).toHaveBeenCalledWith([
        {
          id: expectedInstanceId,
          params: {
            interview_id: completedEventBody.interview.id,
            schema_version: 1,
          },
        },
      ])

      const triggerLog = logs.logs.find(
        (call): call is unknown[] =>
          Array.isArray(call) && call[0] === '[notification-consumer] feedback_workflow_triggered',
      )
      expect(triggerLog).toBeDefined()
      expect(triggerLog![1]).toMatchObject({
        interview_id: completedEventBody.interview.id,
        instance_id: expectedInstanceId,
      })
    })

    it('logs when feedback workflow is not configured on interview.completed', async function run() {
      const { worker, logs } = createTestWorker()

      const batch = createMockBatch([
        createMockMessage('msg-1', completedEventBody),
      ])

      const env = createMockEnv()

      await worker.queue(batch, env)

      expect(batch.acked).toContain('msg-1')
      expect(batch.retried).toHaveLength(0)

      const notConfiguredLog = logs.logs.find(
        (call): call is unknown[] =>
          Array.isArray(call) && call[0] === '[notification-consumer] feedback_workflow_not_configured',
      )
      expect(notConfiguredLog).toBeDefined()
      expect(notConfiguredLog![1]).toMatchObject({
        interview_id: completedEventBody.interview.id,
      })
    })

    it('stops provider recordings before triggering the feedback workflow', async function run() {
      const order: string[] = []
      const recordingStop = {
        processStopHandoff: vi.fn(async () => {
          order.push('stop')
          return 'processed' as const
        }),
        sweepStopHandoffs: vi.fn(async () => [] as string[]),
        sweepOverdueRecordings: vi.fn(async () => 0),
      }
      const { worker } = createTestWorker({ recordingStop })
      const feedbackWorkflow = createMockFeedbackWorkflow()
      vi.mocked(feedbackWorkflow.createBatch).mockImplementation((async () => {
        order.push('feedback')
        return []
      }) as never)
      const batch = createMockBatch([createMockMessage('msg-1', completedEventBody)])

      await worker.queue(batch, createMockEnvWithFeedback(feedbackWorkflow))

      expect(recordingStop.processStopHandoff).toHaveBeenCalledWith(completedEventBody.interview.id)
      expect(order).toEqual(['stop', 'feedback'])
      expect(batch.acked).toContain('msg-1')
    })

    it('retries the message and skips feedback handoff while recording stop is pending', async function run() {
      const recordingStop = {
        processStopHandoff: vi.fn(async () => 'retry' as const),
        sweepStopHandoffs: vi.fn(async () => [] as string[]),
        sweepOverdueRecordings: vi.fn(async () => 0),
      }
      const { worker } = createTestWorker({ recordingStop })
      const feedbackWorkflow = createMockFeedbackWorkflow()
      const batch = createMockBatch([createMockMessage('msg-1', completedEventBody)])

      await worker.queue(batch, createMockEnvWithFeedback(feedbackWorkflow))

      expect(batch.retried).toContain('msg-1')
      expect(batch.acked).toHaveLength(0)
      expect(feedbackWorkflow.createBatch).not.toHaveBeenCalled()
    })

    it('triggers feedback after the queue retries are exhausted even if the provider stop still fails', async function run() {
      const recordingStop = {
        processStopHandoff: vi.fn(async () => 'retry' as const),
        sweepStopHandoffs: vi.fn(async () => [] as string[]),
        sweepOverdueRecordings: vi.fn(async () => 0),
      }
      const { worker } = createTestWorker({ recordingStop })
      const feedbackWorkflow = createMockFeedbackWorkflow()
      const batch = createMockBatch([createMockMessage('msg-1', completedEventBody, 3)])

      await worker.queue(batch, createMockEnvWithFeedback(feedbackWorkflow))

      expect(batch.acked).toContain('msg-1')
      expect(feedbackWorkflow.createBatch).toHaveBeenCalledTimes(1)
    })

    it('triggers feedback even when the stop processor throws on the final attempt', async function run() {
      const recordingStop = {
        processStopHandoff: vi.fn(async () => {
          throw new Error('db down')
        }),
        sweepStopHandoffs: vi.fn(async () => [] as string[]),
        sweepOverdueRecordings: vi.fn(async () => 0),
      }
      const { worker } = createTestWorker({ recordingStop })
      const feedbackWorkflow = createMockFeedbackWorkflow()
      const batch = createMockBatch([createMockMessage('msg-1', completedEventBody, 3)])

      await worker.queue(batch, createMockEnvWithFeedback(feedbackWorkflow))

      expect(batch.acked).toContain('msg-1')
      expect(feedbackWorkflow.createBatch).toHaveBeenCalledTimes(1)
    })

    it('sends one delayed feedback_deadline message on the first attempt, before any retry throw', async function run() {
      const sent: Array<{ message: unknown; options: unknown }> = []
      const recordingStop = {
        processStopHandoff: vi.fn(async () => 'retry' as const),
        sweepStopHandoffs: vi.fn(async () => [] as string[]),
        sweepOverdueRecordings: vi.fn(async () => 0),
      }
      const { worker } = createTestWorker({ recordingStop })
      const batch = createMockBatch([createMockMessage('msg-1', completedEventBody, 1)])
      const env = {
        ...createMockEnvWithFeedback(createMockFeedbackWorkflow()),
        NOTIFICATION_QUEUE: {
          async send(message: unknown, options: unknown) {
            sent.push({ message, options })
          },
        } as unknown as Queue<NotificationTransportMessage>,
      }

      await worker.queue(batch, env)

      expect(batch.retried).toContain('msg-1')
      expect(sent).toHaveLength(1)
      expect(sent[0]!.message).toMatchObject({
        message_type: 'work.due',
        duty: 'feedback_deadline',
        entity_id: completedEventBody.interview.id,
      })
      expect(sent[0]!.options).toEqual({ delaySeconds: 15 * 60 })
    })

    it('does not send a feedback_deadline message on later attempts', async function run() {
      const sent: unknown[] = []
      const recordingStop = {
        processStopHandoff: vi.fn(async () => 'processed' as const),
        sweepStopHandoffs: vi.fn(async () => [] as string[]),
        sweepOverdueRecordings: vi.fn(async () => 0),
      }
      const { worker } = createTestWorker({ recordingStop })
      const batch = createMockBatch([createMockMessage('msg-1', completedEventBody, 2)])
      const env = {
        ...createMockEnvWithFeedback(createMockFeedbackWorkflow()),
        NOTIFICATION_QUEUE: {
          async send(message: unknown) {
            sent.push(message)
          },
        } as unknown as Queue<NotificationTransportMessage>,
      }

      await worker.queue(batch, env)

      expect(sent).toHaveLength(0)
    })

    it('still processes the completed event when the deadline send fails', async function run() {
      const recordingStop = {
        processStopHandoff: vi.fn(async () => 'processed' as const),
        sweepStopHandoffs: vi.fn(async () => [] as string[]),
        sweepOverdueRecordings: vi.fn(async () => 0),
      }
      const { worker } = createTestWorker({ recordingStop })
      const feedbackWorkflow = createMockFeedbackWorkflow()
      const batch = createMockBatch([createMockMessage('msg-1', completedEventBody, 1)])
      const env = {
        ...createMockEnvWithFeedback(feedbackWorkflow),
        NOTIFICATION_QUEUE: {
          async send() {
            throw new Error('queue down')
          },
        } as unknown as Queue<NotificationTransportMessage>,
      }

      await worker.queue(batch, env)

      expect(batch.acked).toContain('msg-1')
      expect(feedbackWorkflow.createBatch).toHaveBeenCalledTimes(1)
    })

    it('interview.completed idempotency - duplicate events trigger same workflow instance', async function run() {
      const { worker } = createTestWorker()
      const feedbackWorkflow = createMockFeedbackWorkflow()

      const batch1 = createMockBatch([
        createMockMessage('msg-1', completedEventBody),
      ])
      const batch2 = createMockBatch([
        createMockMessage('msg-1', completedEventBody),
      ])

      const env = createMockEnvWithFeedback(feedbackWorkflow)

      await worker.queue(batch1, env)
      await worker.queue(batch2, env)

      expect(batch1.acked).toContain('msg-1')
      expect(batch2.acked).toContain('msg-1')
      expect(batch1.retried).toHaveLength(0)
      expect(batch2.retried).toHaveLength(0)

      const expectedInstanceId = `feedback-v1-${completedEventBody.interview.id}`
      const expectedCall = [
        {
          id: expectedInstanceId,
          params: {
            interview_id: completedEventBody.interview.id,
            schema_version: 1,
          },
        },
      ]

      expect(feedbackWorkflow.createBatch).toHaveBeenCalledTimes(2)
      expect(feedbackWorkflow.createBatch).toHaveBeenNthCalledWith(1, expectedCall)
      expect(feedbackWorkflow.createBatch).toHaveBeenNthCalledWith(2, expectedCall)
    })
  })
})

describe('notification-orchestrator scheduled handler', function scheduledHandlerSuite() {
  it('dispatches pending outbox events and due reminders via queue binding', async function run() {
    const pendingOutboxPayload: NotificationTransportMessage = {
      event_type: 'interview.match.created',
      event_id: '11111111-1111-4111-8111-111111111111',
      idempotency_key: 'interview.match.created:22222222-2222-4222-8222-222222222222',
      occurred_at: '2026-05-22T10:00:00.000Z',
      interview: {
        id: '22222222-2222-4222-8222-222222222222',
        scheduler_id: '66666666-6666-4666-8666-666666666666',
        interviewer_id: '33333333-3333-4333-8333-333333333333',
        type: 'behavioral',
        mode: 'peer_to_peer',
        booking_channel: 'standard_match',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-05-22T14:00:00.000Z',
      },
      participants: {
        scheduler_user_id: '66666666-6666-4666-8666-666666666666',
        interviewer_user_id: '33333333-3333-4333-8333-333333333333',
      },
    }

    const dueInterviewId = '44444444-4444-4444-8444-444444444444'
    const dueScheduleId = '55555555-5555-4555-8555-555555555555'
    const { worker, queueSentMessages } = createTestWorker({
      queryRowsBySqlIncludes: {
        'from notification_outbox_events': [
          {
            idempotency_key: 'interview.match.created:22222222-2222-4222-8222-222222222222',
            event_type: 'interview.match.created',
            event_payload: pendingOutboxPayload,
            status: 'pending',
            dispatch_attempts: 0,
            last_dispatch_attempted_at: null,
            created_at: '2026-05-22T09:59:00.000Z',
            updated_at: '2026-05-22T09:59:00.000Z',
          },
        ],
        'from notification_reminder_schedules': [
          {
            id: dueScheduleId,
            interview_id: dueInterviewId,
            idempotency_key: 'reminder:due:55555555-5555-4555-8555-555555555555',
            reminder_due_at: '2026-05-22T10:00:00.000Z',
            status: 'pending',
            created_at: '2026-05-22T09:00:00.000Z',
            updated_at: '2026-05-22T09:00:00.000Z',
          },
        ],
        'from interviews': [
          {
            id: dueInterviewId,
            scheduler_id: '66666666-6666-4666-8666-666666666666',
            interviewer_id: '77777777-7777-4777-8777-777777777777',
            type: 'behavioral',
            mode: 'live',
            tier: 'standard',
            status: 'scheduled',
            scheduled_at: '2026-05-22T14:00:00.000Z',
            created_at: '2026-05-22T09:00:00.000Z',
            updated_at: '2026-05-22T09:00:00.000Z',
          },
        ],
      },
    })

    const env = createMockEnv(createMockQueue(queueSentMessages))

    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} }, env)

    expect(queueSentMessages).toHaveLength(2)
    expect(queueSentMessages[0]).toEqual(pendingOutboxPayload)
    expect(queueSentMessages[1]).toMatchObject({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:due:55555555-5555-4555-8555-555555555555',
      interview_id: dueInterviewId,
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T10:00:00.000Z',
    })
  })

  it('sweep triggers feedback for handoffs it finishes, stops overdue recordings and retries stale pending starts', async function run() {
    const recordingStop = {
      processStopHandoff: vi.fn(async () => 'processed' as const),
      sweepStopHandoffs: vi.fn(async () => ['int-swept']),
      sweepOverdueRecordings: vi.fn(async () => 0),
    }
    const recordingStart = { sweepStalePendingClaims: vi.fn(async () => 0) }
    const { worker } = createTestWorker({ recordingStop, recordingStart })
    const feedbackWorkflow = createMockFeedbackWorkflow()

    await worker.scheduled(
      { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never,
      createMockEnvWithFeedback(feedbackWorkflow),
    )

    expect(feedbackWorkflow.createBatch).toHaveBeenCalledWith([
      { id: 'feedback-v1-int-swept', params: { interview_id: 'int-swept', schema_version: 1 } },
    ])
    expect(recordingStop.sweepOverdueRecordings).toHaveBeenCalledWith({ maxAgeSeconds: 3600, limit: 20 })
    expect(recordingStart.sweepStalePendingClaims).toHaveBeenCalledWith({ limit: 20 })
  })

  it('sweep starts feedback for processed handoffs missing feedback_triggered_at and marks them', async function run() {
    const markFeedbackTriggered = vi.fn(async () => {})
    const recordingStop = {
      processStopHandoff: vi.fn(async () => 'processed' as const),
      sweepStopHandoffs: vi.fn(async () => [] as string[]),
      sweepOverdueRecordings: vi.fn(async () => 0),
      listHandoffsAwaitingFeedback: vi.fn(async () => ['int-lost']),
      markFeedbackTriggered,
    }
    const { worker } = createTestWorker({ recordingStop })
    const feedbackWorkflow = createMockFeedbackWorkflow()

    await worker.scheduled(
      { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never,
      createMockEnvWithFeedback(feedbackWorkflow),
    )

    expect(feedbackWorkflow.createBatch).toHaveBeenCalledWith([
      { id: 'feedback-v1-int-lost', params: { interview_id: 'int-lost', schema_version: 1 } },
    ])
    expect(markFeedbackTriggered).toHaveBeenCalledWith('int-lost')
  })

  it('sweep starts feedback for handoffs the provider never let finish, asking for ones older than 15 minutes', async function run() {
    const now = Date.now()
    const markFeedbackTriggered = vi.fn(async () => {})
    const listHandoffsAwaitingFeedback = vi.fn(async () => ['int-provider-down'])
    const recordingStop = {
      processStopHandoff: vi.fn(async () => 'retry' as const),
      sweepStopHandoffs: vi.fn(async () => [] as string[]),
      sweepOverdueRecordings: vi.fn(async () => 0),
      listHandoffsAwaitingFeedback,
      markFeedbackTriggered,
    }
    const { worker } = createTestWorker({ recordingStop })
    const feedbackWorkflow = createMockFeedbackWorkflow()

    await worker.scheduled(
      { scheduledTime: now, cron: '*/5 * * * *', noRetry() {} } as never,
      createMockEnvWithFeedback(feedbackWorkflow),
    )

    const input = (listHandoffsAwaitingFeedback.mock.calls[0] as unknown as [{ unprocessedBefore: string }])[0]
    const ageMs = Date.now() - new Date(input.unprocessedBefore).getTime()
    expect(ageMs).toBeGreaterThanOrEqual(15 * 60_000)
    expect(ageMs).toBeLessThan(15 * 60_000 + 60_000)
    expect(feedbackWorkflow.createBatch).toHaveBeenCalledWith([
      {
        id: 'feedback-v1-int-provider-down',
        params: { interview_id: 'int-provider-down', schema_version: 1 },
      },
    ])
    expect(markFeedbackTriggered).toHaveBeenCalledWith('int-provider-down')
  })

  it('recovers when createBatch fails after the handoff was processed: queue leaves the marker unset, the sweep starts feedback', async function run() {
    const completedEventBody = {
      event_type: 'interview.completed',
      event_id: '11111111-1111-4111-8111-111111111111',
      idempotency_key: 'interview.completed:22222222-2222-4222-8222-222222222222',
      occurred_at: '2026-05-22T10:00:00.000Z',
      interview: {
        id: '22222222-2222-4222-8222-222222222222',
        scheduler_id: '33333333-3333-4333-8333-333333333333',
        interviewer_id: null,
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'completed',
        scheduled_at: '2026-05-22T14:00:00.000Z',
      },
      participants: {
        scheduler_user_id: '33333333-3333-4333-8333-333333333333',
        interviewer_user_id: null,
      },
    }
    const triggered = new Set<string>()
    const recordingStop = {
      processStopHandoff: vi.fn(async () => 'no_handoff' as const),
      sweepStopHandoffs: vi.fn(async () => [] as string[]),
      sweepOverdueRecordings: vi.fn(async () => 0),
      listHandoffsAwaitingFeedback: vi.fn(async () =>
        triggered.has(completedEventBody.interview.id) ? [] : [completedEventBody.interview.id],
      ),
      markFeedbackTriggered: vi.fn(async (id: string) => {
        triggered.add(id)
      }),
      recordFeedbackFailure: vi.fn(async () => {}),
    }
    const { worker } = createTestWorker({ recordingStop })
    const feedbackWorkflow = createMockFeedbackWorkflow()
    vi.mocked(feedbackWorkflow.createBatch).mockRejectedValueOnce(new Error('workflows down'))

    const batch = createMockBatch([createMockMessage('msg-1', completedEventBody, 3)])
    await worker.queue(batch, createMockEnvWithFeedback(feedbackWorkflow))
    expect(batch.retried).toContain('msg-1')
    expect(recordingStop.markFeedbackTriggered).not.toHaveBeenCalled()

    await worker.scheduled(
      { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never,
      createMockEnvWithFeedback(feedbackWorkflow),
    )
    expect(feedbackWorkflow.createBatch).toHaveBeenCalledTimes(2)
    expect(feedbackWorkflow.createBatch).toHaveBeenLastCalledWith([
      {
        id: `feedback-v1-${completedEventBody.interview.id}`,
        params: { interview_id: completedEventBody.interview.id, schema_version: 1 },
      },
    ])
    expect(recordingStop.markFeedbackTriggered).toHaveBeenCalledWith(completedEventBody.interview.id)
  })

  it('sweep still starts feedback when every delayed send fails', async function run() {
    const markFeedbackTriggered = vi.fn(async () => {})
    const recordingStop = {
      processStopHandoff: vi.fn(async () => 'processed' as const),
      sweepStopHandoffs: vi.fn(async () => [] as string[]),
      sweepOverdueRecordings: vi.fn(async () => 0),
      listHandoffsAwaitingFeedback: vi.fn(async () => ['int-lost']),
      markFeedbackTriggered,
    }
    const { worker } = createTestWorker({ recordingStop })
    const feedbackWorkflow = createMockFeedbackWorkflow()
    const env = {
      ...createMockEnvWithFeedback(feedbackWorkflow),
      NOTIFICATION_QUEUE: {
        async send() {
          throw new Error('queue down')
        },
      } as unknown as Queue<NotificationTransportMessage>,
    }

    await worker.scheduled({ scheduledTime: Date.now(), cron: '0 * * * *', noRetry() {} } as never, env)

    expect(feedbackWorkflow.createBatch).toHaveBeenCalledWith([
      { id: 'feedback-v1-int-lost', params: { interview_id: 'int-lost', schema_version: 1 } },
    ])
    expect(markFeedbackTriggered).toHaveBeenCalledWith('int-lost')
  })

  it('records a feedback failure in the sweep and still runs the overdue sweep', async function run() {
    const recordFeedbackFailure = vi.fn(async () => {})
    const recordingStop = {
      processStopHandoff: vi.fn(async () => 'processed' as const),
      sweepStopHandoffs: vi.fn(async () => ['int-a']),
      sweepOverdueRecordings: vi.fn(async () => 0),
      recordFeedbackFailure,
    }
    const { worker } = createTestWorker({ recordingStop })
    const feedbackWorkflow = createMockFeedbackWorkflow()
    vi.mocked(feedbackWorkflow.createBatch).mockRejectedValue(new Error('down'))

    await worker.scheduled(
      { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never,
      createMockEnvWithFeedback(feedbackWorkflow),
    )

    expect(recordFeedbackFailure).toHaveBeenCalledWith('int-a')
    expect(recordingStop.sweepOverdueRecordings).toHaveBeenCalled()
  })

  it('runs the overdue sweep even when the handoff sweep throws', async function run() {
    const recordingStop = {
      processStopHandoff: vi.fn(async () => 'processed' as const),
      sweepStopHandoffs: vi.fn(async () => {
        throw new Error('handoff sweep boom')
      }),
      sweepOverdueRecordings: vi.fn(async () => 0),
    }
    const { worker, logs } = createTestWorker({ recordingStop })

    await worker.scheduled(
      { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never,
      createMockEnvWithFeedback(createMockFeedbackWorkflow()),
    )

    expect(recordingStop.sweepOverdueRecordings).toHaveBeenCalledTimes(1)
    expect(logs.errors.map((e) => e.event)).toContain('recording_stop_sweep_failed')
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

describe('Story 5.15 raw artifact retention and privacy cleanup', function artifactRetentionSuite() {
  const interviewId = '22222222-2222-4222-8222-222222222222'
  const userId = '44444444-4444-4444-8444-444444444444'
  const recordingArtifactId = '55555555-5555-4555-8555-555555555555'
  const recordingKey = `interviews/${interviewId}/recording/${recordingArtifactId}`

  it('scheduled handler clears expired artifacts and deletes their R2 objects', async function run() {
    const bucket = createMockR2Bucket([recordingKey])
    const { worker, logs } = createTestWorker({
      queryRowsBySqlIncludes: {
        'from interview_artifacts': [
          {
            id: recordingArtifactId,
            interview_id: interviewId,
            artifact_kind: 'playback_recording',
            object_key: recordingKey,
          },
        ],
        'update interview_artifacts': [{ id: recordingArtifactId }],
      },
    })

    const env = { ...createMockEnv(), RECORDINGS_BUCKET: bucket.bucket }

    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} }, env)

    expect(bucket.delete).toHaveBeenCalledWith(recordingKey)
    const sweepLog = logs.logs.find(
      (call): call is unknown[] =>
        Array.isArray(call) && call[0] === '[artifact-retention] scheduled_sweep_completed',
    )
    expect(sweepLog).toBeDefined()
    expect(sweepLog![1]).toMatchObject({
      scannedArtifacts: 1,
      recordingDeletions: 1,
      clearedRows: 1,
      failures: 0,
    })
  })

  it('scheduled handler skips the sweep gracefully when no artifact bucket is configured', async function run() {
    const { worker, logs } = createTestWorker()
    const env = createMockEnv()

    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} }, env)

    expect(logs.errors.find((entry) => entry.event === 'artifact_retention_sweep_failed')).toBeUndefined()
  })

  it('queue handler processes account.privacy_cleanup_requested and clears participant artifacts', async function run() {
    const bucket = createMockR2Bucket([recordingKey])
    const { worker, logs } = createTestWorker({
      queryRowsBySqlIncludes: {
        'from interviews': [{ id: interviewId }],
        'from interview_artifacts': [
          {
            id: recordingArtifactId,
            interview_id: interviewId,
            artifact_kind: 'playback_recording',
            object_key: recordingKey,
          },
        ],
        'update interview_artifacts': [{ id: recordingArtifactId }],
      },
    })

    const env = { ...createMockEnv(), RECORDINGS_BUCKET: bucket.bucket }

    const batch = createMockBatch([
      createMockMessage('msg-1', {
        event_type: 'account.privacy_cleanup_requested',
        event_id: '11111111-1111-4111-8111-111111111111',
        idempotency_key: `account.privacy_cleanup_requested:${userId}`,
        occurred_at: '2026-06-01T00:00:00.000Z',
        user_id: userId,
      }),
    ])

    await worker.queue(batch, env)

    expect(batch.acked).toContain('msg-1')
    expect(batch.retried).toHaveLength(0)
    expect(bucket.delete).toHaveBeenCalledWith(recordingKey)

    const cleanupLog = logs.logs.find(
      (call): call is unknown[] =>
        Array.isArray(call) && call[0] === '[artifact-retention] privacy_cleanup_completed',
    )
    expect(cleanupLog).toBeDefined()
    expect(cleanupLog![1]).toMatchObject({
      scannedInterviews: 1,
      scannedArtifacts: 1,
      recordingDeletions: 1,
      clearedRows: 1,
      failures: 0,
    })
  })

  it('queue handler logs and acks when no artifact bucket is configured for privacy cleanup', async function run() {
    const { worker, logs } = createTestWorker({
      queryRowsBySqlIncludes: {
        'from interviews': [{ id: interviewId }],
      },
    })

    const env = createMockEnv()

    const batch = createMockBatch([
      createMockMessage('msg-1', {
        event_type: 'account.privacy_cleanup_requested',
        event_id: '11111111-1111-4111-8111-111111111111',
        idempotency_key: `account.privacy_cleanup_requested:${userId}`,
        occurred_at: '2026-06-01T00:00:00.000Z',
        user_id: userId,
      }),
    ])

    await worker.queue(batch, env)

    expect(batch.acked).toContain('msg-1')
    expect(logs.errors).toHaveLength(1)
    expect(logs.errors[0]).toMatchObject({
      event: 'artifact_retention.privacy_cleanup_not_configured',
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
describe('Story 5.11 recording finalization sweep', function recordingFinalizationSuite() {
  it('exports RecordingFinalizationWorkflow and strict payload schema', async function run() {
    const mod = (await import('./index')) as Record<string, unknown>
    expect(mod['RecordingFinalizationWorkflow']).toBeDefined()
    const schema = (mod['recordingFinalizationPayloadSchema'] ??
      mod['RecordingFinalizationWorkflowPayloadSchema'] ??
      (mod['RecordingFinalizationWorkflow'] as Record<string, unknown>)?.['payloadSchema']) as
      | { safeParse: (v: unknown) => { success: boolean } }
      | undefined
    expect(schema).toBeDefined()
    expect(typeof schema?.safeParse).toBe('function')
    const validId = '11111111-1111-4111-8111-111111111111'
    expect(schema?.safeParse({ recording_id: validId, schema_version: 1 }).success).toBe(true)
    expect(schema?.safeParse({ recording_id: validId, schema_version: 1, extra: 'x' }).success).toBe(false)
    expect(schema?.safeParse({ recording_id: 'not-a-uuid', schema_version: 1 }).success).toBe(false)
    expect(schema?.safeParse({ recording_id: validId, schema_version: 2 }).success).toBe(false)
    expect(schema?.safeParse({ recording_id: validId }).success).toBe(false)
  })

  it('scheduled sweep claims bounded UPLOADED recordings and calls RECORDING_FINALIZATION_WORKFLOW.createBatch with deterministic IDs', async function run() {
    const providerIds = ['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb']
    const executedSql: string[] = []
    const recordingCreateBatch = vi.fn(async () => {})
    const feedbackCreateBatch = vi.fn(async () => {})
    const { worker } = createSweepHarness({ executedSql, providerIds })
    const env = {
      HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
      NOTIFICATION_QUEUE: createMockQueue(),
      RECORDING_FINALIZATION_WORKFLOW: { createBatch: recordingCreateBatch },
      FEEDBACK_WORKFLOW: { createBatch: feedbackCreateBatch },
    } as unknown as Parameters<(typeof worker)['scheduled']>[1]
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never, env)
    const normalizedSql = executedSql.map((s) => s.toLowerCase())
    expect(normalizedSql.some((s) => s.includes('interview_recordings'))).toBe(true)
    expect(normalizedSql.some((s) => s.includes('uploaded'))).toBe(true)
    expect(normalizedSql.some((s) => s.includes('limit'))).toBe(true)
    expect(recordingCreateBatch).toHaveBeenCalledTimes(1)
    const batchArg = ((recordingCreateBatch.mock.calls as unknown as Array<unknown[]>)[0]?.[0] as Array<{ id: string; params: unknown }>) ?? []
    expect(batchArg).toHaveLength(providerIds.length)
    for (const pid of providerIds) {
      const entry = batchArg.find((e) => e.id === `recording-finalization-v1-${pid}`)
      expect(entry).toBeDefined()
      expect(entry?.params).toEqual({ recording_id: pid, schema_version: 1 })
    }
    expect(feedbackCreateBatch).not.toHaveBeenCalled()
  })

  it('does not call RECORDING_FINALIZATION_WORKFLOW.createBatch when no eligible UPLOADED recordings', async function run() {
    const executedSql: string[] = []
    const recordingCreateBatch = vi.fn(async () => {})
    const feedbackCreateBatch = vi.fn(async () => {})
    const { worker } = createSweepHarness({ executedSql, providerIds: [] })
    const env = {
      HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
      NOTIFICATION_QUEUE: createMockQueue(),
      RECORDING_FINALIZATION_WORKFLOW: { createBatch: recordingCreateBatch },
      FEEDBACK_WORKFLOW: { createBatch: feedbackCreateBatch },
    } as unknown as Parameters<(typeof worker)['scheduled']>[1]
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never, env)
    expect(executedSql.some((s) => s.toLowerCase().includes('interview_recordings'))).toBe(true)
    expect(recordingCreateBatch).not.toHaveBeenCalled()
    expect(feedbackCreateBatch).not.toHaveBeenCalled()
  })

  it('logs RECORDING_FINALIZATION_WORKFLOW failure without preventing notification dispatch', async function run() {
    const providerIds = ['cccccccc-cccc-4ccc-cccc-cccccccccccc']
    const executedSql: string[] = []
    const recordingCreateBatch = vi.fn(async () => {
      throw new Error('workflow unavailable')
    })
    const feedbackCreateBatch = vi.fn(async () => {})
    const { worker, logs, queueSentMessages } = createSweepHarnessWithOutbox({ executedSql, recordingCreateBatch, feedbackCreateBatch, providerIds })
    const env = {
      HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
      NOTIFICATION_QUEUE: createMockQueue(queueSentMessages),
      RECORDING_FINALIZATION_WORKFLOW: { createBatch: recordingCreateBatch },
      FEEDBACK_WORKFLOW: { createBatch: feedbackCreateBatch },
    } as unknown as Parameters<(typeof worker)['scheduled']>[1]
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never, env)
    expect(recordingCreateBatch).toHaveBeenCalledTimes(1)
    expect(logs.errors.some((e) => JSON.stringify(e).toLowerCase().includes('recording') || e.event.toLowerCase().includes('recording'))).toBe(true)
    expect(queueSentMessages.length).toBeGreaterThanOrEqual(2)
    expect(feedbackCreateBatch).not.toHaveBeenCalled()
  })

  it('restarts errored and terminated instances when createBatch creates no new instance', async function run() {
    const providerIds = ['ffffffff-ffff-4fff-ffff-ffffffffffff', 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee']
    const executedSql: string[] = []
    const restartErrored = vi.fn(async () => {})
    const restartTerminated = vi.fn(async () => {})
    const get = vi.fn(async (id: string) => {
      if (id.includes('ffffffff')) return { id, status: async () => ({ status: 'errored' }), restart: restartErrored }
      return { id, status: async () => ({ status: 'terminated' }), restart: restartTerminated }
    })
    // Simulate no new instance created (deduplicated deterministic ID)
    const recordingCreateBatch = vi.fn(async () => [])
    const feedbackCreateBatch = vi.fn(async () => {})
    const { worker } = createSweepHarness({ executedSql, providerIds })
    const env = {
      HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
      NOTIFICATION_QUEUE: createMockQueue(),
      RECORDING_FINALIZATION_WORKFLOW: { createBatch: recordingCreateBatch, get } as unknown as Parameters<(typeof worker)['scheduled']>[1]['RECORDING_FINALIZATION_WORKFLOW'],
      FEEDBACK_WORKFLOW: { createBatch: feedbackCreateBatch },
    } as unknown as Parameters<(typeof worker)['scheduled']>[1]
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never, env)
    expect(executedSql.some((s) => s.toLowerCase().includes('limit'))).toBe(true)
    expect(executedSql.some((s) => s.toLowerCase().includes('interview_recordings'))).toBe(true)
    expect(recordingCreateBatch).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalled()
    expect(restartErrored).toHaveBeenCalledTimes(1)
    expect(restartTerminated).toHaveBeenCalledTimes(1)
    expect(feedbackCreateBatch).not.toHaveBeenCalled()
  })

  it('restarts completed instance with failed output status and does not restart running or waiting instances', async function run() {
    const completedId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const runningId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
    const waitingId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
    const executedSql: string[] = []
    const restartFailed = vi.fn(async () => {})
    const restartRunning = vi.fn(async () => {})
    const restartWaiting = vi.fn(async () => {})
    const get = vi.fn(async (id: string) => {
      if (id.includes(completedId)) return { id, status: async () => ({ status: 'completed', output: { status: 'failed' } }), restart: restartFailed }
      if (id.includes(runningId)) return { id, status: async () => ({ status: 'running' }), restart: restartRunning }
      return { id, status: async () => ({ status: 'waiting' }), restart: restartWaiting }
    })
    const recordingCreateBatch = vi.fn(async () => [])
    const feedbackCreateBatch = vi.fn(async () => {})
    const { worker } = createSweepHarness({ executedSql, providerIds: [completedId, runningId, waitingId] })
    const env = {
      HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
      NOTIFICATION_QUEUE: createMockQueue(),
      RECORDING_FINALIZATION_WORKFLOW: { createBatch: recordingCreateBatch, get } as unknown as Parameters<(typeof worker)['scheduled']>[1]['RECORDING_FINALIZATION_WORKFLOW'],
      FEEDBACK_WORKFLOW: { createBatch: feedbackCreateBatch },
    } as unknown as Parameters<(typeof worker)['scheduled']>[1]
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never, env)
    expect(executedSql.some((s) => s.toLowerCase().includes('interview_recordings'))).toBe(true)
    expect(recordingCreateBatch).toHaveBeenCalled()
    expect(get).toHaveBeenCalled()
    expect(restartFailed).toHaveBeenCalledTimes(1)
    expect(restartRunning).not.toHaveBeenCalled()
    expect(restartWaiting).not.toHaveBeenCalled()
  })

  it('does not restart completed instance when output status is not failed and ignores fabricated checkpoint field', async function run() {
    const completedFailedCheckpointOnlyId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const completedSuccessOutputId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
    const executedSql: string[] = []
    const restartCheckpointOnly = vi.fn(async () => {})
    const restartSuccess = vi.fn(async () => {})
    const get = vi.fn(async (id: string) => {
      if (id.includes(completedFailedCheckpointOnlyId)) return { id, status: async () => ({ status: 'completed', checkpoint: 'failed' }), restart: restartCheckpointOnly }
      return { id, status: async () => ({ status: 'completed', output: { status: 'ready' } }), restart: restartSuccess }
    })
    const recordingCreateBatch = vi.fn(async () => [])
    const feedbackCreateBatch = vi.fn(async () => {})
    const { worker } = createSweepHarness({ executedSql, providerIds: [completedFailedCheckpointOnlyId, completedSuccessOutputId] })
    const env = {
      HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
      NOTIFICATION_QUEUE: createMockQueue(),
      RECORDING_FINALIZATION_WORKFLOW: { createBatch: recordingCreateBatch, get } as unknown as Parameters<(typeof worker)['scheduled']>[1]['RECORDING_FINALIZATION_WORKFLOW'],
      FEEDBACK_WORKFLOW: { createBatch: feedbackCreateBatch },
    } as unknown as Parameters<(typeof worker)['scheduled']>[1]
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never, env)
    expect(get).toHaveBeenCalled()
    expect(restartCheckpointOnly).not.toHaveBeenCalled()
    expect(restartSuccess).not.toHaveBeenCalled()
  })

  it('never delegates recording transfer to FEEDBACK_WORKFLOW', async function run() {
    const providerIds = ['dddddddd-dddd-4ddd-dddd-dddddddddddd', 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee']
    const executedSql: string[] = []
    const recordingCreateBatch = vi.fn(async () => {})
    const feedbackCreateBatch = vi.fn(async () => {})
    const { worker } = createSweepHarness({ executedSql, providerIds })
    const env = {
      HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
      NOTIFICATION_QUEUE: createMockQueue(),
      RECORDING_FINALIZATION_WORKFLOW: { createBatch: recordingCreateBatch },
      FEEDBACK_WORKFLOW: { createBatch: feedbackCreateBatch },
    } as unknown as Parameters<(typeof worker)['scheduled']>[1]
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never, env)
    expect(recordingCreateBatch).toHaveBeenCalledTimes(1)
    const batchArg = ((recordingCreateBatch.mock.calls as unknown as Array<unknown[]>)[0]?.[0] as Array<{ params: Record<string, unknown> }>) ?? []
    for (const entry of batchArg) {
      expect(entry.params).toHaveProperty('recording_id')
      expect(entry.params).not.toHaveProperty('interview_id')
    }
    expect(feedbackCreateBatch).not.toHaveBeenCalled()
    expect(executedSql.some((s) => s.toLowerCase().includes('interview_recordings'))).toBe(true)
  })
  it('sweep query includes processing rows for recoverable stuck finalizations', async function run() {
    const providerIds = ['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa']
    const executedSql: string[] = []
    const recordingCreateBatch = vi.fn(async () => {})
    const feedbackCreateBatch = vi.fn(async () => {})
    const { worker } = createSweepHarness({ executedSql, providerIds })
    const env = {
      HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
      NOTIFICATION_QUEUE: createMockQueue(),
      RECORDING_FINALIZATION_WORKFLOW: { createBatch: recordingCreateBatch },
      FEEDBACK_WORKFLOW: { createBatch: feedbackCreateBatch },
    } as unknown as Parameters<(typeof worker)['scheduled']>[1]
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never, env)
    const normalized = executedSql.map((s) => s.toLowerCase())
    const sweepSql = normalized.find((s) => s.includes('interview_recordings') && s.includes('select'))
    expect(sweepSql).toBeDefined()
    expect(sweepSql).toContain('processing')
    expect(sweepSql).toContain('pending')
    expect(sweepSql).toContain('failed')
    expect(sweepSql).toContain('uploaded')
    expect(sweepSql).toContain('limit')
  })
  it('sweep selects and restarts errored processing instance via deterministic id', async function run() {
    const processingProviderId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const executedSql: string[] = []
    const restartProcessingErrored = vi.fn(async () => {})
    const get = vi.fn(async (id: string) => {
      if (id.includes(processingProviderId)) return { id, status: async () => ({ status: 'errored' }), restart: restartProcessingErrored }
      return null
    })
    let returnedProcessingRows = false
    const logs = { errors: [] as Array<{ event: string; context: Record<string, unknown> }>, logs: [] as unknown[] }
    const mockConsole = {
      error: vi.fn((event: string, context: Record<string, unknown>) => { logs.errors.push({ event, context }) }),
      log: vi.fn((...args: unknown[]) => { logs.logs.push(args) }),
    }
    const mockPool = {
      async connect() {
        return {
          async query(text: string) {
            executedSql.push(text)
            const lower = text.toLowerCase()
            if (lower.includes('interview_recordings') && lower.includes('select')) {
              if (!lower.includes('processing')) return { rows: [], rowCount: 0 }
              returnedProcessingRows = true
              return { rows: [{ provider_recording_id: processingProviderId, provider_status: 'UPLOADED', finalization_status: 'processing' }], rowCount: 1 }
            }
            if (lower.includes('from notification_outbox_events')) return { rows: [], rowCount: 0 }
            if (lower.includes('from notification_reminder_schedules')) return { rows: [], rowCount: 0 }
            if (lower.includes('from interviews')) return { rows: [], rowCount: 0 }
            return { rows: [], rowCount: 0 }
          },
          async release() {},
        }
      },
    }
    const worker = createNotificationWorker({ createPool: () => mockPool as never, console: mockConsole })
    const recordingCreateBatch = vi.fn(async () => [])
    const feedbackCreateBatch = vi.fn(async () => {})
    const env = {
      HYPERDRIVE: { connectionString: 'postgresql://localhost:5432/test' },
      NOTIFICATION_QUEUE: createMockQueue(),
      RECORDING_FINALIZATION_WORKFLOW: { createBatch: recordingCreateBatch, get } as unknown as Parameters<(typeof worker)['scheduled']>[1]['RECORDING_FINALIZATION_WORKFLOW'],
      FEEDBACK_WORKFLOW: { createBatch: feedbackCreateBatch },
    } as unknown as Parameters<(typeof worker)['scheduled']>[1]
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} } as never, env)
    expect(returnedProcessingRows).toBe(true)
    expect(recordingCreateBatch).toHaveBeenCalled()
    expect(get).toHaveBeenCalled()
    expect(restartProcessingErrored).toHaveBeenCalledTimes(1)
  })

  function createSweepHarness(opts: { executedSql: string[]; providerIds: string[] }) {
    const logs = { errors: [] as Array<{ event: string; context: Record<string, unknown> }>, logs: [] as unknown[] }
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
          async query(text: string) {
            opts.executedSql.push(text)
            const lower = text.toLowerCase()
            if (lower.includes('interview_recordings') && lower.includes('select')) {
              const rows = opts.providerIds.map((pid) => ({
                provider_recording_id: pid,
                provider_status: 'UPLOADED',
                finalization_status: 'pending',
              }))
              return { rows, rowCount: rows.length }
            }
            return { rows: [], rowCount: 0 }
          },
          async release() {},
        }
      },
    }
    const worker = createNotificationWorker({ createPool: () => mockPool as never, console: mockConsole })
    return { worker, logs }
  }

  function createSweepHarnessWithOutbox(opts: {
    executedSql: string[]
    recordingCreateBatch: ReturnType<typeof vi.fn>
    feedbackCreateBatch: ReturnType<typeof vi.fn>
    providerIds: string[]
  }) {
    const logs = { errors: [] as Array<{ event: string; context: Record<string, unknown> }>, logs: [] as unknown[] }
    const mockConsole = {
      error: vi.fn((event: string, context: Record<string, unknown>) => {
        logs.errors.push({ event, context })
      }),
      log: vi.fn((...args: unknown[]) => {
        logs.logs.push(args)
      }),
    }
    const queueSentMessages: NotificationTransportMessage[] = []
    const pendingOutboxPayload: NotificationTransportMessage = {
      event_type: 'interview.match.created',
      event_id: '11111111-1111-4111-8111-111111111111',
      idempotency_key: 'interview.match.created:22222222-2222-4222-8222-222222222222',
      occurred_at: '2026-05-22T10:00:00.000Z',
      interview: {
        id: '22222222-2222-4222-8222-222222222222',
        scheduler_id: '66666666-6666-4666-8666-666666666666',
        interviewer_id: '33333333-3333-4333-8333-333333333333',
        type: 'behavioral',
        mode: 'peer_to_peer',
        booking_channel: 'standard_match',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-05-22T14:00:00.000Z',
      },
      participants: {
        scheduler_user_id: '66666666-6666-4666-8666-666666666666',
        interviewer_user_id: '33333333-3333-4333-8333-333333333333',
      },
    }
    const mockPool = {
      async connect() {
        return {
          async query(text: string) {
            opts.executedSql.push(text)
            const lower = text.toLowerCase()
            if (lower.includes('from notification_outbox_events')) {
              return {
                rows: [
                  {
                    idempotency_key: pendingOutboxPayload.idempotency_key,
                    event_type: 'interview.match.created',
                    event_payload: pendingOutboxPayload,
                    status: 'pending',
                    dispatch_attempts: 0,
                    last_dispatch_attempted_at: null,
                    created_at: '2026-05-22T09:59:00.000Z',
                    updated_at: '2026-05-22T09:59:00.000Z',
                  },
                ],
                rowCount: 1,
              }
            }
            if (lower.includes('from notification_reminder_schedules')) {
              return {
                rows: [
                  {
                    id: '55555555-5555-4555-8555-555555555555',
                    interview_id: '44444444-4444-4444-8444-444444444444',
                    idempotency_key: 'reminder:due:55555555-5555-4555-8555-555555555555',
                    reminder_due_at: '2026-05-22T10:00:00.000Z',
                    status: 'pending',
                    created_at: '2026-05-22T09:00:00.000Z',
                    updated_at: '2026-05-22T09:00:00.000Z',
                  },
                ],
                rowCount: 1,
              }
            }
            if (lower.includes('from interviews')) {
              return {
                rows: [
                  {
                    id: '44444444-4444-4444-8444-444444444444',
                    scheduler_id: '66666666-6666-4666-8666-666666666666',
                    interviewer_id: '77777777-7777-4777-8777-777777777777',
                    type: 'behavioral',
                    mode: 'live',
                    tier: 'standard',
                    status: 'scheduled',
                    scheduled_at: '2026-05-22T14:00:00.000Z',
                    created_at: '2026-05-22T09:00:00.000Z',
                    updated_at: '2026-05-22T09:00:00.000Z',
                  },
                ],
                rowCount: 1,
              }
            }
            if (lower.includes('interview_recordings') && lower.includes('select')) {
              const rows = opts.providerIds.map((pid) => ({
                provider_recording_id: pid,
                provider_status: 'UPLOADED',
                finalization_status: 'pending',
              }))
              return { rows, rowCount: rows.length }
            }
            return { rows: [], rowCount: 0 }
          },
          async release() {},
        }
      },
    }
    const worker = createNotificationWorker({ createPool: () => mockPool as never, console: mockConsole })
    return { worker, logs, queueSentMessages }
  }
})

function createTestWorker(options?: {
  queryRowsBySqlIncludes?: Record<string, unknown[]>
  queryErrorsBySqlIncludes?: Record<string, Error>
  releaseRejectsWith?: Error
  recordingStop?: {
    processStopHandoff: (interviewId: string) => Promise<'processed' | 'no_handoff' | 'retry'>
    sweepStopHandoffs: (input: { olderThan: string; limit: number }) => Promise<string[]>
    sweepOverdueRecordings: (input: { maxAgeSeconds: number; limit: number }) => Promise<number>
    closeOverdueRecordingsForInterview?: (input: {
      interviewId: string
      maxAgeSeconds: number
    }) => Promise<unknown>
    listHandoffsAwaitingFeedback?: (input: {
      processedBefore: string
      unprocessedBefore: string
      limit: number
    }) => Promise<string[]>
    markFeedbackTriggered?: (interviewId: string) => Promise<void>
    isFeedbackTriggered?: (interviewId: string) => Promise<boolean>
    recordFeedbackFailure?: (interviewId: string) => Promise<void>
  }
  recordingStart?: {
    sweepStalePendingClaims?: (input: { limit: number }) => Promise<number>
    ensureRecordingStarted?: (interviewId: string) => Promise<string>
  }
}) {
  const queueSentMessages: NotificationTransportMessage[] = []
  const queries: Array<{ text: string; values: unknown[] }> = []
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

  const clientRelease = vi.fn(async () => {
    if (options?.releaseRejectsWith) {
      throw options.releaseRejectsWith
    }
  })
  const poolEnd = vi.fn(async () => {})

  const mockPool = {
    async connect() {
      return {
        async query(text: string, values: unknown[]) {
          queries.push({ text, values })
          const normalizedSql = text.toLowerCase()

          if (options?.queryErrorsBySqlIncludes) {
            for (const [needle, error] of Object.entries(options.queryErrorsBySqlIncludes)) {
              if (normalizedSql.includes(needle.toLowerCase())) {
                throw error
              }
            }
          }

          const configuredRows = options?.queryRowsBySqlIncludes

          if (configuredRows) {
            for (const [needle, rows] of Object.entries(configuredRows)) {
              if (normalizedSql.includes(needle.toLowerCase())) {
                return { rows, rowCount: rows.length }
              }
            }
          }

          return { rows: [], rowCount: 0 }
        },
        release: clientRelease,
      }
    },
    async end() {
      return poolEnd()
    },
  }

  const worker = createNotificationWorker({
    createPool: () => mockPool,
    console: mockConsole,
    createRecordingStopProcessor: options?.recordingStop
      ? () =>
          ({
            listHandoffsAwaitingFeedback: async () => [],
            markFeedbackTriggered: async () => {},
            recordFeedbackFailure: async () => {},
            ...options.recordingStop,
          }) as never
      : undefined,
    createRecordingStartSweeper: options?.recordingStart
      ? () => options.recordingStart as never
      : undefined,
  })

  return { worker, queueSentMessages, logs, queries, clientRelease, poolEnd }
}

function sweepCheckpointUpdates(queries: Array<{ text: string; values: unknown[] }>) {
  return queries.filter((query) =>
    query.text.toLowerCase().includes('update realtimekit_webhook_events'),
  )
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

function createMockQueue(sent: NotificationTransportMessage[] = []): Queue<NotificationTransportMessage> {

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

function createMockEnv(queue: Queue<NotificationTransportMessage> = createMockQueue()) {
  return {
    HYPERDRIVE: {
      connectionString: 'postgresql://localhost:5432/test',
    },
    NOTIFICATION_QUEUE: queue,
  }
}

function createMockR2Bucket(existingKeys: readonly string[] = []) {
  const objects = new Set(existingKeys)
  const head = vi.fn(async (key: string) =>
    objects.has(key) ? { size: 10, httpEtag: '"etag"', httpMetadata: {}, customMetadata: {} } : null,
  )
  const deleteFn = vi.fn(async (key: string) => {
    objects.delete(key)
  })
  const put = vi.fn(async () => {})
  const get = vi.fn(async () => null)

  return {
    bucket: { head, delete: deleteFn, put, get } as unknown as R2Bucket,
    head,
    delete: deleteFn,
  }
}

function createMockFeedbackWorkflow() {
  const createBatch = vi.fn(async () => {})
  return {
    createBatch,
  } as unknown as Workflow<FeedbackWorkflowPayload>
}


function createMockEnvWithFeedback(
  feedbackWorkflow: ReturnType<typeof createMockFeedbackWorkflow>,
  queue?: Queue<NotificationTransportMessage>,
) {
  return {
    ...createMockEnv(queue),
    FEEDBACK_WORKFLOW: feedbackWorkflow,
  }
}

describe('work.due messages', function workDueSuite() {
  const interviewId = '33333333-3333-4333-8333-333333333333'
  const dueAt = new Date(Date.now() - 1000).toISOString()

  function workDue(duty: string, due = dueAt) {
    return {
      message_type: 'work.due',
      idempotency_key: `${duty}:${interviewId}`,
      duty,
      entity_id: interviewId,
      due_at: due,
    }
  }

  function recordingQueue(sent: Array<{ message: unknown; options: unknown }>) {
    return {
      ...createMockEnv(),
      NOTIFICATION_QUEUE: {
        async send(message: unknown, options: unknown) {
          sent.push({ message, options })
        },
      } as unknown as Queue<NotificationTransportMessage>,
    }
  }

  const baseStop = {
    processStopHandoff: vi.fn(async () => 'no_handoff' as const),
    sweepStopHandoffs: vi.fn(async () => [] as string[]),
    sweepOverdueRecordings: vi.fn(async () => 0),
  }

  it('closes the overdue recording for the interview and acks', async function run() {
    const close = vi.fn(async () => ({ outcome: 'closed' }))
    const { worker } = createTestWorker({
      recordingStop: { ...baseStop, closeOverdueRecordingsForInterview: close },
      recordingStart: {},
    })
    const batch = createMockBatch([createMockMessage('msg-1', workDue('recording_overdue'))])
    await worker.queue(batch, createMockEnv())
    expect(close).toHaveBeenCalledWith({ interviewId, maxAgeSeconds: 3600 })
    expect(batch.acked).toContain('msg-1')
  })

  it('re-sends an early overdue message with the remaining delay', async function run() {
    const sent: Array<{ message: unknown; options: unknown }> = []
    const close = vi.fn(async () => ({ outcome: 'early', dueAtMs: Date.now() + 120_000 }))
    const { worker } = createTestWorker({
      recordingStop: { ...baseStop, closeOverdueRecordingsForInterview: close },
      recordingStart: {},
    })
    const batch = createMockBatch([createMockMessage('msg-1', workDue('recording_overdue'))])
    await worker.queue(batch, recordingQueue(sent))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.message).toMatchObject({ duty: 'recording_overdue', entity_id: interviewId })
    expect(sent[0]!.options).toMatchObject({ delaySeconds: expect.any(Number) })
    expect((sent[0]!.options as { delaySeconds: number }).delaySeconds).toBeGreaterThan(100)
    expect(batch.acked).toContain('msg-1')
  })

  it('releases a stale start claim through ensureRecordingStarted', async function run() {
    const ensure = vi.fn(async () => 'started')
    const { worker } = createTestWorker({
      recordingStop: baseStop,
      recordingStart: { ensureRecordingStarted: ensure },
    })
    const batch = createMockBatch([createMockMessage('msg-1', workDue('start_claim_stale'))])
    await worker.queue(batch, createMockEnv())
    expect(ensure).toHaveBeenCalledWith(interviewId)
    expect(batch.acked).toContain('msg-1')
  })

  it('retries the message when closing the recording failed', async function run() {
    const { worker } = createTestWorker({
      recordingStop: {
        ...baseStop,
        closeOverdueRecordingsForInterview: vi.fn(async () => ({ outcome: 'failed' })),
      },
      recordingStart: {},
    })
    const batch = createMockBatch([createMockMessage('msg-1', workDue('recording_overdue'))])
    await worker.queue(batch, createMockEnv())
    expect(batch.retried).toContain('msg-1')
  })

  describe('feedback duties', function feedbackDutySuite() {
    const dueNow = new Date(Date.now() - 1000).toISOString()

    it('feedback_deadline with the marker set is a no-op', async function run() {
      const markFeedbackTriggered = vi.fn(async () => {})
      const feedbackWorkflow = createMockFeedbackWorkflow()
      const { worker } = createTestWorker({
        recordingStop: { ...baseStop, isFeedbackTriggered: async () => true, markFeedbackTriggered },
        recordingStart: {},
      })
      const batch = createMockBatch([createMockMessage('msg-1', workDue('feedback_deadline', dueNow))])
      await worker.queue(batch, createMockEnvWithFeedback(feedbackWorkflow))
      expect(feedbackWorkflow.createBatch).not.toHaveBeenCalled()
      expect(markFeedbackTriggered).not.toHaveBeenCalled()
      expect(batch.acked).toContain('msg-1')
    })

    it('feedback_deadline with the marker unset starts feedback once and sets the marker', async function run() {
      const markFeedbackTriggered = vi.fn(async () => {})
      const feedbackWorkflow = createMockFeedbackWorkflow()
      const { worker } = createTestWorker({
        recordingStop: { ...baseStop, isFeedbackTriggered: async () => false, markFeedbackTriggered },
        recordingStart: {},
      })
      const batch = createMockBatch([createMockMessage('msg-1', workDue('feedback_deadline', dueNow))])
      await worker.queue(batch, createMockEnvWithFeedback(feedbackWorkflow))
      expect(feedbackWorkflow.createBatch).toHaveBeenCalledTimes(1)
      expect(markFeedbackTriggered).toHaveBeenCalledWith(interviewId)
      expect(batch.acked).toContain('msg-1')
    })

    it('feedback_deadline retries the message when starting feedback fails', async function run() {
      const feedbackWorkflow = createMockFeedbackWorkflow()
      vi.mocked(feedbackWorkflow.createBatch).mockRejectedValueOnce(new Error('workflows down'))
      const { worker } = createTestWorker({
        recordingStop: {
          ...baseStop,
          isFeedbackTriggered: async () => false,
          markFeedbackTriggered: vi.fn(async () => {}),
        },
        recordingStart: {},
      })
      const batch = createMockBatch([createMockMessage('msg-1', workDue('feedback_deadline', dueNow))])
      await worker.queue(batch, createMockEnvWithFeedback(feedbackWorkflow))
      expect(batch.retried).toContain('msg-1')
    })

    it('feedback_deadline re-sends an early message with the remaining delay', async function run() {
      const sent: Array<{ message: unknown; options: unknown }> = []
      const feedbackWorkflow = createMockFeedbackWorkflow()
      const { worker } = createTestWorker({
        recordingStop: { ...baseStop, isFeedbackTriggered: async () => false },
        recordingStart: {},
      })
      const early = new Date(Date.now() + 300_000).toISOString()
      const batch = createMockBatch([createMockMessage('msg-1', workDue('feedback_deadline', early))])
      await worker.queue(batch, { ...recordingQueue(sent), FEEDBACK_WORKFLOW: feedbackWorkflow })
      expect(feedbackWorkflow.createBatch).not.toHaveBeenCalled()
      expect(sent).toHaveLength(1)
      expect((sent[0]!.options as { delaySeconds: number }).delaySeconds).toBeGreaterThan(290)
    })

    it('feedback_deadline retries the message when the early re-send fails', async function run() {
      const { worker } = createTestWorker({
        recordingStop: { ...baseStop, isFeedbackTriggered: async () => false },
        recordingStart: {},
      })
      const early = new Date(Date.now() + 300_000).toISOString()
      const batch = createMockBatch([createMockMessage('msg-1', workDue('feedback_deadline', early))])
      await worker.queue(batch, {
        ...createMockEnv(),
        NOTIFICATION_QUEUE: {
          async send() {
            throw new Error('queue down')
          },
        } as unknown as Queue<NotificationTransportMessage>,
      })
      expect(batch.retried).toContain('msg-1')
      expect(batch.acked).toHaveLength(0)
    })

    it('feedback_stale fences stale processing by id and restarts the workflow', async function run() {
      const create = vi.fn(async () => ({}))
      const { worker, queries } = createTestWorker({
        recordingStop: baseStop,
        recordingStart: {},
        queryRowsBySqlIncludes: { 'AND id = $3': [{ id: interviewId, prior_attempt_id: 'a' }] },
      })
      const batch = createMockBatch([createMockMessage('msg-1', workDue('feedback_stale', dueNow))])
      await worker.queue(batch, {
        ...createMockEnv(),
        FEEDBACK_WORKFLOW: { create } as unknown as Workflow<FeedbackWorkflowPayload>,
      })
      expect(create).toHaveBeenCalledTimes(1)
      expect(queries.some((q) => q.text.includes('AND id = $3'))).toBe(true)
      expect(batch.acked).toContain('msg-1')
    })

    it('feedback_stale re-sends with the remaining delay when the heartbeat was refreshed', async function run() {
      const sent: Array<{ message: unknown; options: unknown }> = []
      const heartbeat = new Date(Date.now() - 60_000).toISOString()
      const { worker } = createTestWorker({
        recordingStop: baseStop,
        recordingStart: {},
        queryRowsBySqlIncludes: {
          'SELECT feedback_status, feedback_processing_heartbeat_at': [
            { feedback_status: 'processing', feedback_processing_heartbeat_at: heartbeat },
          ],
        },
      })
      const batch = createMockBatch([createMockMessage('msg-1', workDue('feedback_stale', dueNow))])
      await worker.queue(batch, {
        ...recordingQueue(sent),
        FEEDBACK_WORKFLOW: { create: vi.fn() } as unknown as Workflow<FeedbackWorkflowPayload>,
      })
      expect(sent).toHaveLength(1)
      expect(sent[0]!.message).toMatchObject({ duty: 'feedback_stale', entity_id: interviewId })
      expect((sent[0]!.options as { delaySeconds: number }).delaySeconds).toBeGreaterThan(0)
    })
  })

  it('acks an unknown duty as an invalid schema', async function run() {
    const { worker, logs } = createTestWorker()
    const batch = createMockBatch([createMockMessage('msg-1', workDue('unknown_duty'))])
    await worker.queue(batch, createMockEnv())
    expect(batch.acked).toContain('msg-1')
    expect(logs.errors[0]?.event).toBe('notification_orchestrator.invalid_schema')
  })
})
