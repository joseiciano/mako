import {
  NotificationRepository,
  NotificationService,
  NotificationConsumerService,
  type NotificationConsumerServiceLogger,
  type NotificationDeliveryPort,
  NotificationDispatchService,
  type NotificationDispatchServiceLogger,
  type NotificationTransportMessage,
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  interviewMatchCreatedEventSchema,
  reminderDueTransportMessageSchema,
} from '@mako/shared-backend'
import { createPostgresConnectionPool } from '@mako/shared-backend'

export type WorkerBindings = {
  HYPERDRIVE: {
    connectionString: string
  }
  RECORDINGS_BUCKET?: R2Bucket
  SCREENSHOTS_BUCKET?: R2Bucket
  NOTIFICATION_QUEUE: Queue<NotificationTransportMessage>
}

export type NotificationWorkerDependencies = {
  createPool: (connectionString: string) => {
    connect(): Promise<{
      query(text: string, values: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>
      release(): Promise<void>
    }>
  }
  console: Pick<Console, 'error' | 'log'>
}

export function createNotificationWorker(dependencies: NotificationWorkerDependencies) {
  const { createPool, console: consoleLike } = dependencies

  return {
    async queue(batch: MessageBatch<unknown>, env: WorkerBindings): Promise<void> {
      const connectionString = env.HYPERDRIVE?.connectionString
      if (!connectionString) {
        for (const message of batch.messages) {
          message.retry()
        }
        return
      }

      const pool = createPool(connectionString)
      const client = await pool.connect()

      try {
        const queryExecutor = {
          async query<Row>(queryInput: { text: string; values: readonly unknown[] }) {
            const result = await client.query(queryInput.text, [...queryInput.values])
            return {
              rows: result.rows as Row[],
              rowCount: result.rowCount ?? undefined,
            }
          },
        }

        const notificationRepository = new NotificationRepository({ queryExecutor })
        const notificationService = new NotificationService(notificationRepository)

        const consumerLogger: NotificationConsumerServiceLogger = {
          error(event, context) {
            consoleLike.error(`[notification-consumer] ${event}`, context)
          },
          warn(event, context) {
            consoleLike.error(`[notification-consumer.warn] ${event}`, context)
          },
        }
        const deliveryPort: NotificationDeliveryPort = {
          async send(input) {
            consoleLike.log('[notification-delivery]', {
              kind: input.kind,
              interview_id: input.interviewId,
              scheduled_at: input.scheduledAt,
              recipient_count: input.recipientUserIds.length,
              recipients: input.recipientUserIds,
              idempotency_key: input.idempotencyKey,
            })
          },
        }
        const consumerService = new NotificationConsumerService(
          notificationService,
          undefined,
          consumerLogger,
          deliveryPort,
        )

        for (const message of batch.messages) {
          try {
            const parsedBody = parseQueueMessageBody(message.body)

            if (!parsedBody) {
              consoleLike.error('notification_orchestrator.invalid_message', {
                message_id: message.id,
                ...extractSafeMessageMetadata(message.body),
              })
              message.ack()
              continue
            }

            if (parsedBody.event_type === 'interview.created') {
              const event = interviewCreatedEventSchema.parse(parsedBody)
              await consumerService.processInterviewCreated(event)
            } else if (parsedBody.event_type === 'interview.cancelled') {
              const event = interviewCancelledEventSchema.parse(parsedBody)
              await consumerService.processInterviewCancelled(event)
            } else if (parsedBody.event_type === 'interview.match.created') {
              const event = interviewMatchCreatedEventSchema.parse(parsedBody)
              await consumerService.processInterviewMatchCreated(event)
            } else if (parsedBody.message_type === 'reminder.due') {
              const reminderMessage = reminderDueTransportMessageSchema.parse(parsedBody)
              await consumerService.processReminderDue(reminderMessage)
            } else {
              consoleLike.error('notification_orchestrator.invalid_message', {
                message_id: message.id,
                ...extractSafeMessageMetadata(message.body),
              })
              message.ack()
              continue
            }

            message.ack()
          } catch (error) {
            if (isSchemaValidationError(error)) {
              consoleLike.error('notification_orchestrator.invalid_schema', {
                message_id: message.id,
                error_message: error instanceof Error ? error.message : String(error),
                ...extractSafeMessageMetadata(message.body),
                validation_issues: extractValidationIssues(error),
              })
              message.ack()
              continue
            }

            consoleLike.error('notification_orchestrator.processing_error', {
              message_id: message.id,
              error_message: error instanceof Error ? error.message : String(error),
              attempts: message.attempts,
            })

            message.retry()
          }
        }
      } finally {
        await client.release()
      }
    },

    async scheduled(_controller: ScheduledController, env: WorkerBindings): Promise<void> {
      const connectionString = env.HYPERDRIVE?.connectionString
      if (!connectionString) {
        consoleLike.error('notification_orchestrator.missing_hyperdrive')
        return
      }

      const pool = createPool(connectionString)
      const client = await pool.connect()

      try {
        const queryExecutor = {
          async query<Row>(queryInput: { text: string; values: readonly unknown[] }) {
            const result = await client.query(queryInput.text, [...queryInput.values])
            return {
              rows: result.rows as Row[],
              rowCount: result.rowCount ?? undefined,
            }
          },
        }

        const notificationRepository = new NotificationRepository({ queryExecutor })
        const notificationService = new NotificationService(notificationRepository)

        const dispatchLogger: NotificationDispatchServiceLogger = {
          error(event, context) {
            consoleLike.error(`[notification-dispatch] ${event}`, context)
          },
        }
        const dispatchService = new NotificationDispatchService(notificationService, undefined, dispatchLogger)

        const transport = {
          async send(message: NotificationTransportMessage) {
            await env.NOTIFICATION_QUEUE.send(message)
          },
        }

        await dispatchService.dispatchPendingOutboxEvents(transport, 50)
        await dispatchService.enqueueDueReminders(transport)
      } finally {
        await client.release()
      }
    },
  }
}

export class InterviewLifecycleWorkflow {
  async run(event: unknown, step: { do<T>(name: string, callback: () => Promise<T>): Promise<T> }) {
    await step.do('log-start', async () => {
      console.log('workflow started', JSON.stringify(event))
    })

    return {
      status: 'ok',
      workflow: 'interview-lifecycle',
    }
  }
}

const worker = createNotificationWorker({
  createPool: createPostgresConnectionPool,
  console,
})

export default worker

function isSchemaValidationError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown }).issues)
  ) {
    return true
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ZodError'
  )
}

