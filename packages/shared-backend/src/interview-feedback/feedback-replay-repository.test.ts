import { describe, expect, it } from 'vitest'
import type { SqlQuery, SqlQueryExecutor } from '../index'
import { FeedbackReplayRepository } from './feedback-replay-repository'

function createMockQueryExecutor(
  handlers: Record<string, (query: SqlQuery) => { rows: unknown[]; rowCount?: number }>,
): SqlQueryExecutor & { queries: SqlQuery[] } {
  const queries: SqlQuery[] = []

  return {
    queries,
    async query<Row>(query: SqlQuery) {
      queries.push(query)

      for (const [needle, handler] of Object.entries(handlers)) {
        if (query.text.includes(needle)) {
          return handler(query) as { rows: Row[]; rowCount?: number }
        }
      }

      throw new Error(`Unexpected query: ${query.text}`)
    },
  }
}

const interviewId = '22222222-2222-4222-8222-222222222222'

describe('FeedbackReplayRepository', function suite() {
  describe('getReplayState', function () {
    it('returns the current feedback state', async function run() {
      const row = { feedback_status: 'failed', feedback_attempt_id: 'attempt-1', feedback_error_code: 'analysis_failed' }
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({ rows: [row] }),
      })

      const repository = new FeedbackReplayRepository(mockQueryExecutor)
      const result = await repository.getReplayState(interviewId)

      expect(result).toEqual(row)
    })

    it('returns null when the interview does not exist', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({ rows: [] }),
      })

      const repository = new FeedbackReplayRepository(mockQueryExecutor)
      const result = await repository.getReplayState(interviewId)

      expect(result).toBeNull()
    })
  })

  describe('resetFailedToPending', function () {
    it('returns true and clears processing/error/prompt fields', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [{ id: interviewId }], rowCount: 1 }),
      })

      const repository = new FeedbackReplayRepository(mockQueryExecutor)
      const result = await repository.resetFailedToPending(interviewId)

      expect(result).toBe(true)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain("feedback_status = 'failed'")
      expect(query.text).toContain("SET feedback_status = 'pending'")
      expect(query.text).toContain('feedback_attempt_id = NULL')
      expect(query.text).toContain('feedback_processing_started_at = NULL')
      expect(query.text).toContain('feedback_processing_heartbeat_at = NULL')
      expect(query.text).toContain('feedback_prompt_version = NULL')
      expect(query.values).toEqual([interviewId])
    })

    it('is a safe no-op when the row is no longer failed', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new FeedbackReplayRepository(mockQueryExecutor)
      const result = await repository.resetFailedToPending(interviewId)

      expect(result).toBe(false)
    })
  })

  describe('insertReplayAudit', function () {
    it('inserts a durable audit row with the operator, prior attempt, and reason', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'INSERT INTO feedback_replay_audit': () => ({ rows: [], rowCount: 1 }),
      })

      const repository = new FeedbackReplayRepository(mockQueryExecutor)
      await repository.insertReplayAudit({
        id: 'audit-1',
        interviewId,
        priorAttemptId: 'attempt-1',
        priorErrorCode: 'analysis_failed',
        targetSchemaVersion: 1,
        operatorIdentity: 'ops@example.com',
        reason: 'provider outage resolved',
        createdAt: '2026-09-01T00:00:00.000Z',
      })

      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain('INSERT INTO feedback_replay_audit')
      expect(query.values).toEqual([
        'audit-1',
        interviewId,
        'attempt-1',
        'analysis_failed',
        1,
        'ops@example.com',
        'provider outage resolved',
        '2026-09-01T00:00:00.000Z',
      ])
    })
  })
})
