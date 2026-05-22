import {
  NotificationRepository,
  NotificationService,
  NotificationConsumerService,
  NotificationDispatchService,
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
        const consumerService = new NotificationConsumerService(notificationService)

        for (const message of batch.messages) {
          try {
            const parsedBody = parseQueueMessageBody(message.body)

            if (!parsedBody) {
              consoleLike.error('notification_orchestrator.invalid_message', {
                message_id: message.id,
                body: message.body,
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
                body: message.body,
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
                body: message.body,
              })
              message.ack()
              continue
            }

            consoleLike.error('notification_orchestrator.processing_error', {
              message_id: message.id,
              error_message: error instanceof Error ? error.message : String(error),
              attempts: message.attempts,
            })

            if (message.attempts >= 3) {
              message.ack()
            } else {
              message.retry()
            }
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
        const dispatchService = new NotificationDispatchService(notificationService)

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