function parseQueueMessageBody(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }
  return body as Record<string, unknown>
}

function extractSafeMessageMetadata(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) {
    return { payload_type: typeof body }
  }

  const record = body as Record<string, unknown>
  const metadata: Record<string, unknown> = {
    payload_type: typeof body,
  }

  if (typeof record.event_type === 'string') {
    metadata.event_type = record.event_type
  }
  if (typeof record.message_type === 'string') {
    metadata.message_type = record.message_type
  }
  if (typeof record.idempotency_key === 'string') {
    metadata.idempotency_key = record.idempotency_key
  }
  if (typeof record.event_id === 'string') {
    metadata.event_id = record.event_id
  }
  if (typeof record.interview_id === 'string') {
    metadata.interview_id = record.interview_id
  }

  if (
    typeof record.interview === 'object' &&
    record.interview !== null &&
    typeof (record.interview as Record<string, unknown>).id === 'string'
  ) {
    metadata.interview_id = (record.interview as Record<string, unknown>).id
  }

  return metadata
}

function extractValidationIssues(error: unknown): Array<{ path: (string | number)[]; message: string }> | undefined {
  if (!isSchemaValidationError(error)) {
    return undefined
  }

  const issues = (error as { issues: Array<{ path: (string | number)[]; message: string }> }).issues
  return issues.map((issue) => ({ path: issue.path, message: issue.message }))
}
