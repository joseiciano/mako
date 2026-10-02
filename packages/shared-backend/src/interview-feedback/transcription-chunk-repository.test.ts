import { describe, expect, it } from 'vitest'
import type { SqlQuery, SqlQueryExecutor } from '../index'
import { TranscriptionChunkRepository } from './transcription-chunk-repository'

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

describe('TranscriptionChunkRepository', function suite() {
  describe('listChunks', function listChunksSuite() {
    it('scopes by interview, attempt, and participant role, ordered by chunk index', async function run() {
      const rows = [
        {
          id: 'chunk-1',
          interview_id: interviewId,
          feedback_attempt_id: attemptId,
          participant_role: 'candidate',
          chunk_index: 0,
          status: 'transcribed' as const,
          transcript_text: 'hello',
        },
      ]
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interview_transcription_chunks': () => ({ rows }),
      })

      const repository = new TranscriptionChunkRepository(mockQueryExecutor)
      const result = await repository.listChunks(interviewId, attemptId, 'candidate')

      expect(result).toEqual(rows)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain('WHERE interview_id = $1')
      expect(query.text).toContain('feedback_attempt_id = $2')
      expect(query.text).toContain("COALESCE(participant_role, '') = COALESCE($3, '')")
      expect(query.text).toContain('ORDER BY chunk_index ASC')
      expect(query.values).toEqual([interviewId, attemptId, 'candidate'])
    })

    it('returns an empty array when no chunks exist yet', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interview_transcription_chunks': () => ({ rows: [] }),
      })

      const repository = new TranscriptionChunkRepository(mockQueryExecutor)
      const result = await repository.listChunks(interviewId, attemptId, 'candidate')

      expect(result).toEqual([])
    })
  })

  describe('upsertChunk', function upsertChunkSuite() {
    it('inserts with the deterministic conflict target matching the unique index', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'INSERT INTO interview_transcription_chunks': () => ({ rows: [], rowCount: 1 }),
      })

      const repository = new TranscriptionChunkRepository(mockQueryExecutor)
      await repository.upsertChunk({
        id: 'chunk-1',
        interviewId,
        attemptId,
        participantRole: 'candidate',
        chunkIndex: 0,
        status: 'transcribed',
        transcriptText: 'hello world',
      })

      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain(
        "ON CONFLICT (interview_id, feedback_attempt_id, COALESCE(participant_role, ''), chunk_index)",
      )
      expect(query.text).toContain("WHERE interview_transcription_chunks.status <> 'transcribed'")
      expect(query.values).toEqual([
        'chunk-1',
        interviewId,
        attemptId,
        'candidate',
        0,
        'transcribed',
        'hello world',
      ])
    })

    it('never downgrades an already-transcribed chunk (guarded by the WHERE clause on conflict)', async function run() {
      // The repository relies on the SQL WHERE clause for this guarantee; this
      // test documents and locks in that the statement text carries the guard.
      const mockQueryExecutor = createMockQueryExecutor({
        'INSERT INTO interview_transcription_chunks': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new TranscriptionChunkRepository(mockQueryExecutor)

      await expect(
        repository.upsertChunk({
          id: 'chunk-2',
          interviewId,
          attemptId,
          participantRole: 'candidate',
          chunkIndex: 0,
          status: 'failed',
          transcriptText: null,
        }),
      ).resolves.toBeUndefined()

      expect(mockQueryExecutor.queries[0]!.text).toContain("status <> 'transcribed'")
    })
  })
})
