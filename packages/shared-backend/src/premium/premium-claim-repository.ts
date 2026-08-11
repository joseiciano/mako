import { createSqlQuery, type SqlQueryExecutor } from '../index'
import { findInterviewOverlap, findPremiumSlotOverlap } from './premium-overlap-helper'
import {
  parsePremiumClaimInterviewRow,
  parsePremiumSlotClaimRow,
} from '../database/foundation-schemas'

export type PremiumSlotRow = {
  id: string
  interviewer_id: string
  interview_type: 'system_design' | 'coding' | 'behavioral'
  start_time: string
  end_time: string
  status: 'available' | 'claimed' | 'cancelled'
  created_at: string
  updated_at: string
}

export type PremiumClaimRow = {
  idempotency_key: string
  slot_id: string
  scheduler_id: string
  interview_id: string
  created_at: string
}

export type ClaimInterviewRow = {
  id: string
  scheduler_id: string
  scheduler_alias: string
  interviewer_id: string
  interviewer_alias: string
  type: 'system_design' | 'coding' | 'behavioral'
  mode: 'peer_to_peer' | 'ai_led'
  booking_channel: 'ai_direct' | 'standard_match' | 'verified_interviewer'
  tier: 'standard' | 'premium'
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
  scheduled_at: string
  realtime_session_id: string | null
  excalidraw_room_id: string | null
  excalidraw_key: string | null
  recording_url: string | null
  screenshot_urls: string[] | null
  feedback: Record<string, unknown> | null
  recording_status: string | null
  transcript: string | null
  feedback_status: string | null
  feedback_unavailable_reason: string | null
  feedback_error_code: string | null
  feedback_prompt_version: string | null
  feedback_generated_at: string | null
  started_at: string | null
  screenshots_finalized_at: string | null
  expires_at: string | null
  warning_at: string | null
  created_at: string
  updated_at: string
}

export type LockedUserRow = {
  id: string
  deleted_at: string | null
  companies: boolean
}

export type InsertClaimInput = {
  idempotencyKey: string
  slotId: string
  schedulerId: string
  interviewId: string
  createdAt: string
}

export type InsertClaimInterviewInput = {
  id: string
  schedulerId: string
  schedulerAlias: string
  interviewerId: string
  interviewerAlias: string
  type: string
  mode: string
  bookingChannel: string
  tier: string
  status: string
  scheduledAt: string
  createdAt: string
  updatedAt: string
}

export class PremiumClaimRepository {
  async acquireIdempotencyLock(
    queryExecutor: SqlQueryExecutor,
    idempotencyKey: string,
  ): Promise<void> {
    await queryExecutor.query(
      createSqlQuery(
        "SELECT pg_advisory_xact_lock(hashtext('premium-claim:' || $1));",
        [idempotencyKey],
      ),
    )
  }

  async acquireSlotLock(
    queryExecutor: SqlQueryExecutor,
    slotId: string,
  ): Promise<void> {
    await queryExecutor.query(
      createSqlQuery(
        "SELECT pg_advisory_xact_lock(hashtext('premium-slot:' || $1));",
        [slotId],
      ),
    )
  }

  async findClaimByIdempotencyKey(
    queryExecutor: SqlQueryExecutor,
    idempotencyKey: string,
  ): Promise<PremiumClaimRow | null> {
    const result = await queryExecutor.query<PremiumClaimRow>(
      createSqlQuery(
        `
          SELECT idempotency_key, slot_id, scheduler_id, interview_id, created_at
          FROM premium_slot_claims
          WHERE idempotency_key = $1
          LIMIT 1;
        `,
        [idempotencyKey],
      ),
    )

    return result.rows[0] ?? null
  }

  async findClaimBySlotId(
    queryExecutor: SqlQueryExecutor,
    slotId: string,
  ): Promise<PremiumClaimRow | null> {
    const result = await queryExecutor.query<PremiumClaimRow>(
      createSqlQuery(
        `
          SELECT idempotency_key, slot_id, scheduler_id, interview_id, created_at
          FROM premium_slot_claims
          WHERE slot_id = $1
          LIMIT 1;
        `,
        [slotId],
      ),
    )

    return result.rows[0] ?? null
  }

  async lockSlotForUpdate(
    queryExecutor: SqlQueryExecutor,
    slotId: string,
  ): Promise<PremiumSlotRow | null> {
    const result = await queryExecutor.query<PremiumSlotRow>(
      createSqlQuery(
        `
          SELECT id, interviewer_id, interview_type, start_time, end_time, status, created_at, updated_at
          FROM premium_interviewer_slots
          WHERE id = $1
          LIMIT 1
          FOR UPDATE;
        `,
        [slotId],
      ),
    )

    return result.rows[0] ?? null
  }

  async lockUsersForUpdate(
    queryExecutor: SqlQueryExecutor,
    userIds: string[],
  ): Promise<LockedUserRow[]> {
    const result = await queryExecutor.query<LockedUserRow>(
      createSqlQuery(
        `
          SELECT id, deleted_at, companies
          FROM "user"
          WHERE id = ANY($1::uuid[])
          ORDER BY id
          FOR UPDATE;
        `,
        [userIds],
      ),
    )

    return result.rows
  }

