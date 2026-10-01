import { describe, expect, it } from 'vitest'
import type { SqlQuery, SqlQueryExecutor } from '../index'
import { FeedbackWorkflowRepository } from './feedback-workflow-repository'

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

const interviewId = '11111111-1111-4111-8111-111111111111'
const attemptId = 'attempt-1'
const now = '2026-09-01T00:00:00.000Z'

describe('FeedbackWorkflowRepository', function suite() {
  describe('claimProcessing', function () {
    it('returns true and sends the conditional pending -> processing update', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [{ id: interviewId }], rowCount: 1 }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.claimProcessing(interviewId, attemptId, now)

      expect(result).toBe(true)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain("feedback_status = 'pending'")
      expect(query.text).toContain("SET feedback_status = 'processing'")
      expect(query.values).toEqual([interviewId, attemptId, now])
    })

    it('returns false when no pending row matches', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.claimProcessing(interviewId, attemptId, now)

      expect(result).toBe(false)
    })
  })

  describe('listRecordingJobs', function () {
    it('queries interview_recordings for the interview', async function run() {
      const rows = [{ recording_type: 'composite', finalization_status: 'finalized', error_code: null }]
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interview_recordings': () => ({ rows }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.listRecordingJobs(interviewId)

      expect(result).toEqual(rows)
      expect(mockQueryExecutor.queries[0]!.values).toEqual([interviewId])
    })
  })

  describe('getScreenshotFinalizationState', function () {
    it('returns the finalized_at timestamp', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({ rows: [{ screenshots_finalized_at: now }] }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.getScreenshotFinalizationState(interviewId)

      expect(result).toEqual({ screenshots_finalized_at: now })
    })

    it('returns null when the interview does not exist', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({ rows: [] }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.getScreenshotFinalizationState(interviewId)

      expect(result).toBeNull()
    })
  })

  describe('refreshHeartbeat', function () {
    it('returns true when the attempt is still active', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [{ id: interviewId }], rowCount: 1 }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.refreshHeartbeat(interviewId, attemptId)

      expect(result).toBe(true)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain("feedback_status = 'processing'")
      expect(query.text).toContain('feedback_attempt_id = $2')
      expect(query.values).toEqual([interviewId, attemptId])
    })

    it('returns false when the attempt is stale/replaced', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.refreshHeartbeat(interviewId, attemptId)

      expect(result).toBe(false)
    })
  })

  describe('markFailed', function () {
    it('transitions processing -> failed with the given error code', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [{ id: interviewId }], rowCount: 1 }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.markFailed(interviewId, attemptId, 'assets_not_ready')

      expect(result).toBe(true)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain("feedback_status = 'failed'")
      expect(query.text).toContain("feedback_status = 'processing'")
      expect(query.text).toContain('feedback_attempt_id = $2')
      expect(query.text).not.toContain('feedback_attempt_id = NULL')
      expect(query.values).toEqual([interviewId, attemptId, 'assets_not_ready'])
    })

    it('is a safe no-op when the attempt is stale/replaced', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.markFailed(interviewId, attemptId, 'internal_error')

      expect(result).toBe(false)
    })
  })

  describe('markUnavailable', function () {
    it('transitions processing -> not_started and clears processing fields', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [{ id: interviewId }], rowCount: 1 }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.markUnavailable(interviewId, attemptId, 'no_recording')

      expect(result).toBe(true)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain("feedback_status = 'not_started'")
      expect(query.text).toContain('feedback_attempt_id = NULL')
      expect(query.text).toContain('feedback_processing_started_at = NULL')
      expect(query.text).toContain('feedback_processing_heartbeat_at = NULL')
      expect(query.text).toContain('feedback_prompt_version = NULL')
      expect(query.values).toEqual([interviewId, attemptId, 'no_recording'])
    })

    it('is a safe no-op when the attempt is stale/replaced', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new FeedbackWorkflowRepository(mockQueryExecutor)
      const result = await repository.markUnavailable(interviewId, attemptId, 'unsupported_format')

      expect(result).toBe(false)
    })
  })
})
