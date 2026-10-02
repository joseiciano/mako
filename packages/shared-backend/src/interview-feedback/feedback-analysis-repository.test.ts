import { describe, expect, it } from 'vitest'
import type { SqlQuery, SqlQueryExecutor } from '../index'
import { FeedbackAnalysisRepository } from './feedback-analysis-repository'

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

const sampleFeedback = {
  schema_version: 1,
  overall_score: 80,
  summary: 'Solid session.',
  dimensions: {
    communication: { score: 80, summary: 'Clear.' },
    problem_solving: { score: 80, summary: 'Methodical.' },
    technical_depth: { score: 80, summary: 'Reasonable tradeoffs.' },
  },
  strengths: [],
  improvements: [],
}

describe('FeedbackAnalysisRepository', function suite() {
  describe('getAnalysisState', function getAnalysisStateSuite() {
    it('returns the row when the interview exists', async function run() {
      const row = {
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        scheduler_alias: 'Vivid Falcon',
        transcript: '[Candidate]\nhello',
        feedback_status: 'processing',
        feedback_attempt_id: attemptId,
        feedback: null,
      }
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({ rows: [row] }),
      })

      const repository = new FeedbackAnalysisRepository(mockQueryExecutor)
      const result = await repository.getAnalysisState(interviewId)

      expect(result).toEqual(row)
    })

    it('returns null when the interview does not exist', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({ rows: [] }),
      })

      const repository = new FeedbackAnalysisRepository(mockQueryExecutor)
      const result = await repository.getAnalysisState(interviewId)

      expect(result).toBeNull()
    })
  })

  describe('listFinalizedScreenshots', function listFinalizedScreenshotsSuite() {
    it('queries only non-deleted screenshot artifacts with an object key, ordered by capture order', async function run() {
      const rows = [{ id: 'a', object_key: 'key-a', content_type: 'image/png', content_size_bytes: 10 }]
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interview_artifacts': () => ({ rows }),
      })

      const repository = new FeedbackAnalysisRepository(mockQueryExecutor)
      const result = await repository.listFinalizedScreenshots(interviewId)

      expect(result).toEqual(rows)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain("artifact_kind = 'screenshot'")
      expect(query.text).toContain('deleted_at IS NULL')
      expect(query.text).toContain('object_key IS NOT NULL')
      expect(query.text).toContain('ORDER BY created_at ASC, id ASC')
      expect(query.values).toEqual([interviewId])
    })
  })

  describe('persistReadyFeedback', function persistReadyFeedbackSuite() {
    it('returns true and sends the attempt-fenced conditional update when the write succeeds', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [{ id: interviewId }], rowCount: 1 }),
      })

      const repository = new FeedbackAnalysisRepository(mockQueryExecutor)
      const result = await repository.persistReadyFeedback({
        interviewId,
        attemptId,
        feedback: sampleFeedback,
        promptVersion: 'feedback-v1',
        generatedAt: '2026-01-01T00:00:00.000Z',
      })

      expect(result).toBe(true)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain("feedback_status = 'processing'")
      expect(query.text).toContain('feedback_attempt_id = $2')
      expect(query.text).toContain("feedback_status = 'ready'")
      expect(query.values).toEqual([
        interviewId,
        attemptId,
        JSON.stringify(sampleFeedback),
        'feedback-v1',
        '2026-01-01T00:00:00.000Z',
      ])
    })

    it('is a safe no-op (returns false) when the attempt id does not match (stale attempt)', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new FeedbackAnalysisRepository(mockQueryExecutor)
      const result = await repository.persistReadyFeedback({
        interviewId,
        attemptId: 'stale-attempt',
        feedback: sampleFeedback,
        promptVersion: 'feedback-v1',
        generatedAt: '2026-01-01T00:00:00.000Z',
      })

      expect(result).toBe(false)
    })

    it('is a safe no-op on a duplicate persistence attempt (already ready, no longer processing)', async function run() {
      // Simulates the interview no longer matching `feedback_status = 'processing'`
      // because a prior call already transitioned it to 'ready'.
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new FeedbackAnalysisRepository(mockQueryExecutor)
      const first = await repository.persistReadyFeedback({
        interviewId,
        attemptId,
        feedback: sampleFeedback,
        promptVersion: 'feedback-v1',
        generatedAt: '2026-01-01T00:00:00.000Z',
      })

      expect(first).toBe(false)
      // Never overwrites an already-ready v1 report during automatic retries.
      expect(mockQueryExecutor.queries).toHaveLength(1)
    })
  })
})
