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
  interviewCompletedEventSchema,
  interviewPremiumBookedEventSchema,
  reminderDueTransportMessageSchema,
} from '@mako/shared-backend'
import { createPostgresConnectionPool, createSqlQuery, type SqlQueryExecutor } from '@mako/shared-backend'
import {
  InterviewFeedbackWorkflow,
  feedbackWorkflowPayloadSchema,
} from './workflows/feedback-workflow'
import type { FeedbackWorkflowPayload } from './workflows/feedback-workflow'
import {
  RecordingFinalizationWorkflow,
  recordingFinalizationPayloadSchema,
} from './workflows/recording-finalization-workflow'
import type { RecordingFinalizationPayload } from './workflows/recording-finalization-workflow'
import { sweepRecordingFinalizations } from './workflows/recording-finalization-sweep'

export { InterviewFeedbackWorkflow, feedbackWorkflowPayloadSchema }
export { RecordingFinalizationWorkflow, recordingFinalizationPayloadSchema }

export type WorkerBindings = {
  HYPERDRIVE: {
    connectionString: string
  }
  RECORDINGS_BUCKET?: R2Bucket
  SCREENSHOTS_BUCKET?: R2Bucket
  NOTIFICATION_QUEUE: Queue<NotificationTransportMessage>
  FEEDBACK_WORKFLOW?: Workflow<FeedbackWorkflowPayload>
  RECORDING_FINALIZATION_WORKFLOW?: Workflow<RecordingFinalizationPayload>
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_REALTIMEKIT_APP_ID?: string
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

            const normalizedBody = normalizeInterviewBookingChannel(parsedBody)

            if (normalizedBody.event_type === 'interview.created') {
              const event = interviewCreatedEventSchema.parse(normalizedBody)
              await consumerService.processInterviewCreated(event)
            } else if (normalizedBody.event_type === 'interview.cancelled') {
              const event = interviewCancelledEventSchema.parse(normalizedBody)
              await consumerService.processInterviewCancelled(event)
            } else if (normalizedBody.event_type === 'interview.match.created') {
              const event = interviewMatchCreatedEventSchema.parse(normalizedBody)
              await consumerService.processInterviewMatchCreated(event)
            } else if (normalizedBody.event_type === 'interview.completed') {
              const event = interviewCompletedEventSchema.parse(normalizedBody)

              // Trigger feedback workflow idempotently. createBatch is
              // idempotent, so duplicate interview.completed events are safe.
              if (env.FEEDBACK_WORKFLOW) {
                const instanceId = `feedback-v1-${event.interview.id}`
                await env.FEEDBACK_WORKFLOW.createBatch([
                  {
                    id: instanceId,
                    params: {
                      interview_id: event.interview.id,
                      schema_version: 1,
                    },
                  },
                ])
                consoleLike.log('[notification-consumer] feedback_workflow_triggered', {
                  interview_id: event.interview.id,
                  instance_id: instanceId,
                })
              } else {
                consoleLike.log('[notification-consumer] feedback_workflow_not_configured', {
                  interview_id: event.interview.id,
                })
              }

            } else if (normalizedBody.event_type === 'interview.premium_booked') {
              const event = interviewPremiumBookedEventSchema.parse(normalizedBody)
              await consumerService.processInterviewPremiumBooked(event)
            } else if (normalizedBody.message_type === 'reminder.due') {
              const reminderMessage = reminderDueTransportMessageSchema.parse(normalizedBody)
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

        try {
          await sweepRecordingFinalizations(env, queryExecutor as SqlQueryExecutor, consoleLike)
        } catch (err) {
          consoleLike.error('recording_finalization_sweep_failed', {
            error_message: err instanceof Error ? err.message : String(err),
          })
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

// Ingress fallback for legacy events: mixed-fleet producers and already-persisted
// outbox payloads may omit interview.booking_channel. Derive it from `mode`
// (ai_led → ai_direct, peer_to_peer → standard_match) so a missing channel
// never invalidates, acks-without-processing, or drops an event. Retained
// until old producers that omit booking_channel are drained and all
// pending/failed legacy outbox/queue payloads are drained or replayed through
// normalization; the persisted-row parser removed its equivalent fallback after
// the NOT NULL contraction (Story 7.11).
function normalizeInterviewBookingChannel(
  parsedBody: Record<string, unknown>,
): Record<string, unknown> {
  const interview = parsedBody.interview

  if (typeof interview !== 'object' || interview === null) {
    return parsedBody
  }

  const interviewRecord = interview as Record<string, unknown>
  const currentBookingChannel = interviewRecord.booking_channel

  if (currentBookingChannel === null || currentBookingChannel === undefined) {
    return {
      ...parsedBody,
      interview: {
        ...interviewRecord,
        booking_channel:
          interviewRecord.mode === 'ai_led' ? 'ai_direct' : 'standard_match',
      },
    }
  }

  return parsedBody
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
