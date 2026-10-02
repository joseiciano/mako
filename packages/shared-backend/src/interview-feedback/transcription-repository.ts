import { createSqlQuery, type SqlQueryExecutor } from '../index'

export type TranscriptionInterviewState = {
  transcript: string | null
  feedback_status: string
  feedback_attempt_id: string | null
}

export type FinalizedAudioArtifactRow = {
  participant_role: string | null
  object_key: string | null
  finalized_at: string | null
}

/**
 * Reads/writes the `interviews` table rows the Story 5.16 transcription
 * pipeline needs: current processing/transcript state for idempotency
 * checks, finalized participant audio track rows, and the one conditional
 * final-transcript write.
 */
export class TranscriptionRepository {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  async getTranscriptionState(interviewId: string): Promise<TranscriptionInterviewState | null> {
    const result = await this.queryExecutor.query<TranscriptionInterviewState>(
      createSqlQuery(
        `
          SELECT transcript, feedback_status, feedback_attempt_id
          FROM interviews
          WHERE id = $1
          LIMIT 1;
        `,
        [interviewId],
      ),
    )

    return result.rows[0] ?? null
  }

  async listFinalizedAudioArtifacts(interviewId: string): Promise<FinalizedAudioArtifactRow[]> {
    const result = await this.queryExecutor.query<FinalizedAudioArtifactRow>(
      createSqlQuery(
        `
          SELECT participant_role, object_key, finalized_at
          FROM interview_artifacts
          WHERE interview_id = $1
            AND artifact_kind = 'transcription_audio'
            AND deleted_at IS NULL
          ORDER BY finalized_at DESC NULLS LAST, created_at DESC;
        `,
        [interviewId],
      ),
    )

    return result.rows
  }

  /**
   * Persists the final transcript only while the interview is still
   * `processing` under the current attempt and no transcript has been
   * written yet. A stale/replaced attempt or an already-persisted transcript
   * is a safe no-op; callers detect the "already persisted" case separately
   * via `getTranscriptionState` so computed work is never silently dropped.
   */
  async persistTranscript(input: {
    interviewId: string
    attemptId: string
    transcript: string
  }): Promise<boolean> {
    const result = await this.queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE interviews
          SET transcript = $3,
              updated_at = NOW()
          WHERE id = $1
            AND feedback_status = 'processing'
            AND feedback_attempt_id = $2
            AND transcript IS NULL
          RETURNING id;
        `,
        [input.interviewId, input.attemptId, input.transcript],
      ),
    )

    return (result.rowCount ?? result.rows.length) > 0
  }
}
