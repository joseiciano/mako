import { describe, expect, it } from 'vitest'
import type { SqlQuery, SqlQueryExecutor } from '../index'
import { ArtifactRetentionRepository } from './artifact-retention-repository'

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

const artifactId = '11111111-1111-4111-8111-111111111111'
const interviewId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'

describe('ArtifactRetentionRepository', function suite() {
  describe('listExpiredArtifacts', function listExpiredSuite() {
    it('selects rows whose expiry has passed and are not already tombstoned', async function run() {
      const row = {
        id: artifactId,
        interview_id: interviewId,
        artifact_kind: 'screenshot' as const,
        object_key: `interviews/${interviewId}/screenshots/${artifactId}`,
      }
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interview_artifacts': () => ({ rows: [row] }),
      })

      const repository = new ArtifactRetentionRepository(mockQueryExecutor)
      const rows = await repository.listExpiredArtifacts(50, '2026-06-01T00:00:00.000Z')

      expect(rows).toEqual([row])
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain('deleted_at IS NULL')
      expect(query.text).toContain('expires_at IS NOT NULL')
      expect(query.text).toContain('expires_at <= $1')
      expect(query.text).toContain('LIMIT $2')
      expect(query.values).toEqual(['2026-06-01T00:00:00.000Z', 50])
    })

    it('returns an empty array when nothing has expired', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interview_artifacts': () => ({ rows: [] }),
      })

      const repository = new ArtifactRetentionRepository(mockQueryExecutor)
      const rows = await repository.listExpiredArtifacts(50, '2026-06-01T00:00:00.000Z')

      expect(rows).toEqual([])
    })
  })

  describe('clearArtifactObjectKey', function clearSuite() {
    it('returns true when a live row was cleared', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interview_artifacts': () => ({ rows: [{ id: artifactId }], rowCount: 1 }),
      })

      const repository = new ArtifactRetentionRepository(mockQueryExecutor)
      const cleared = await repository.clearArtifactObjectKey(artifactId, '2026-06-01T00:00:00.000Z')

      expect(cleared).toBe(true)
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain('SET object_key = NULL')
      expect(query.text).toContain('deleted_at = $2')
      expect(query.text).toContain('WHERE id = $1')
      expect(query.text).toContain('AND deleted_at IS NULL')
      expect(query.values).toEqual([artifactId, '2026-06-01T00:00:00.000Z'])
    })

    it('is retry-safe: returns false for an already-cleared row without erroring', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interview_artifacts': () => ({ rows: [], rowCount: 0 }),
      })

      const repository = new ArtifactRetentionRepository(mockQueryExecutor)
      const cleared = await repository.clearArtifactObjectKey(artifactId, '2026-06-01T00:00:00.000Z')

      expect(cleared).toBe(false)
    })
  })

  describe('listParticipantInterviewIds', function participantSuite() {
    it('returns interviews where the user is scheduler or interviewer', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({ rows: [{ id: interviewId }] }),
      })

      const repository = new ArtifactRetentionRepository(mockQueryExecutor)
      const ids = await repository.listParticipantInterviewIds(userId)

      expect(ids).toEqual([interviewId])
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain('scheduler_id = $1')
      expect(query.text).toContain('interviewer_id = $1')
      expect(query.values).toEqual([userId])
    })
  })

  describe('listArtifactsForInterviews', function listForInterviewsSuite() {
    it('returns an empty array without querying when no interview ids are given', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({})
      const repository = new ArtifactRetentionRepository(mockQueryExecutor)

      const rows = await repository.listArtifactsForInterviews([])

      expect(rows).toEqual([])
      expect(mockQueryExecutor.queries).toHaveLength(0)
    })

    it('selects all non-tombstoned artifacts regardless of expiry', async function run() {
      const row = {
        id: artifactId,
        interview_id: interviewId,
        artifact_kind: 'playback_recording' as const,
        object_key: `interviews/${interviewId}/recording/${artifactId}`,
      }
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interview_artifacts': () => ({ rows: [row] }),
      })

      const repository = new ArtifactRetentionRepository(mockQueryExecutor)
      const rows = await repository.listArtifactsForInterviews([interviewId])

      expect(rows).toEqual([row])
      const query = mockQueryExecutor.queries[0]!
      expect(query.text).not.toContain('expires_at')
      expect(query.text).toContain('deleted_at IS NULL')
      expect(query.values).toEqual([[interviewId]])
    })
  })

  describe('clearInterviewPrivacyFields', function clearPrivacySuite() {
    it('clears transcript/feedback and resets feedback metadata to the not_started shape', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'UPDATE interviews': () => ({ rows: [], rowCount: 1 }),
      })

      const repository = new ArtifactRetentionRepository(mockQueryExecutor)
      await repository.clearInterviewPrivacyFields(interviewId, '2026-06-01T00:00:00.000Z')

      const query = mockQueryExecutor.queries[0]!
      expect(query.text).toContain('transcript = NULL')
      expect(query.text).toContain('feedback = NULL')
      expect(query.text).toContain("feedback_status = 'not_started'")
      expect(query.text).toContain('feedback_unavailable_reason = NULL')
      expect(query.text).toContain('feedback_error_code = NULL')
      expect(query.text).toContain('feedback_prompt_version = NULL')
      expect(query.text).toContain('feedback_generated_at = NULL')
      expect(query.text).toContain('feedback_attempt_id = NULL')
      expect(query.text).toContain('feedback_processing_started_at = NULL')
      expect(query.text).toContain('feedback_processing_heartbeat_at = NULL')
      expect(query.values).toEqual([interviewId, '2026-06-01T00:00:00.000Z'])
    })
  })
})
