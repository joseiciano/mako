import { describe, expect, it } from 'vitest'
import type { SqlQuery, SqlQueryExecutor } from '../index'
import { TranscriptionRepository } from './transcription-repository'

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

describe('TranscriptionRepository', function suite() {
  describe('getTranscriptionState', function getStateSuite() {
    it('returns the row when the interview exists', async function run() {
      const row = { transcript: null, feedback_status: 'processing', feedback_attempt_id: attemptId }
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({ rows: [row] }),
      })

      const repository = new TranscriptionRepository(mockQueryExecutor)
      const result = await repository.getTranscriptionState(interviewId)

      expect(result).toEqual(row)
    })

    it('returns null when the interview does not exist', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({ rows: [] }),
      })

      const repository = new TranscriptionRepository(mockQueryExecutor)
      const result = await repository.getTranscriptionState(interviewId)

      expect(result).toBeNull()
    })
  })

  describe('listFinalizedAudioArtifacts', function listFinalizedSuite() {
    it('queries only transcription_audio artifacts that are not deleted', async function run() {
      const rows = [{ participant_role: 'candidate', object_key: 'interviews/a/recording/b', finalized_at: '2026-01-01T00:00:00.000Z' }]
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interview_artifacts': () => ({ rows }),
      })

      const repository = new TranscriptionRepository(mockQueryExecutor)
      const result = await repository.listFinalizedAudioArtifacts(interviewId)

      expect(result).toEqual(rows)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain("artifact_kind = 'transcription_audio'")
      expect(query.text).toContain('deleted_at IS NULL')
      expect(query.values).toEqual([interviewId])
    })
  })

  describe('persistTranscript', function persistTranscriptSuite() {
    it('returns true when the conditional write succeeds', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [{ id: interviewId }], rowCount: 1 }),
      })

      const repository = new TranscriptionRepository(mockQueryExecutor)
      const result = await repository.persistTranscript({
        interviewId,
        attemptId,
        transcript: '[Candidate]\nHello.',
      })

      expect(result).toBe(true)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain("feedback_status = 'processing'")
      expect(query.text).toContain('feedback_attempt_id = $2')
      expect(query.text).toContain('transcript IS NULL')
      expect(query.values).toEqual([interviewId, attemptId, '[Candidate]\nHello.'])
    })

    it('returns false when the interview is no longer processing under this attempt', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new TranscriptionRepository(mockQueryExecutor)
      const result = await repository.persistTranscript({
        interviewId,
        attemptId,
        transcript: 'stale attempt text',
      })

      expect(result).toBe(false)
    })

    it('returns false when a transcript was already persisted (transcript IS NULL guard)', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new TranscriptionRepository(mockQueryExecutor)
      const result = await repository.persistTranscript({
        interviewId,
        attemptId,
        transcript: 'duplicate write attempt',
      })

      expect(result).toBe(false)
    })
  })
})
