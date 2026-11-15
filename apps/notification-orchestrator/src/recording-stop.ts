import {
  createRealtimeKitRecordingProvider,
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
  'processStopHandoff' | 'sweepStopHandoffs'
>

export function createRecordingStopProcessor(
  env: RecordingStopBindings,
  queryExecutor: SqlQueryExecutor,
): RecordingStopHandoffProcessor | undefined {
  if (
    !env.CLOUDFLARE_ACCOUNT_ID ||
    !env.CLOUDFLARE_API_TOKEN ||
    !env.CLOUDFLARE_REALTIMEKIT_APP_ID
  ) {
    return undefined
  }

  return new RecordingStopService(
    new RecordingStopRepository(queryExecutor),
    createRealtimeKitRecordingProvider(env),
  )
}
