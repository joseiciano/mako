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
  type PostgresConnectionPool,
  type RecordingFinalizationRepositoryPort,
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

export type RecordingFinalizationRecoveryRepository = Pick<
  RecordingFinalizationRepositoryPort,
  'failJob' | 'markEventFailed' | 'releaseClaim'
>

export type RecordingFinalizationRecoveryInput = {
  repository: RecordingFinalizationRecoveryRepository
  providerRecordingId: string
  errorCode: string
  failedAt: string
  attempt: number
  logError: (event: string, context: Record<string, unknown>) => void
}

// Testable seam around the catch-path recovery. Checkpointing a finalization
// failure can itself fail (job/event rows unavailable); this helper then
// releases the processing claim back to pending so a scheduled retry can claim
// the job again, and reports both failures through the given logger. It never
// throws: recovery failures must not mask the original finalization error,
// which the caller rethrows.
export async function checkpointRecordingFinalizationError(
  input: RecordingFinalizationRecoveryInput,
): Promise<void> {
  const { repository, providerRecordingId, errorCode, failedAt, attempt, logError } =
    input

  try {
    await repository.failJob(providerRecordingId, errorCode, 'workflow_error', failedAt)
    await repository.markEventFailed(
      providerRecordingId,
      errorCode,
      addMilliseconds(failedAt, DEFAULT_REALTIMEKIT_SWEEP_DELAY_MS),
    )
  } catch (checkpointError) {
    // Checkpointing the failure itself failed: the job may still hold the
    // processing claim, which would strand it until a sweeper notices.
    // Release the claim back to pending so a scheduled retry can claim the
    // job again, then report the checkpoint failure.
    try {
      await repository.releaseClaim(providerRecordingId, failedAt)
    } catch (releaseError) {
      logError('recording_finalization.release_claim_failure', {
        error_code: errorCode,
        release_error:
          releaseError instanceof Error ? releaseError.message : String(releaseError),
      })
    }

    logError('recording_finalization.checkpoint_failure', {
      error_code: errorCode,
      checkpoint_error:
        checkpointError instanceof Error
          ? checkpointError.message
          : String(checkpointError),
    })
  }
}

export class RecordingFinalizationWorkflow extends WorkflowEntrypoint<
  WorkerBindings,
  RecordingFinalizationWorkflowPayload
> {
  constructor(
    ctx: ExecutionContext,
    env: WorkerBindings,
    private readonly poolFactory: (
      connectionString: string,
    ) => Pick<PostgresConnectionPool, 'connect' | 'end'> = createPostgresConnectionPool,
  ) {
    super(ctx, env)
  }

  async run(
    event: Readonly<WorkflowEvent<RecordingFinalizationWorkflowPayload>>,
    step: WorkflowStep,
  ) {
    const payload = recordingFinalizationWorkflowPayloadSchema.parse(event.payload)
    const env = this.env

    const recordingsBucketPort = env.RECORDINGS_BUCKET
      ? createR2BucketPort(env.RECORDINGS_BUCKET)
      : null

    if (!recordingsBucketPort) {
      return {
        provider_recording_id: payload.provider_recording_id,
        attempt: payload.attempt,
        status: 'failed',
        reason: 'RECORDINGS_BUCKET binding is not configured',
      }
    }

    const { queryExecutor, cleanup } = createWorkflowQueryExecutor(env, this.poolFactory)
    const repository = new RecordingFinalizationRepository({ queryExecutor })

    let failure: unknown
    let result: { status: 'failed'; reason: string } | { provider_recording_id: string; attempt: number; status: string; [key: string]: unknown } | null = null

    try {
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

      const finalizeResult = await step.do(STEP_FINALIZE_RECORDING, async function finalizeRecording() {
        return service.finalizeRecording(
          payload.provider_recording_id,
          event.timestamp.toISOString(),
        )
      })

      result = {
        provider_recording_id: payload.provider_recording_id,
        attempt: payload.attempt,
        ...finalizeResult,
      }
    } catch (error) {
      failure = error
      const errorCode = mapRecordingFinalizationError(error)
      const failedAt = new Date().toISOString()

      await checkpointRecordingFinalizationError({
        repository,
        providerRecordingId: payload.provider_recording_id,
        errorCode,
        failedAt,
        attempt: payload.attempt,
        logError(event, context) {
          console.error({
            event,
            component: 'RecordingFinalizationWorkflow',
            provider_recording_id: payload.provider_recording_id,
            attempt: payload.attempt,
            ...context,
          })
        },
      })
    }

    try {
      await cleanup()
    } catch (cleanupError) {
      if (failure === undefined) {
        throw cleanupError
      }
      console.error({
        event: 'recording_finalization.cleanup_failure',
        component: 'RecordingFinalizationWorkflow',
        provider_recording_id: payload.provider_recording_id,
        attempt: payload.attempt,
        cleanup_error:
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    }

    if (failure !== undefined) {
      throw failure
    }

    if (result === null) {
      throw new Error('recording_finalization_run_outcome_missing')
    }

    return result
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

export function createWorkflowQueryExecutor(
  env: WorkerBindings,
  createPool: (
    connectionString: string,
  ) => Pick<PostgresConnectionPool, 'connect' | 'end'> = createPostgresConnectionPool,
): {
  queryExecutor: SqlQueryExecutor
  cleanup: () => Promise<void>
} {
  const connectionString = env.HYPERDRIVE?.connectionString
  if (!connectionString) {
    throw new Error('HYPERDRIVE binding is not configured')
  }

  const pool = createPool(connectionString)
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
      let cleanupError: unknown

      if (clientPromise) {
        try {
          const client = await clientPromise
          await client.release()
        } catch (error) {
          cleanupError = error
        }
      }

      clientPromise = null

      try {
        await pool.end()
      } catch (error) {
        if (cleanupError === undefined) {
          cleanupError = error
        }
      }

      if (cleanupError !== undefined) {
        throw cleanupError
      }
    },
  }
}