  async lockSchedulerForUpdate(
    queryExecutor: SqlQueryExecutor,
    schedulerId: string,
  ): Promise<LockedUserRow | null> {
    const result = await queryExecutor.query<LockedUserRow>(
      createSqlQuery(
        `
          SELECT id, deleted_at, companies
          FROM "user"
          WHERE id = $1
          LIMIT 1
          FOR UPDATE;
        `,
        [schedulerId],
      ),
    )

    return result.rows[0] ?? null
  }

  async findInterviewConflict(
    queryExecutor: SqlQueryExecutor,
    userId: string,
    startTime: string,
    endTime: string,
  ): Promise<{ id: string } | null> {
    return findInterviewOverlap(queryExecutor, userId, startTime, endTime)
  }

  async findPremiumSlotConflict(
    queryExecutor: SqlQueryExecutor,
    userId: string,
    startTime: string,
    endTime: string,
    excludeSlotId: string,
  ): Promise<{ id: string } | null> {
    return findPremiumSlotOverlap(queryExecutor, userId, startTime, endTime, excludeSlotId)
  }

  async claimSlot(
    queryExecutor: SqlQueryExecutor,
    slotId: string,
    updatedAt: string,
  ): Promise<PremiumSlotRow | null> {
    const result = await queryExecutor.query<PremiumSlotRow>(
      createSqlQuery(
        `
          UPDATE premium_interviewer_slots
          SET status = 'claimed',
              updated_at = $2
          WHERE id = $1
            AND status = 'available'
          RETURNING id, interviewer_id, interview_type, start_time, end_time, status, created_at, updated_at;
        `,
        [slotId, updatedAt],
      ),
    )

    return result.rows[0] ?? null
  }

  async insertClaim(
    queryExecutor: SqlQueryExecutor,
    input: InsertClaimInput,
  ): Promise<PremiumClaimRow> {
    const result = await queryExecutor.query<PremiumClaimRow>(
      createSqlQuery(
        `
          INSERT INTO premium_slot_claims (
            idempotency_key,
            slot_id,
            scheduler_id,
            interview_id,
            created_at
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING idempotency_key, slot_id, scheduler_id, interview_id, created_at;
        `,
        [
          input.idempotencyKey,
          input.slotId,
          input.schedulerId,
          input.interviewId,
          input.createdAt,
        ],
      ),
    )

    const [row] = result.rows

    if (!row) {
      throw new Error('Failed to insert premium slot claim record.')
    }

    return parsePremiumSlotClaimRow(row)
  }

  async insertClaimInterview(
    queryExecutor: SqlQueryExecutor,
    input: InsertClaimInterviewInput,
  ): Promise<ClaimInterviewRow> {
    const result = await queryExecutor.query<ClaimInterviewRow>(
      createSqlQuery(
        `
          INSERT INTO interviews (
            id,
            scheduler_id,
            scheduler_alias,
            interviewer_id,
            interviewer_alias,
            type,
            mode,
            booking_channel,
            tier,
            status,
            scheduled_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING
            id,
            scheduler_id,
            scheduler_alias,
            interviewer_id,
            interviewer_alias,
            type,
            mode,
            booking_channel,
            tier,
            status,
            scheduled_at,
            realtime_session_id,
            excalidraw_room_id,
            excalidraw_key,
            recording_url,
            screenshot_urls,
            feedback,
            recording_status,
            transcript,
            feedback_status,
            feedback_unavailable_reason,
            feedback_error_code,
            feedback_prompt_version,
            feedback_generated_at,
            started_at,
            screenshots_finalized_at,
            expires_at,
            warning_at,
            created_at,
            updated_at;
        `,
        [
          input.id,
          input.schedulerId,
          input.schedulerAlias,
          input.interviewerId,
          input.interviewerAlias,
          input.type,
          input.mode,
          input.bookingChannel,
          input.tier,
          input.status,
          input.scheduledAt,
          input.createdAt,
          input.updatedAt,
        ],
      ),
    )

    const [row] = result.rows

    if (!row) {
      throw new Error('Failed to insert premium claim interview record.')
    }

    return parsePremiumClaimInterviewRow(row)
  }

  async getInterviewById(
    queryExecutor: SqlQueryExecutor,
    interviewId: string,
  ): Promise<ClaimInterviewRow | null> {
    const result = await queryExecutor.query<ClaimInterviewRow>(
      createSqlQuery(
        `
          SELECT
            id,
            scheduler_id,
            scheduler_alias,
            interviewer_id,
            interviewer_alias,
            type,
            mode,
            booking_channel,
            tier,
            status,
            scheduled_at,
            realtime_session_id,
            excalidraw_room_id,
            excalidraw_key,
            recording_url,
            screenshot_urls,
            feedback,
            recording_status,
            transcript,
            feedback_status,
            feedback_unavailable_reason,
            feedback_error_code,
            feedback_prompt_version,
            feedback_generated_at,
            started_at,
            screenshots_finalized_at,
            expires_at,
            warning_at,
            created_at,
            updated_at
          FROM interviews
          WHERE id = $1
          LIMIT 1;
        `,
        [interviewId],
      ),
    )

    return result.rows[0] ?? null
  }
}
