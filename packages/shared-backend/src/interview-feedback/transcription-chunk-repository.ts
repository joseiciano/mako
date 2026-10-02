import { createSqlQuery, type SqlQueryExecutor } from '../index'

export type TranscriptionChunkStatus = 'pending' | 'transcribed' | 'failed'

export type TranscriptionChunkRow = {
  id: string
  interview_id: string
  feedback_attempt_id: string
  participant_role: string | null
  chunk_index: number
  status: TranscriptionChunkStatus
  transcript_text: string | null
}

export type UpsertTranscriptionChunkInput = {
  id: string
  interviewId: string
  attemptId: string
  participantRole: string
  chunkIndex: number
  status: TranscriptionChunkStatus
  transcriptText: string | null
}

/**
 * Persists `interview_transcription_chunks` rows (Story 5.16). Chunk
 * identity is `(interview_id, feedback_attempt_id, participant_role,
 * chunk_index)`, matching the unique index added in migration
 * `20260807120000_add_feedback_and_artifact_schema.sql`, so a retried
 * workflow step within the same attempt reuses already-transcribed chunks
 * instead of re-running inference.
 */
export class TranscriptionChunkRepository {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  async listChunks(
    interviewId: string,
    attemptId: string,
    participantRole: string,
  ): Promise<TranscriptionChunkRow[]> {
    const result = await this.queryExecutor.query<TranscriptionChunkRow>(
      createSqlQuery(
        `
          SELECT id, interview_id, feedback_attempt_id, participant_role, chunk_index, status, transcript_text
          FROM interview_transcription_chunks
          WHERE interview_id = $1
            AND feedback_attempt_id = $2
            AND COALESCE(participant_role, '') = COALESCE($3, '')
          ORDER BY chunk_index ASC;
        `,
        [interviewId, attemptId, participantRole],
      ),
    )

    return result.rows
  }

  /**
   * Upserts one chunk result. Never downgrades a chunk that is already
   * `transcribed`: a retried workflow step that reaches a completed chunk
   * again keeps the persisted transcript text rather than overwriting it.
   */
  async upsertChunk(input: UpsertTranscriptionChunkInput): Promise<void> {
    await this.queryExecutor.query(
      createSqlQuery(
        `
          INSERT INTO interview_transcription_chunks (
            id, interview_id, feedback_attempt_id, participant_role, chunk_index,
            status, transcript_text, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          ON CONFLICT (interview_id, feedback_attempt_id, COALESCE(participant_role, ''), chunk_index)
          DO UPDATE SET
            status = EXCLUDED.status,
            transcript_text = EXCLUDED.transcript_text,
            updated_at = NOW()
          WHERE interview_transcription_chunks.status <> 'transcribed';
        `,
        [
          input.id,
          input.interviewId,
          input.attemptId,
          input.participantRole,
          input.chunkIndex,
          input.status,
          input.transcriptText,
        ],
      ),
    )
  }
}
