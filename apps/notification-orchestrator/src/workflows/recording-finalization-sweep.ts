import { createSqlQuery, type SqlQueryExecutor } from '@mako/shared-backend'
import type { WorkerBindings } from '../index'

const SWEEP_LIMIT = 20

export async function sweepRecordingFinalizations(
  env: WorkerBindings,
  queryExecutor: SqlQueryExecutor,
  consoleLike: Pick<Console, 'error' | 'log'>,
): Promise<void> {
  const workflow = env.RECORDING_FINALIZATION_WORKFLOW
  if (!workflow) return

  let rows: Array<{ provider_recording_id: string }>
  try {
    const result = await queryExecutor.query<{ provider_recording_id: string }>(
      createSqlQuery(
        `SELECT provider_recording_id FROM interview_recordings WHERE provider_status = 'UPLOADED' AND finalization_status IN ('pending','failed','processing') LIMIT ${SWEEP_LIMIT}`,
      ),
    )
    rows = result.rows
  } catch (err) {
    consoleLike.error('recording_finalization_sweep_query_failed', {
      error_message: err instanceof Error ? err.message : String(err),
    })
    return
  }

  if (rows.length === 0) return

  const batch = rows.map((r) => ({
    id: `recording-finalization-v1-${r.provider_recording_id}`,
    params: { recording_id: r.provider_recording_id, schema_version: 1 as const },
  }))

  let created: unknown
  try {
    created = await workflow.createBatch(batch as never)
  } catch (err) {
    consoleLike.error('recording_finalization_sweep_failed', {
      error_message: err instanceof Error ? err.message : String(err),
      provider_count: String(rows.length),
    })
    return
  }

  // Handle deterministic dedupe: restart terminal instances for skipped IDs
  let skippedIds: string[] = []
  if (Array.isArray(created)) {
    const createdIds = new Set((created as Array<{ id?: string }>).map((c) => String(c.id ?? '')))
    skippedIds = batch.filter((b) => !createdIds.has(b.id)).map((b) => b.id)
  }

  if (skippedIds.length === 0) return

  const maybeGet = (workflow as unknown as { get?: (id: string) => Promise<unknown> }).get
  if (typeof maybeGet !== 'function') return

  for (const id of skippedIds) {
    try {
      const instance = (await maybeGet.call(workflow, id)) as
        | { status: () => Promise<{ status: string; output?: unknown }>; restart: () => Promise<void> }
        | null
        | undefined
      if (!instance || typeof instance.status !== 'function') continue
      const statusResult = await instance.status()
      const s = String(statusResult.status ?? '').toLowerCase()
      if (s === 'errored' || s === 'terminated') {
        await instance.restart()
      } else if (s === 'complete' || s === 'completed') {
        const output = statusResult.output
        if (output !== null && typeof output === 'object' && !Array.isArray(output) && 'status' in output) {
          const outStatus = output.status
          if (typeof outStatus === 'string' && outStatus.toLowerCase() === 'failed') {
            await instance.restart()
          }
        }
      } else {
        // running/waiting: leave alone
      }
    } catch (err) {
      consoleLike.error('recording_finalization_sweep_restart_failed', {
        instance_id: id,
        error_message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
