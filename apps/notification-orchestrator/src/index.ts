import {
  NotificationRepository,
  NotificationService,
  NotificationConsumerService,
  type NotificationConsumerServiceLogger,
  type NotificationDeliveryPort,
  NotificationDispatchService,
  type NotificationDispatchServiceLogger,
  type NotificationTransport,
  type NotificationTransportMessage,
  processWorkDue,
  sendWorkDue,
  workDueTransportMessageSchema,
  RECORDING_MAX_AGE_SECONDS,
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  interviewMatchCreatedEventSchema,
  interviewCompletedEventSchema,
  interviewPremiumBookedEventSchema,
  accountPrivacyCleanupRequestedEventSchema,
  reminderDueTransportMessageSchema,
  ArtifactRetentionRepository,
  ArtifactRetentionService,
  type ArtifactRetentionServiceLogger,
  resolveBatchLimit,
  createArtifactStorage,
  createR2BucketPort,
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
import {
  createRecordingStartSweeper,
  createRecordingStopProcessor,
  type RecordingStartSweeper,
  type RecordingStopHandoffProcessor,
} from './recording-stop'
import { sweepRecordingFinalizations } from './workflows/recording-finalization-sweep'
import { recoverStaleFeedbackForInterview, sweepStaleFeedbackProcessing } from './workflows/feedback-stale-processing-sweep'

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
  /** Optional Cloudflare API base override (local fakes); unset uses api.cloudflare.com. */
  CLOUDFLARE_API_BASE_URL?: string
  /** Workers AI binding used by Story 5.16 transcription and Story 5.17 analysis. */
  AI?: Ai
  /**
   * Optional AI Gateway base URL for Story 5.17 feedback analysis (same
   * binding/derivation as the Story 4.3 AI chat responder in backend-rest;
   * see `docs/infrastructure/backend.md`). Unlike AI chat, the feedback
   * analysis adapter requires a configured gateway and has no direct-call
   * fallback.
   */
  AI_GATEWAY_BASE_URL?: string
  /** Raw media retention window in days (Story 5.15); production default is 30. */
  ARTIFACT_RETENTION_DAYS?: string
  /** Deterministic per-run batch limit for the scheduled retention sweep. */
  ARTIFACT_CLEANUP_BATCH_LIMIT?: string
}
export type NotificationWorkerDependencies = {
  createPool: (connectionString: string) => {
    connect(): Promise<{
      query(text: string, values: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>
      release(): Promise<void>
    }>
  }
  console: Pick<Console, 'error' | 'log'>
  createRecordingStopProcessor?: (
    env: WorkerBindings,
    queryExecutor: SqlQueryExecutor,
  ) => RecordingStopHandoffProcessor | undefined
  createRecordingStartSweeper?: (
    env: WorkerBindings,
    queryExecutor: SqlQueryExecutor,
  ) => RecordingStartSweeper | undefined
}

// The queue allows 3 retries; after this many failed attempts the consumer
// stops waiting on the provider and hands off to feedback anyway.
const STOP_RETRY_ATTEMPTS_BEFORE_FEEDBACK = 3
// Unprocessed stop handoffs older than this still start feedback so feedback
// does not depend on provider availability.
const FEEDBACK_UNPROCESSED_AFTER_MS = 15 * 60_000

export function createNotificationWorker(dependencies: NotificationWorkerDependencies) {
  const { createPool, console: consoleLike } = dependencies
  const buildRecordingStopProcessor = dependencies.createRecordingStopProcessor ?? createRecordingStopProcessor
  const buildRecordingStartSweeper = dependencies.createRecordingStartSweeper ?? createRecordingStartSweeper

  async function triggerFeedbackWorkflow(env: WorkerBindings, interviewId: string): Promise<boolean> {
    // createBatch is idempotent, so duplicate triggers are safe.
    if (!env.FEEDBACK_WORKFLOW) {
      consoleLike.log('[notification-consumer] feedback_workflow_not_configured', {
        interview_id: interviewId,
      })
      return false
    }

    const instanceId = `feedback-v1-${interviewId}`
    await env.FEEDBACK_WORKFLOW.createBatch([
      { id: instanceId, params: { interview_id: interviewId, schema_version: 1 } },
    ])
    consoleLike.log('[notification-consumer] feedback_workflow_triggered', {
      interview_id: interviewId,
      instance_id: instanceId,
    })
    return true
  }

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
        const reminderTransport: NotificationTransport = {
          async send(message, options) {
            await env.NOTIFICATION_QUEUE.send(
              message,
              options ? { delaySeconds: options.delaySeconds } : undefined,
            )
          },
        }
        const workDueLogger = {
          error(event: string, context: Record<string, unknown>) {
            consoleLike.error(`notification_orchestrator.${event}`, context)
          },
        }
        const consumerService = new NotificationConsumerService(
          notificationService,
          undefined,
          consumerLogger,
          deliveryPort,
          reminderTransport,
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

              // Stop provider recordings (idempotent) before feedback handoff.
              // While attempts remain, a pending result retries the message.
              // Afterwards feedback proceeds anyway: it must not depend on
              // provider availability, and the scheduled sweep finishes the stop.
              const stopProcessor = buildRecordingStopProcessor(env, queryExecutor as SqlQueryExecutor)
              if (stopProcessor && message.attempts === 1) {
                // Backup for a failed feedback trigger; the hourly sweep covers a lost message.
                const sentAtMs = Date.now()
                await sendWorkDue(reminderTransport, workDueLogger, {
                  duty: 'feedback_deadline',
                  entityId: event.interview.id,
                  dueAtMs: sentAtMs + FEEDBACK_UNPROCESSED_AFTER_MS,
                  nowMs: sentAtMs,
                })
              }
              if (stopProcessor) {
                let stopFailed = false
                try {
                  stopFailed = (await stopProcessor.processStopHandoff(event.interview.id)) === 'retry'
                } catch (stopError) {
                  stopFailed = true
                  consoleLike.error('notification_orchestrator.recording_stop_error', {
                    interview_id: event.interview.id,
                    error_message: stopError instanceof Error ? stopError.message : String(stopError),
                  })
                }
                if (stopFailed) {
                  if (message.attempts < STOP_RETRY_ATTEMPTS_BEFORE_FEEDBACK) {
                    throw new Error('recording_stop_pending')
                  }
                  consoleLike.error('notification_orchestrator.recording_stop_deferred_to_sweep', {
                    interview_id: event.interview.id,
                  })
                }
              } else {
                consoleLike.log('[notification-consumer] recording_stop_not_configured', {
                  interview_id: event.interview.id,
                })
              }

              if (await triggerFeedbackWorkflow(env, event.interview.id)) {
                try {
                  await stopProcessor?.markFeedbackTriggered(event.interview.id)
                } catch (markError) {
                  // The sweep re-triggers idempotently if the marker is missing.
                  consoleLike.error('notification_orchestrator.feedback_marker_failed', {
                    interview_id: event.interview.id,
                    error_message: markError instanceof Error ? markError.message : String(markError),
                  })
                }
              }
            } else if (normalizedBody.event_type === 'interview.premium_booked') {
              const event = interviewPremiumBookedEventSchema.parse(normalizedBody)
              await consumerService.processInterviewPremiumBooked(event)
            } else if (normalizedBody.event_type === 'account.privacy_cleanup_requested') {
              const event = accountPrivacyCleanupRequestedEventSchema.parse(normalizedBody)
              const artifactRetentionService = createArtifactRetentionService(
                env,
                queryExecutor as SqlQueryExecutor,
                consoleLike,
              )

              if (!artifactRetentionService) {
                consoleLike.error('artifact_retention.privacy_cleanup_not_configured')
              } else {
                const counters = await artifactRetentionService.runPrivacyCleanupForUser(event.user_id)
                consoleLike.log('[artifact-retention] privacy_cleanup_completed', counters)
              }
            } else if (normalizedBody.message_type === 'reminder.due') {
              const reminderMessage = reminderDueTransportMessageSchema.parse(normalizedBody)
              await consumerService.processReminderDue(reminderMessage)
            } else if (normalizedBody.message_type === 'work.due') {
              const workDueMessage = workDueTransportMessageSchema.parse(normalizedBody)
              const stopProcessor = buildRecordingStopProcessor(env, queryExecutor as SqlQueryExecutor)
              const startService = buildRecordingStartSweeper(env, queryExecutor as SqlQueryExecutor)
              if (!stopProcessor || !startService) {
                consoleLike.error('notification_orchestrator.work_due_not_configured', {
                  message_id: message.id,
                  duty: workDueMessage.duty,
                })
              } else {
                await processWorkDue(workDueMessage, {
                  recordingStop: stopProcessor,
                  recordingStart: startService,
                  feedback: {
                    isFeedbackTriggered: (interviewId) => stopProcessor.isFeedbackTriggered(interviewId),
                    async triggerFeedback(interviewId) {
                      if (await triggerFeedbackWorkflow(env, interviewId)) {
                        await stopProcessor.markFeedbackTriggered(interviewId)
                      }
                    },
                    recoverStaleFeedback: (interviewId) =>
                      recoverStaleFeedbackForInterview(env, queryExecutor as SqlQueryExecutor, interviewId),
                  },
                  transport: reminderTransport,
                  logger: workDueLogger,
                  now: () => Date.now(),
                  maxAgeSeconds: RECORDING_MAX_AGE_SECONDS,
                })
              }
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

        try {
          await sweepStaleFeedbackProcessing(env, queryExecutor as SqlQueryExecutor, consoleLike)
        } catch (err) {
          consoleLike.error('feedback_stale_processing_sweep_failed', {
            error_message: err instanceof Error ? err.message : String(err),
          })
        }

        const sweepStopProcessor = buildRecordingStopProcessor(env, queryExecutor as SqlQueryExecutor)

        try {
          if (sweepStopProcessor) {
            const processedInterviewIds = await sweepStopProcessor.sweepStopHandoffs({
              olderThan: new Date(Date.now() - 2 * 60_000).toISOString(),
              limit: 20,
            })
            // Feedback trigger is durable: handoffs the sweep just finished,
            // processed handoffs whose feedback start never succeeded, and
            // handoffs the provider never let finish (older than 15 minutes)
            // all start feedback here. The instance id keeps it idempotent.
            const awaitingFeedback = env.FEEDBACK_WORKFLOW
              ? await sweepStopProcessor.listHandoffsAwaitingFeedback({
                  processedBefore: new Date(Date.now() - 2 * 60_000).toISOString(),
                  unprocessedBefore: new Date(Date.now() - FEEDBACK_UNPROCESSED_AFTER_MS).toISOString(),
                  limit: 20,
                })
              : []
            const feedbackIds = [...new Set([...processedInterviewIds, ...awaitingFeedback])]
            for (const interviewId of feedbackIds) {
              try {
                if (await triggerFeedbackWorkflow(env, interviewId)) {
                  await sweepStopProcessor.markFeedbackTriggered(interviewId)
                }
              } catch (err) {
                consoleLike.error('feedback_trigger_after_sweep_failed', {
                  interview_id: interviewId,
                  error_message: err instanceof Error ? err.message : String(err),
                })
                try {
                  await sweepStopProcessor.recordFeedbackFailure(interviewId)
                } catch {
                  // Failure tracking must not break the sweep.
                }
              }
            }
          }
        } catch (err) {
          consoleLike.error('recording_stop_sweep_failed', {
            error_message: err instanceof Error ? err.message : String(err),
          })
        }

        try {
          await sweepStopProcessor?.sweepOverdueRecordings({
            maxAgeSeconds: RECORDING_MAX_AGE_SECONDS,
            limit: 20,
          })
        } catch (err) {
          consoleLike.error('recording_overdue_sweep_failed', {
            error_message: err instanceof Error ? err.message : String(err),
          })
        }

        try {
          await buildRecordingStartSweeper(env, queryExecutor as SqlQueryExecutor)?.sweepStalePendingClaims({
            limit: 20,
          })
        } catch (err) {
          consoleLike.error('recording_start_sweep_failed', {
            error_message: err instanceof Error ? err.message : String(err),
          })
        }

        try {
          const artifactRetentionService = createArtifactRetentionService(
            env,
            queryExecutor as SqlQueryExecutor,
            consoleLike,
          )

          if (artifactRetentionService) {
            const batchLimit = resolveBatchLimit(env.ARTIFACT_CLEANUP_BATCH_LIMIT)
            const counters = await artifactRetentionService.runScheduledRetentionSweep(batchLimit)
            consoleLike.log('[artifact-retention] scheduled_sweep_completed', counters)
          }
        } catch (err) {
          consoleLike.error('artifact_retention_sweep_failed', {
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

// Story 5.15: isolated raw-artifact retention/cleanup service built on the
// existing scheduled notification-orchestrator boundary rather than
// unbounded R2 listing in request handlers. Returns null when neither bucket
// binding is configured so callers can skip the sweep gracefully.
function createArtifactRetentionService(
  env: WorkerBindings,
  queryExecutor: SqlQueryExecutor,
  consoleLike: Pick<Console, 'error' | 'log'>,
): ArtifactRetentionService | null {
  const recordingsBucket = env.RECORDINGS_BUCKET
  const screenshotsBucket = env.SCREENSHOTS_BUCKET

  if (!recordingsBucket && !screenshotsBucket) {
    return null
  }

  const storagePort = createArtifactStorage(
    recordingsBucket ? createR2BucketPort(recordingsBucket) : null,
    screenshotsBucket
      ? createR2BucketPort(screenshotsBucket)
      : noOpScreenshotBucketPort(),
  )

  const retentionLogger: ArtifactRetentionServiceLogger = {
    error(event, context) {
      consoleLike.error(`[artifact-retention] ${event}`, context)
    },
  }

  return new ArtifactRetentionService(
    new ArtifactRetentionRepository(queryExecutor),
    storagePort,
    undefined,
    retentionLogger,
  )
}

// Satisfies the screenshots bucket port contract when only the recordings
// bucket is configured; no screenshot artifact can exist without a real
// screenshots bucket, so this path is unreachable in practice.
function noOpScreenshotBucketPort(): Parameters<typeof createArtifactStorage>[1] {
  return {
    async put() {},
    async head() {
      return null
    },
    async get() {
      return null
    },
    async delete() {},
  }
}

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
