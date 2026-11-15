import { createSqlQuery, type SqlQueryExecutor } from '../index'

export type RecordingStartContext = {
  interview_id: string
  scheduler_id: string
  interviewer_id: string | null
  realtime_session_id: string
  claim_id: string
  takeover: boolean
}

export type RecordingClaimResult =
  | { outcome: 'claimed'; context: RecordingStartContext }
  | { outcome: 'not_eligible' | 'in_progress' | 'already_started' }

export type RecordingRowType = 'composite' | 'participant_track'

export type RecordingRow = {
  provider_recording_id: string
  recording_type: RecordingRowType
  participant_id: string | null
  participant_role: string | null
}

export type InsertRecordingInput = RecordingRow & {
  id: string
  interview_id: string
  now: string
}

const REQUIRED_CONSENTS_PREDICATE = `
  (
    SELECT COUNT(*)
    FROM interview_recording_consents rc
    WHERE rc.interview_id = i.id
      AND rc.decision = 'consented'
      AND rc.revoked_at IS NULL
      AND rc.user_id IN (i.scheduler_id, i.interviewer_id)
  ) = CASE WHEN i.interviewer_id IS NULL THEN 1 ELSE 2 END
`

const CLAIM_RETURNING = `
  RETURNING i.id AS interview_id, i.scheduler_id, i.interviewer_id, i.realtime_session_id
`

type ClaimRow = {
  interview_id: string
  scheduler_id: string
  interviewer_id: string | null
  realtime_session_id: string
}

export class RecordingControlRepository {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  /**
   * Compare-and-set claim. A single UPDATE both checks eligibility
   * (ongoing + all required active consents) and flips not_started -> pending,
   * so concurrent callers race safely. A stale pending claim can be taken over.
   */
  async claimStart(input: {
    interview_id: string
    claim_id: string
    now: string
    stale_before: string
  }): Promise<RecordingClaimResult> {
    const fresh = await this.queryExecutor.query<ClaimRow>(
      createSqlQuery(
        `
          UPDATE interviews i
          SET recording_status = 'pending',
              recording_start_claim_id = $2,
              recording_start_claimed_at = $3,
              updated_at = $3
          WHERE i.id = $1
            AND i.status = 'ongoing'
            AND i.recording_status = 'not_started'
            AND i.realtime_session_id IS NOT NULL
            AND ${REQUIRED_CONSENTS_PREDICATE}
          ${CLAIM_RETURNING};
        `,
        [input.interview_id, input.claim_id, input.now],
      ),
    )
    const [freshRow] = fresh.rows
    if (freshRow) {
      return { outcome: 'claimed', context: toContext(freshRow, input.claim_id, false) }
    }

    const takeover = await this.queryExecutor.query<ClaimRow>(
      createSqlQuery(
        `
          UPDATE interviews i
          SET recording_start_claim_id = $2,
              recording_start_claimed_at = $3,
              updated_at = $3
          WHERE i.id = $1
            AND i.status = 'ongoing'
            AND i.recording_status = 'pending'
            AND i.realtime_session_id IS NOT NULL
            AND i.recording_start_claimed_at < $4
          ${CLAIM_RETURNING};
        `,
        [input.interview_id, input.claim_id, input.now, input.stale_before],
      ),
    )
    const [takeoverRow] = takeover.rows
    if (takeoverRow) {
      return { outcome: 'claimed', context: toContext(takeoverRow, input.claim_id, true) }
    }

    const current = await this.queryExecutor.query<{ status: string; recording_status: string }>(
      createSqlQuery(
        `SELECT status, recording_status FROM interviews WHERE id = $1 LIMIT 1;`,
        [input.interview_id],
      ),
    )
    const [row] = current.rows
    if (row?.status === 'ongoing') {
      if (row.recording_status === 'pending') return { outcome: 'in_progress' }
      if (row.recording_status !== 'not_started') return { outcome: 'already_started' }
    }
    return { outcome: 'not_eligible' }
  }

  async listRecordings(interviewId: string): Promise<RecordingRow[]> {
    const result = await this.queryExecutor.query<RecordingRow>(
      createSqlQuery(
        `
          SELECT provider_recording_id, recording_type, participant_id, participant_role
          FROM interview_recordings
          WHERE interview_id = $1;
        `,
        [interviewId],
      ),
    )
    return result.rows
  }

  async insertRecording(input: InsertRecordingInput): Promise<void> {
    await this.queryExecutor.query(
      createSqlQuery(
        `
          INSERT INTO interview_recordings (
            id, interview_id, provider_recording_id, recording_type,
            participant_id, participant_role, provider_status,
            finalization_status, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'INVOKED', 'pending', $7, $7)
          ON CONFLICT (provider_recording_id) DO NOTHING;
        `,
        [
          input.id,
          input.interview_id,
          input.provider_recording_id,
          input.recording_type,
          input.participant_id,
          input.participant_role,
          input.now,
        ],
      ),
    )
  }

  async finishClaim(input: {
    interview_id: string
    claim_id: string
    status: 'recording' | 'failed'
    now: string
  }): Promise<boolean> {
    const result = await this.queryExecutor.query(
      createSqlQuery(
        `
          UPDATE interviews
          SET recording_status = $3, updated_at = $4
          WHERE id = $1
            AND recording_start_claim_id = $2
            AND recording_status = 'pending'
          RETURNING id;
        `,
        [input.interview_id, input.claim_id, input.status, input.now],
      ),
    )
    return result.rows.length > 0
  }
}

function toContext(row: ClaimRow, claimId: string, takeover: boolean): RecordingStartContext {
  return {
    interview_id: row.interview_id,
    scheduler_id: row.scheduler_id,
    interviewer_id: row.interviewer_id,
    realtime_session_id: row.realtime_session_id,
    claim_id: claimId,
    takeover,
  }
}
