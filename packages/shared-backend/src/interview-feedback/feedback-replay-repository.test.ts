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

  describe('resetFailedToPendingWithAudit', function () {
    const auditInput = {
      id: 'audit-1',
      interviewId,
      priorAttemptId: 'attempt-1',
      priorErrorCode: 'analysis_failed',
      targetSchemaVersion: 1,
      operatorIdentity: 'ops@example.com',
      reason: 'provider outage resolved',
      createdAt: '2026-09-01T00:00:00.000Z',
    }

    it('resets the interview and inserts the audit row in a single transaction', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'BEGIN': () => ({ rows: [] }),
        'UPDATE interviews': () => ({ rows: [{ id: interviewId }], rowCount: 1 }),
        'INSERT INTO feedback_replay_audit': () => ({ rows: [], rowCount: 1 }),
        'COMMIT': () => ({ rows: [] }),
      })

      const repository = new FeedbackReplayRepository(mockQueryExecutor)
      const result = await repository.resetFailedToPendingWithAudit(auditInput)

      expect(result).toBe(true)

      const queryTexts = mockQueryExecutor.queries.map((query) => query.text)
      expect(queryTexts[0]).toContain('BEGIN')
      expect(queryTexts[1]).toContain("SET feedback_status = 'pending'")
      expect(queryTexts[1]).toContain("feedback_status = 'failed'")
      expect(queryTexts[2]).toContain('INSERT INTO feedback_replay_audit')
      expect(queryTexts[3]).toContain('COMMIT')

      const updateQuery = mockQueryExecutor.queries[1]!
      expect(updateQuery.text).toContain('feedback_attempt_id = NULL')
      expect(updateQuery.text).toContain('feedback_processing_started_at = NULL')
      expect(updateQuery.text).toContain('feedback_processing_heartbeat_at = NULL')
      expect(updateQuery.text).toContain('feedback_prompt_version = NULL')
      expect(updateQuery.values).toEqual([interviewId])

      const insertQuery = mockQueryExecutor.queries[2]!
      expect(insertQuery.values).toEqual([
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

    it('rolls back and returns false without writing an audit row when the interview is no longer failed', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'BEGIN': () => ({ rows: [] }),
        'UPDATE interviews': () => ({ rows: [], rowCount: 0 }),
        'ROLLBACK': () => ({ rows: [] }),
      })

      const repository = new FeedbackReplayRepository(mockQueryExecutor)
      const result = await repository.resetFailedToPendingWithAudit(auditInput)

      expect(result).toBe(false)

      const queryTexts = mockQueryExecutor.queries.map((query) => query.text)
      expect(queryTexts).toEqual(
        expect.arrayContaining([expect.stringContaining('ROLLBACK')]),
      )
      expect(queryTexts.some((text) => text.includes('INSERT INTO feedback_replay_audit'))).toBe(
        false,
      )
    })

    it('rolls back and rethrows when the audit insert fails', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'BEGIN': () => ({ rows: [] }),
        'UPDATE interviews': () => ({ rows: [{ id: interviewId }], rowCount: 1 }),
        'INSERT INTO feedback_replay_audit': () => {
          throw new Error('connection reset')
        },
        'ROLLBACK': () => ({ rows: [] }),
      })

      const repository = new FeedbackReplayRepository(mockQueryExecutor)

      await expect(repository.resetFailedToPendingWithAudit(auditInput)).rejects.toThrow(
        'connection reset',
      )

      const queryTexts = mockQueryExecutor.queries.map((query) => query.text)
      expect(queryTexts.some((text) => text.includes('ROLLBACK'))).toBe(true)
      expect(queryTexts.some((text) => text.includes('COMMIT'))).toBe(false)
    })
  })
})
