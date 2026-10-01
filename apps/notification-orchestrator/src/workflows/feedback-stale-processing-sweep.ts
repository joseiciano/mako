import { createSqlQuery, type SqlQueryExecutor } from '@mako/shared-backend'
import type { WorkerBindings } from '../index'

/**
 * A `processing` feedback row whose heartbeat is older than this is treated
 * as a zombie attempt: the Workflow instance that owns it crashed, was
 * evicted, or otherwise stopped heartbeating without ever reaching a
 * terminal status. Comfortably above the sum of this workflow's own bounded
 * per-step wait/retry budgets so an attempt that is still legitimately
 * working is never fenced out from under itself.
 */
const STALE_HEARTBEAT_THRESHOLD_MINUTES = 20
const SWEEP_LIMIT = 20

type RecoveredRow = {
  id: string
  prior_attempt_id: string | null
}

/**
 * Story 5.18 stale-processing recovery: atomically fences every
 * sufficiently-stale `processing` interview back to `pending` (clearing
 * `feedback_attempt_id` so any write the crashed attempt still makes lands
 * as a safe no-op) and starts one uniquely suffixed replacement workflow
 * instance per recovered interview. This is fully automatic infrastructure
 * self-healing, distinct from the operator-only `FeedbackReplayService` path
 * for genuinely `failed` interviews.
 */
export async function sweepStaleFeedbackProcessing(
  env: WorkerBindings,
  queryExecutor: SqlQueryExecutor,
  consoleLike: Pick<Console, 'error' | 'log'>,
): Promise<void> {
  const workflow = env.FEEDBACK_WORKFLOW
  if (!workflow) return

  let rows: RecoveredRow[]
  try {
    const result = await queryExecutor.query<RecoveredRow>(
      createSqlQuery(
        `
          WITH stale AS (
            SELECT id, feedback_attempt_id AS prior_attempt_id
            FROM interviews
            WHERE feedback_status = 'processing'
              AND feedback_processing_heartbeat_at < NOW() - ($1 || ' minutes')::interval
            ORDER BY feedback_processing_heartbeat_at ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          )
          UPDATE interviews i
          SET feedback_status = 'pending',
              feedback_attempt_id = NULL,
              feedback_processing_started_at = NULL,
              feedback_processing_heartbeat_at = NULL,
              feedback_prompt_version = NULL,
              updated_at = NOW()
          FROM stale
          WHERE i.id = stale.id
          RETURNING i.id, stale.prior_attempt_id;
        `,
        [String(STALE_HEARTBEAT_THRESHOLD_MINUTES), SWEEP_LIMIT],
      ),
    )
    rows = result.rows
  } catch (err) {
    consoleLike.error('feedback_stale_processing_sweep_query_failed', {
      error_message: err instanceof Error ? err.message : String(err),
    })
    return
  }

  if (rows.length === 0) return

  for (const row of rows) {
    const instanceId = `feedback-v1-${row.id}-recovered-${Date.now()}`
    try {
      await workflow.create({
        id: instanceId,
        params: { interview_id: row.id, schema_version: 1 },
      })
      consoleLike.log('feedback_stale_processing_recovered', {
        interview_id: row.id,
        prior_attempt_fenced: row.prior_attempt_id !== null,
        new_instance_id: instanceId,
      })
    } catch (err) {
      consoleLike.error('feedback_stale_processing_recovery_trigger_failed', {
        interview_id: row.id,
        error_message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
