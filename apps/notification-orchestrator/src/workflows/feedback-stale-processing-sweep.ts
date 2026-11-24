import { createSqlQuery, type SqlQueryExecutor } from '@mako/shared-backend'
import type { WorkerBindings } from '../index'
import { STALE_HEARTBEAT_THRESHOLD_MINUTES } from './feedback-workflow'
import type { FeedbackStaleOutcome } from '@mako/shared-backend'

const SWEEP_LIMIT = 20

type RecoveredRow = {
  id: string
  prior_attempt_id: string | null
}

/** Fences stale `processing` rows back to `pending`; limited to one interview when an id is given. */
async function fenceStaleRows(
  queryExecutor: SqlQueryExecutor,
  interviewId?: string,
): Promise<RecoveredRow[]> {
  const result = await queryExecutor.query<RecoveredRow>(
    createSqlQuery(
      `
        WITH stale AS (
          SELECT id, feedback_attempt_id AS prior_attempt_id
          FROM interviews
          WHERE feedback_status = 'processing'
            AND feedback_processing_heartbeat_at < NOW() - ($1 || ' minutes')::interval
            ${interviewId ? 'AND id = $3' : ''}
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
      interviewId
        ? [String(STALE_HEARTBEAT_THRESHOLD_MINUTES), SWEEP_LIMIT, interviewId]
        : [String(STALE_HEARTBEAT_THRESHOLD_MINUTES), SWEEP_LIMIT],
    ),
  )
  return result.rows
}

/**
 * By-id variant run from a delayed work.due message. Throws on failure so the
 * queue retries. Resolved when the row is no longer processing; early (with
 * the new deadline) when the heartbeat was refreshed.
 */
export async function recoverStaleFeedbackForInterview(
  env: WorkerBindings,
  queryExecutor: SqlQueryExecutor,
  interviewId: string,
  nowMs: number = Date.now(),
): Promise<FeedbackStaleOutcome> {
  const workflow = env.FEEDBACK_WORKFLOW
  if (!workflow) return { outcome: 'resolved' }

  const rows = await fenceStaleRows(queryExecutor, interviewId)
  if (rows.length > 0) {
    const instanceId = `feedback-v1-${interviewId}-recovered-${nowMs}`
    await workflow.create({
      id: instanceId,
      params: { interview_id: interviewId, schema_version: 1 },
    })
    return { outcome: 'recovered' }
  }

  const state = await queryExecutor.query<{
    feedback_status: string
    feedback_processing_heartbeat_at: string | Date | null
  }>(
    createSqlQuery(
      `SELECT feedback_status, feedback_processing_heartbeat_at FROM interviews WHERE id = $1;`,
      [interviewId],
    ),
  )
  const row = state.rows[0]
  if (!row || row.feedback_status !== 'processing' || !row.feedback_processing_heartbeat_at) {
    return { outcome: 'resolved' }
  }
  return {
    outcome: 'early',
    dueAtMs:
      new Date(row.feedback_processing_heartbeat_at).getTime() +
      STALE_HEARTBEAT_THRESHOLD_MINUTES * 60_000,
  }
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
    rows = await fenceStaleRows(queryExecutor)
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
