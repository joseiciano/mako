import { describe, expect, it, vi } from 'vitest'
import { recoverStaleFeedbackForInterview, sweepStaleFeedbackProcessing } from './feedback-stale-processing-sweep'
import { STALE_HEARTBEAT_THRESHOLD_MINUTES } from './feedback-workflow'
import type { WorkerBindings } from '../index'
import type { SqlQuery, SqlQueryExecutor } from '@mako/shared-backend'

function createMockQueryExecutor(
  rows: Array<{ id: string; prior_attempt_id: string | null }>,
): SqlQueryExecutor & { queries: SqlQuery[] } {
  const queries: SqlQuery[] = []
  return {
    queries,
    async query<Row>(query: SqlQuery) {
      queries.push(query)
      return { rows: rows as Row[], rowCount: rows.length }
    },
  }
}

function createConsoleLike() {
  return { error: vi.fn(), log: vi.fn() }
}

describe('sweepStaleFeedbackProcessing', function suite() {
  it('does nothing when FEEDBACK_WORKFLOW is not configured', async function run() {
    const env = {} as WorkerBindings
    const queryExecutor = createMockQueryExecutor([])
    const consoleLike = createConsoleLike()

    await sweepStaleFeedbackProcessing(env, queryExecutor, consoleLike)

    expect(queryExecutor.queries).toHaveLength(0)
  })

  it('does nothing when no rows are stale', async function run() {
    const create = vi.fn()
    const env = { FEEDBACK_WORKFLOW: { create } } as unknown as WorkerBindings
    const queryExecutor = createMockQueryExecutor([])
    const consoleLike = createConsoleLike()

    await sweepStaleFeedbackProcessing(env, queryExecutor, consoleLike)

    expect(create).not.toHaveBeenCalled()
  })

  it('fences stale attempts and starts one uniquely suffixed replacement instance per row', async function run() {
    const create = vi.fn().mockResolvedValue(undefined)
    const env = { FEEDBACK_WORKFLOW: { create } } as unknown as WorkerBindings
    const queryExecutor = createMockQueryExecutor([
      { id: 'interview-1', prior_attempt_id: 'attempt-old-1' },
      { id: 'interview-2', prior_attempt_id: 'attempt-old-2' },
    ])
    const consoleLike = createConsoleLike()

    await sweepStaleFeedbackProcessing(env, queryExecutor, consoleLike)

    expect(create).toHaveBeenCalledTimes(2)
    const [firstCallArgs] = create.mock.calls[0] as [{ id: string; params: { interview_id: string; schema_version: number } }]
    expect(firstCallArgs.id).toMatch(/^feedback-v1-interview-1-recovered-\d+$/)
    expect(firstCallArgs.params).toEqual({ interview_id: 'interview-1', schema_version: 1 })

    const [secondCallArgs] = create.mock.calls[1] as [{ id: string }]
    expect(secondCallArgs.id).toMatch(/^feedback-v1-interview-2-recovered-\d+$/)

    // The fencing/reset query uses the heartbeat age and clears feedback_attempt_id.
    const fenceQuery = queryExecutor.queries[0]!
    expect(fenceQuery.text).toContain("feedback_status = 'processing'")
    expect(fenceQuery.text).toContain("SET feedback_status = 'pending'")
    expect(fenceQuery.text).toContain('feedback_attempt_id = NULL')
    expect(consoleLike.log).toHaveBeenCalledTimes(2)
  })

  it('logs and continues when the fencing query itself fails', async function run() {
    const create = vi.fn()
    const env = { FEEDBACK_WORKFLOW: { create } } as unknown as WorkerBindings
    const queryExecutor: SqlQueryExecutor = {
      async query() {
        throw new Error('connection reset')
      },
    }
    const consoleLike = createConsoleLike()

    await sweepStaleFeedbackProcessing(env, queryExecutor, consoleLike)

    expect(consoleLike.error).toHaveBeenCalledWith(
      'feedback_stale_processing_sweep_query_failed',
      expect.objectContaining({ error_message: expect.stringContaining('connection reset') }),
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('logs and continues when triggering one recovered instance fails, without blocking the others', async function run() {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('workflow unavailable'))
      .mockResolvedValueOnce(undefined)
    const env = { FEEDBACK_WORKFLOW: { create } } as unknown as WorkerBindings
    const queryExecutor = createMockQueryExecutor([
      { id: 'interview-1', prior_attempt_id: 'attempt-old-1' },
      { id: 'interview-2', prior_attempt_id: 'attempt-old-2' },
    ])
    const consoleLike = createConsoleLike()

    await sweepStaleFeedbackProcessing(env, queryExecutor, consoleLike)

    expect(create).toHaveBeenCalledTimes(2)
    expect(consoleLike.error).toHaveBeenCalledWith(
      'feedback_stale_processing_recovery_trigger_failed',
      expect.objectContaining({ interview_id: 'interview-1' }),
    )
    expect(consoleLike.log).toHaveBeenCalledWith(
      'feedback_stale_processing_recovered',
      expect.objectContaining({ interview_id: 'interview-2' }),
    )
  })
})

describe('recoverStaleFeedbackForInterview', function suite() {
  const nowMs = Date.parse('2026-05-22T10:00:00.000Z')

  function executor(results: unknown[][]): SqlQueryExecutor & { queries: SqlQuery[] } {
    const queries: SqlQuery[] = []
    return {
      queries,
      async query<Row>(query: SqlQuery) {
        queries.push(query)
        const rows = results.shift() ?? []
        return { rows: rows as Row[], rowCount: rows.length }
      },
    }
  }

  it('fences only the given interview and starts a recovered instance', async function run() {
    const create = vi.fn().mockResolvedValue(undefined)
    const env = { FEEDBACK_WORKFLOW: { create } } as unknown as WorkerBindings
    const qe = executor([[{ id: 'interview-1', prior_attempt_id: 'a' }]])

    const result = await recoverStaleFeedbackForInterview(env, qe, 'interview-1', nowMs)

    expect(result).toEqual({ outcome: 'recovered' })
    expect(qe.queries[0]!.text).toContain('AND id = $3')
    expect(qe.queries[0]!.values).toContain('interview-1')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('is resolved when the row is no longer processing', async function run() {
    const create = vi.fn()
    const env = { FEEDBACK_WORKFLOW: { create } } as unknown as WorkerBindings
    const qe = executor([[], [{ feedback_status: 'ready', feedback_processing_heartbeat_at: null }]])

    expect(await recoverStaleFeedbackForInterview(env, qe, 'interview-1', nowMs)).toEqual({
      outcome: 'resolved',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('is early with the new deadline when the heartbeat was refreshed', async function run() {
    const create = vi.fn()
    const env = { FEEDBACK_WORKFLOW: { create } } as unknown as WorkerBindings
    const heartbeat = new Date(nowMs - 60_000).toISOString()
    const qe = executor([
      [],
      [{ feedback_status: 'processing', feedback_processing_heartbeat_at: heartbeat }],
    ])

    const result = await recoverStaleFeedbackForInterview(env, qe, 'interview-1', nowMs)

    expect(result).toEqual({
      outcome: 'early',
      dueAtMs: nowMs - 60_000 + STALE_HEARTBEAT_THRESHOLD_MINUTES * 60_000,
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('throws when starting the replacement instance fails so the queue retries', async function run() {
    const create = vi.fn().mockRejectedValue(new Error('workflow unavailable'))
    const env = { FEEDBACK_WORKFLOW: { create } } as unknown as WorkerBindings
    const qe = executor([[{ id: 'interview-1', prior_attempt_id: null }]])

    await expect(recoverStaleFeedbackForInterview(env, qe, 'interview-1', nowMs)).rejects.toThrow(
      'workflow unavailable',
    )
  })
})
