import { createSqlQuery, rollbackTransactionSafely, type SqlQueryExecutor } from '../index'

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

const CLAIM_RETURNING = `
  RETURNING i.id AS interview_id, i.scheduler_id, i.interviewer_id, i.realtime_session_id
`

type ClaimRow = {
  interview_id: string
  scheduler_id: string
  interviewer_id: string | null
  realtime_session_id: string
}

type LockedInterviewRow = {
  status: string
  recording_status: string
  scheduler_id: string
  interviewer_id: string | null
  realtime_session_id: string | null
}

export class RecordingControlRepository {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  /**
   * Claim in one transaction: lock the interview row FOR UPDATE (the same lock
   * consent writes take), count active consents in a fresh statement so a
   * concurrently committed revoke is always visible at READ COMMITTED, then
   * flip not_started -> pending. A stale pending claim can be taken over.
   */
  async claimStart(input: {
    interview_id: string
    claim_id: string
    now: string
    stale_before: string
  }): Promise<RecordingClaimResult> {
    await this.queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const result = await this.claimStartLocked(input)
      await this.queryExecutor.query(createSqlQuery('COMMIT;'))
      return result
    } catch (error) {
      await rollbackTransactionSafely(this.queryExecutor)
      throw error
    }
  }

  private async claimStartLocked(input: {
    interview_id: string
    claim_id: string
    now: string
    stale_before: string
  }): Promise<RecordingClaimResult> {
    const locked = await this.queryExecutor.query<LockedInterviewRow>(
      createSqlQuery(
        `
          SELECT status, recording_status, scheduler_id, interviewer_id, realtime_session_id
          FROM interviews
          WHERE id = $1
          LIMIT 1
          FOR UPDATE;
        `,
        [input.interview_id],
      ),
    )
    const [row] = locked.rows
    if (!row || row.status !== 'ongoing' || !row.realtime_session_id) {
      return { outcome: 'not_eligible' }
    }

    if (row.recording_status === 'not_started') {
      const consents = await this.queryExecutor.query<{ consent_count: number | string }>(
        createSqlQuery(
          `
            SELECT COUNT(*) AS consent_count
            FROM interview_recording_consents
            WHERE interview_id = $1
              AND decision = 'consented'
              AND revoked_at IS NULL
              AND user_id IN ($2, $3);
          `,
          [input.interview_id, row.scheduler_id, row.interviewer_id],
        ),
      )
      const required = row.interviewer_id === null ? 1 : 2
      if (Number(consents.rows[0]?.consent_count ?? 0) !== required) {
        return { outcome: 'not_eligible' }
      }

      const claimed = await this.queryExecutor.query<ClaimRow>(
        createSqlQuery(
          `
            UPDATE interviews i
            SET recording_status = 'pending',
                recording_start_claim_id = $2,
                recording_start_claimed_at = $3,
                updated_at = $3
            WHERE i.id = $1 AND i.recording_status = 'not_started'
            ${CLAIM_RETURNING};
          `,
          [input.interview_id, input.claim_id, input.now],
        ),
      )
      const [claimedRow] = claimed.rows
      return claimedRow
        ? { outcome: 'claimed', context: toContext(claimedRow, input.claim_id, false) }
        : { outcome: 'not_eligible' }
    }

    if (row.recording_status !== 'pending') {
      return { outcome: 'already_started' }
    }

    const takeover = await this.queryExecutor.query<ClaimRow>(
      createSqlQuery(
        `
          UPDATE interviews i
          SET recording_start_claim_id = $2,
              recording_start_claimed_at = $3,
              updated_at = $3
          WHERE i.id = $1
            AND i.recording_status = 'pending'
            AND i.recording_start_claimed_at < $4
          ${CLAIM_RETURNING};
        `,
        [input.interview_id, input.claim_id, input.now, input.stale_before],
      ),
    )
    const [takeoverRow] = takeover.rows
    return takeoverRow
      ? { outcome: 'claimed', context: toContext(takeoverRow, input.claim_id, true) }
      : { outcome: 'in_progress' }
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

  async isInterviewOngoing(interviewId: string): Promise<boolean> {
    const result = await this.queryExecutor.query<{ status: string }>(
      createSqlQuery(`SELECT status FROM interviews WHERE id = $1 LIMIT 1;`, [interviewId]),
    )
    return result.rows[0]?.status === 'ongoing'
  }

  async markRecordingStopped(providerRecordingId: string, now: string): Promise<void> {
    await this.queryExecutor.query(
      createSqlQuery(
        `
          UPDATE interview_recordings
          SET stop_requested_at = COALESCE(stop_requested_at, $2),
              stop_confirmed_at = COALESCE(stop_confirmed_at, $2),
              updated_at = $2
          WHERE provider_recording_id = $1;
        `,
        [providerRecordingId, now],
      ),
    )
  }

  async listStalePendingInterviewIds(input: {
    stale_before: string
    limit: number
  }): Promise<string[]> {
    const result = await this.queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          SELECT id
          FROM interviews
          WHERE status = 'ongoing'
            AND recording_status = 'pending'
            AND recording_start_claimed_at < $1
          ORDER BY recording_start_claimed_at
          LIMIT $2;
        `,
        [input.stale_before, input.limit],
      ),
    )
    return result.rows.map((row) => row.id)
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
