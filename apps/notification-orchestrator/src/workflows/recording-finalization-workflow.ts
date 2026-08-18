import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import { z } from 'zod'
import {
  createPostgresConnectionPool,
  createArtifactStorage,
  createR2BucketPort,
  createRealtimeKitRecordingClient,
  RecordingFinalizationRepository,
  RecordingFinalizationService,
  RealtimeKitRecordingClientError,
  RealtimeKitInvalidProviderAssetError,
  REALTIMEKIT_SAFE_ERROR_CODES,
  DEFAULT_REALTIMEKIT_SWEEP_DELAY_MS,
  type PostgresConnectionClient,
  type SqlQueryExecutor,
} from '@mako/shared-backend'
import type { WorkerBindings } from '../index'

export const recordingFinalizationWorkflowPayloadSchema = z
  .object({
    provider_recording_id: z.string().min(1),
    attempt: z.number().int().nonnegative(),
  })
  .strict()

export type RecordingFinalizationWorkflowPayload = z.infer<typeof recordingFinalizationWorkflowPayloadSchema>

// Stable step names
export const STEP_FINALIZE_RECORDING = 'finalize-recording'
export const STEP_FINALIZE = STEP_FINALIZE_RECORDING

export class RecordingFinalizationWorkflow extends WorkflowEntrypoint<
  WorkerBindings,
  RecordingFinalizationWorkflowPayload
> {
  async run(
    event: Readonly<WorkflowEvent<RecordingFinalizationWorkflowPayload>>,
    step: WorkflowStep,
  ) {
    const payload = recordingFinalizationWorkflowPayloadSchema.parse(event.payload)
    const env = this.env
    const { queryExecutor, cleanup } = createWorkflowQueryExecutor(env)
    const repository = new RecordingFinalizationRepository({ queryExecutor })

    try {
      const recordingsBucketPort = env.RECORDINGS_BUCKET
        ? createR2BucketPort(env.RECORDINGS_BUCKET)
        : null

      if (!recordingsBucketPort) {
        return { status: 'failed', reason: 'recordings_bucket_not_configured' }
      }

      const storage = createArtifactStorage(recordingsBucketPort, recordingsBucketPort)

      const providerClient = createRealtimeKitRecordingClient({
        CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_REALTIMEKIT_APP_ID: env.CLOUDFLARE_REALTIMEKIT_APP_ID,
      })

      const service = new RecordingFinalizationService({
        repository,
        storage,
        providerClient,
        fetch: globalThis.fetch,
        logger: {
          info(event, context) {
            console.info({
              event,
              component: 'RecordingFinalizationWorkflow',
              provider_recording_id: payload.provider_recording_id,
              attempt: payload.attempt,
              ...context,
            })
          },
          warn(event, context) {
            console.warn({
              event,
              component: 'RecordingFinalizationWorkflow',
              provider_recording_id: payload.provider_recording_id,
              attempt: payload.attempt,
              ...context,
            })
          },
          error(event, context) {
            console.error({
              event,
              component: 'RecordingFinalizationWorkflow',
              provider_recording_id: payload.provider_recording_id,
              attempt: payload.attempt,
              ...context,
            })
          },
        },
      })

      const result = await step.do(STEP_FINALIZE_RECORDING, async function finalizeRecording() {
        return service.finalizeRecording(
          payload.provider_recording_id,
          event.timestamp.toISOString(),
        )
      })

      return {
        provider_recording_id: payload.provider_recording_id,
        attempt: payload.attempt,
        ...result,
      }
    } catch (error) {
      const errorCode = mapRecordingFinalizationError(error)
      const failedAt = new Date().toISOString()

      try {
        await repository.failJob(
          payload.provider_recording_id,
          errorCode,
          'workflow_error',
          failedAt,
        )
        await repository.markEventFailed(
          payload.provider_recording_id,
          errorCode,
          addMilliseconds(failedAt, DEFAULT_REALTIMEKIT_SWEEP_DELAY_MS),
        )
      } catch (checkpointError) {
        console.error({
          event: 'recording_finalization.checkpoint_failure',
          provider_recording_id: payload.provider_recording_id,
          attempt: payload.attempt,
          error_code: errorCode,
          checkpoint_error: checkpointError instanceof Error
            ? checkpointError.message
            : String(checkpointError),
        })
      }

      throw error
    } finally {
      await cleanup()
    }
  }
}

export function mapRecordingFinalizationError(error: unknown): string {
  if (error instanceof RealtimeKitInvalidProviderAssetError) {
    return REALTIMEKIT_SAFE_ERROR_CODES.invalid_provider_asset
  }

  if (error instanceof RealtimeKitRecordingClientError) {
    return REALTIMEKIT_SAFE_ERROR_CODES.provider_download_failed
  }

  return REALTIMEKIT_SAFE_ERROR_CODES.internal_error
}

function addMilliseconds(timestamp: string, millis: number): string {
  return new Date(new Date(timestamp).getTime() + millis).toISOString()
}

function createWorkflowQueryExecutor(env: WorkerBindings): {
  queryExecutor: SqlQueryExecutor
  cleanup: () => Promise<void>
} {
  const connectionString = env.HYPERDRIVE?.connectionString
  if (!connectionString) {
    throw new Error('HYPERDRIVE binding is not configured')
  }

  const pool = createPostgresConnectionPool(connectionString)
  let clientPromise: Promise<PostgresConnectionClient> | null = null

  return {
    queryExecutor: {
      async query<Row>(queryInput: { text: string; values: readonly unknown[] }) {
        if (!clientPromise) {
          clientPromise = pool.connect()
        }
        const client = await clientPromise
        const result = await client.query(queryInput.text, [...queryInput.values])
        return {
          rows: result.rows as Row[],
          rowCount: result.rowCount ?? undefined,
        }
      },
    },
    async cleanup() {
      if (clientPromise) {
        const client = await clientPromise
        await client.release()
      }
    },
  }
}
