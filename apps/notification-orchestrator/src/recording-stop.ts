import {
  createRealtimeKitRecordingProvider,
  RecordingControlRepository,
  RecordingControlService,
  RecordingStopRepository,
  RecordingStopService,
  type SqlQueryExecutor,
} from '@mako/shared-backend'

type RecordingStopBindings = {
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_REALTIMEKIT_APP_ID?: string
}

export type RecordingStopHandoffProcessor = Pick<
  RecordingStopService,
  'processStopHandoff' | 'sweepStopHandoffs' | 'sweepOverdueRecordings'
>

export type RecordingStartSweeper = Pick<RecordingControlService, 'sweepStalePendingClaims'>

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
  )
}
