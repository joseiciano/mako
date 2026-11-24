import {
  createRealtimeKitRecordingProvider,
  RecordingControlRepository,
  RecordingControlService,
  RecordingStopRepository,
  RecordingStopService,
  type NotificationTransportMessage,
  type SqlQueryExecutor,
} from '@mako/shared-backend'

type RecordingStopBindings = {
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_REALTIMEKIT_APP_ID?: string
  CLOUDFLARE_API_BASE_URL?: string
  NOTIFICATION_QUEUE?: Pick<Queue<NotificationTransportMessage>, 'send'>
}

export type RecordingStopHandoffProcessor = Pick<
  RecordingStopService,
  | 'processStopHandoff'
  | 'sweepStopHandoffs'
  | 'sweepOverdueRecordings'
  | 'closeOverdueRecordingsForInterview'
  | 'listHandoffsAwaitingFeedback'
  | 'markFeedbackTriggered'
  | 'isFeedbackTriggered'
  | 'recordFeedbackFailure'
>

export type RecordingStartSweeper = Pick<RecordingControlService, 'sweepStalePendingClaims' | 'ensureRecordingStarted'>

function hasRealtimeKitCredentials(env: RecordingStopBindings): boolean {
  return Boolean(
    env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_REALTIMEKIT_APP_ID,
  )
}

export function createRecordingStartSweeper(
  env: RecordingStopBindings,
  queryExecutor: SqlQueryExecutor,
): RecordingStartSweeper | undefined {
  if (!hasRealtimeKitCredentials(env)) return undefined

  return new RecordingControlService(
    new RecordingControlRepository(queryExecutor),
    createRealtimeKitRecordingProvider(env),
    {
      error(event, context) {
        console.error({ event, component: 'RecordingControl', ...context })
      },
    },
    undefined,
    undefined,
    env.NOTIFICATION_QUEUE
      ? {
          async send(message, options) {
            await env.NOTIFICATION_QUEUE!.send(
              message,
              options ? { delaySeconds: options.delaySeconds } : undefined,
            )
          },
        }
      : undefined,
  )
}

export function createRecordingStopProcessor(
  env: RecordingStopBindings,
  queryExecutor: SqlQueryExecutor,
): RecordingStopHandoffProcessor | undefined {
  if (!hasRealtimeKitCredentials(env)) return undefined

  return new RecordingStopService(
    new RecordingStopRepository(queryExecutor),
    createRealtimeKitRecordingProvider(env),
    undefined,
    {
      error(event, context) {
        console.error({ event, component: 'RecordingStop', ...context })
      },
    },
  )
}
