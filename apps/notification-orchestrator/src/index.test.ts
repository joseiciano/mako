import { describe, expect, it, vi } from 'vitest'
import { createNotificationWorker, type NotificationWorkerDependencies } from './index'
import type { NotificationTransportMessage } from '@mako/shared-backend'
import type { FeedbackWorkflowPayload } from './workflows/feedback-workflow'
import type { RecordingFinalizationWorkflowPayload } from './workflows/recording-finalization-workflow'

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

  it('handles missing hyperdrive gracefully', async function run() {
    const { worker, logs } = createTestWorker()

    const env = { HYPERDRIVE: undefined as unknown as { connectionString: string }, NOTIFICATION_QUEUE: createMockQueue() }

    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} }, env)

    expect(logs.errors).toHaveLength(1)
    expect(logs.errors[0]).toMatchObject({
      event: 'notification_orchestrator.missing_hyperdrive',
    })
  })

  it('sweeps due recording finalization checkpoints with deterministic workflow ids', async function run() {
    const recordingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const providerEventId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const workflow = createMockRecordingFinalizationWorkflow()
    const { worker } = createTestWorker({
      queryRowsBySqlIncludes: {
        'from realtimekit_webhook_events': [
          {
            provider_event_id: providerEventId,
            recording_id: recordingId,
            attempt_count: 1,
          },
        ],
      },
    })

    const env = {
      ...createMockEnv(),
      RECORDING_FINALIZATION_WORKFLOW: workflow,
    }

    await worker.scheduled(
      { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} },
      env,
    )

    expect(workflow.createBatch).toHaveBeenCalledWith([
      {
        id: `recording-finalize-v1-${recordingId}-2`,
        params: {
          provider_recording_id: recordingId,
          attempt: 2,
        },
      },
    ])
  })

  it('exhausts sweep checkpoints for candidates without a recording linkage', async function run() {
    const providerEventId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const workflow = createMockRecordingFinalizationWorkflow()
    const { worker } = createTestWorker({
      queryRowsBySqlIncludes: {
        'from realtimekit_webhook_events': [
          {
            provider_event_id: providerEventId,
            recording_id: null,
            attempt_count: 3,
          },
        ],
      },
    })

    const env = {
      ...createMockEnv(),
      RECORDING_FINALIZATION_WORKFLOW: workflow,
    }

    await worker.scheduled(
      { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} },
      env,
    )

    expect(workflow.createBatch).not.toHaveBeenCalled()
  })

  it('terminates candidates that reached the max sweep attempts', async function run() {
    const recordingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const providerEventId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    const workflow = createMockRecordingFinalizationWorkflow()
    const { worker, logs } = createTestWorker({
      queryRowsBySqlIncludes: {
        'from realtimekit_webhook_events': [
          {
            provider_event_id: providerEventId,
            recording_id: recordingId,
            attempt_count: 10,
          },
        ],
      },
    })

    const env = {
      ...createMockEnv(),
      RECORDING_FINALIZATION_WORKFLOW: workflow,
    }

    await worker.scheduled(
      { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} },
      env,
    )

    expect(workflow.createBatch).not.toHaveBeenCalled()
    expect(logs.errors).toContainEqual(
      expect.objectContaining({
        event: 'notification_orchestrator.sweep_exhausted',
      }),
    )
  })

  it('advances the sweep checkpoint with a delayed next attempt when workflow triggering fails', async function run() {
    const recordingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const providerEventId = '11111111-2222-4333-8444-555555555555'
    const workflow = createMockRecordingFinalizationWorkflow()
    workflow.createBatch.mockRejectedValueOnce(new Error('workflow engine unavailable'))
    const { worker, logs, queries } = createTestWorker({
      queryRowsBySqlIncludes: {
        'from realtimekit_webhook_events': [
          {
            provider_event_id: providerEventId,
            recording_id: recordingId,
            attempt_count: 1,
          },
        ],
      },
    })

    const env = {
      ...createMockEnv(),
      RECORDING_FINALIZATION_WORKFLOW: workflow,
    }

    await worker.scheduled(
      { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} },
      env,
    )

    expect(workflow.createBatch).toHaveBeenCalledTimes(1)
    expect(logs.errors).toContainEqual(
      expect.objectContaining({
        event: 'notification_orchestrator.sweep_workflow_trigger_failed',
      }),
    )

    const [checkpoint] = sweepCheckpointUpdates(queries)
    expect(checkpoint.values).toEqual([
      providerEventId,
      2,
      expect.any(String),
      null,
    ])
  })

  it('terminalizes the sweep checkpoint when a failed workflow trigger reaches the max attempt', async function run() {
    const recordingId = 'aaaaaaaa-0000-4000-8000-000000000001'
    const providerEventId = 'bbbbbbbb-1111-4111-8111-111111111111'
    const workflow = createMockRecordingFinalizationWorkflow()
    workflow.createBatch.mockRejectedValue(new Error('workflow engine unavailable'))
    const { worker, logs, queries } = createTestWorker({
      queryRowsBySqlIncludes: {
        'from realtimekit_webhook_events': [
          {
            provider_event_id: providerEventId,
            recording_id: recordingId,
            attempt_count: 9,
          },
        ],
      },
    })

    const env = {
      ...createMockEnv(),
      RECORDING_FINALIZATION_WORKFLOW: workflow,
    }

    await worker.scheduled(
      { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} },
      env,
    )

    expect(workflow.createBatch).toHaveBeenCalledTimes(1)
    expect(logs.errors).toContainEqual(
      expect.objectContaining({
        event: 'notification_orchestrator.sweep_exhausted',
      }),
    )

    const [checkpoint] = sweepCheckpointUpdates(queries)
    expect(checkpoint.values[0]).toBe(providerEventId)
    expect(checkpoint.values[1]).toBe(10)
    expect(checkpoint.values[2]).toBeNull()
    expect(typeof checkpoint.values[3]).toBe('string')
  })

  it('bounds repeated createBatch failures to the max attempt before terminal exhaustion', async function run() {
    const recordingId = 'cccccccc-2222-4222-8222-222222222222'
    const providerEventId = 'dddddddd-3333-4333-8333-333333333333'
    const candidates = [
      {
        provider_event_id: providerEventId,
        recording_id: recordingId,
        attempt_count: 0,
      },
    ]
    const workflow = createMockRecordingFinalizationWorkflow()
    workflow.createBatch.mockRejectedValue(new Error('workflow engine unavailable'))
    const { worker, queries } = createTestWorker({
      queryRowsBySqlIncludes: {
        'from realtimekit_webhook_events': candidates,
      },
    })

    const env = {
      ...createMockEnv(),
      RECORDING_FINALIZATION_WORKFLOW: workflow,
    }

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await worker.scheduled(
        { scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} },
        env,
      )
      // Simulate the checkpoint persisted by the previous failed trigger.
      candidates[0].attempt_count = attempt
    }

    const updates = sweepCheckpointUpdates(queries)
    expect(workflow.createBatch).toHaveBeenCalledTimes(10)
    expect(updates).toHaveLength(10)

    const delayed = updates.slice(0, 9)
    for (const update of delayed) {
      expect(typeof update.values[2]).toBe('string')
      expect(update.values[3]).toBeNull()
    }

    const [terminal] = updates.slice(-1)
    expect(terminal.values[1]).toBe(10)
    expect(terminal.values[2]).toBeNull()
    expect(typeof terminal.values[3]).toBe('string')
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

function createTestWorker(options?: {
  queryRowsBySqlIncludes?: Record<string, unknown[]>
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

  const mockPool = {
    async connect() {
      return {
        async query(text: string, values: unknown[]) {
          queries.push({ text, values })
          const normalizedSql = text.toLowerCase()
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
        async release() {},
      }
    },
  }

  const worker = createNotificationWorker({
    createPool: () => mockPool,
    console: mockConsole,
  })

  return { worker, queueSentMessages, logs, queries }
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

function createMockFeedbackWorkflow() {
  const createBatch = vi.fn(async () => {})
  return {
    createBatch,
  } as unknown as Workflow<FeedbackWorkflowPayload>
}

function createMockRecordingFinalizationWorkflow() {
  const createBatch = vi.fn(async () => [])
  return {
    createBatch,
  } as unknown as Workflow<RecordingFinalizationWorkflowPayload> & {
    createBatch: ReturnType<typeof vi.fn>
  }
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
