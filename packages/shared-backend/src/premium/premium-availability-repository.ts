import { createSqlQuery, type SqlQueryExecutor } from '../index'
import { findInterviewOverlap, findPremiumSlotOverlap } from './premium-overlap-helper'
import {
  parsePremiumInterviewerSlotRow,
  type PremiumInterviewerSlotRow,
} from '../database/foundation-schemas'

export type { PremiumInterviewerSlotRow }

export type LockedInterviewerUserRow = {
  id: string
  deleted_at: string | null
  companies: boolean
}

export type InsertPremiumSlotInput = {
  id: string
  interviewerId: string
  interviewType: string
  startTime: string
  endTime: string
  createdAt: string
  updatedAt: string
}

export type ListSlotsByInterviewerFilters = {
  interviewerId: string
  status?: string
  interviewType?: string
  limit: number
  offset: number
}

export type CountSlotsByInterviewerFilters = {
  interviewerId: string
  status?: string
  interviewType?: string
}

export class PremiumAvailabilityRepository {
  async lockInterviewerUserRow(
    queryExecutor: SqlQueryExecutor,
    interviewerId: string,
  ): Promise<LockedInterviewerUserRow | null> {
    const result = await queryExecutor.query<LockedInterviewerUserRow>(
      createSqlQuery(
        `
          SELECT id, deleted_at, companies
          FROM "user"
          WHERE id = $1
          LIMIT 1
          FOR UPDATE;
        `,
        [interviewerId],
      ),
    )

    return result.rows[0] ?? null
  }

  async getUserById(
    queryExecutor: SqlQueryExecutor,
    userId: string,
  ): Promise<LockedInterviewerUserRow | null> {
    const result = await queryExecutor.query<LockedInterviewerUserRow>(
      createSqlQuery(
        `
          SELECT id, deleted_at, companies
          FROM "user"
          WHERE id = $1
          LIMIT 1;
        `,
        [userId],
      ),
    )

    return result.rows[0] ?? null
  }

  async listOverlappingSlots(
    queryExecutor: SqlQueryExecutor,
    interviewerId: string,
    startTime: string,
    endTime: string,
  ): Promise<{ id: string } | null> {
    return findPremiumSlotOverlap(queryExecutor, interviewerId, startTime, endTime)
  }

  async listInterviewConflicts(
    queryExecutor: SqlQueryExecutor,
    userId: string,
    startTime: string,
    endTime: string,
  ): Promise<{ id: string } | null> {
    return findInterviewOverlap(queryExecutor, userId, startTime, endTime)
  }

  async insertSlot(
    queryExecutor: SqlQueryExecutor,
    input: InsertPremiumSlotInput,
  ): Promise<PremiumInterviewerSlotRow> {
    const result = await queryExecutor.query<PremiumInterviewerSlotRow>(
      createSqlQuery(
        `
          INSERT INTO premium_interviewer_slots (
            id,
            interviewer_id,
            interview_type,
            start_time,
            end_time,
            status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'available', $6, $7)
          RETURNING
            id,
            interviewer_id,
            interview_type,
            start_time,
            end_time,
            status,
            created_at,
            updated_at;
        `,
        [
          input.id,
          input.interviewerId,
          input.interviewType,
          input.startTime,
          input.endTime,
          input.createdAt,
          input.updatedAt,
        ],
      ),
    )

    const [createdRow] = result.rows

    if (!createdRow) {
      throw new Error('Failed to insert premium availability slot record.')
    }

    return parsePremiumInterviewerSlotRow(createdRow)
  }

  async listSlotsByInterviewer(
    queryExecutor: SqlQueryExecutor,
    filters: ListSlotsByInterviewerFilters,
  ): Promise<PremiumInterviewerSlotRow[]> {
    const conditions: string[] = ['interviewer_id = $1']
    const values: unknown[] = [filters.interviewerId]
    let parameterIndex = 2

    if (filters.status !== undefined) {
      conditions.push(`status = $${parameterIndex}`)
      values.push(filters.status)
      parameterIndex += 1
    }

    if (filters.interviewType !== undefined) {
      conditions.push(`interview_type = $${parameterIndex}`)
      values.push(filters.interviewType)
      parameterIndex += 1
    }

    const result = await queryExecutor.query<PremiumInterviewerSlotRow>(
      createSqlQuery(
        `
          SELECT
            id,
            interviewer_id,
            interview_type,
            start_time,
            end_time,
            status,
            created_at,
            updated_at
          FROM premium_interviewer_slots
          WHERE ${conditions.join(' AND ')}
          ORDER BY start_time ASC, id ASC
          LIMIT $${parameterIndex}
          OFFSET $${parameterIndex + 1};
        `,
        [...values, filters.limit, filters.offset],
      ),
    )

    return result.rows.map(function parseSlotRow(row) {
      return parsePremiumInterviewerSlotRow(row)
    })
  }

  async countSlotsByInterviewer(
    queryExecutor: SqlQueryExecutor,
    filters: CountSlotsByInterviewerFilters,
  ): Promise<number> {
    const conditions: string[] = ['interviewer_id = $1']
    const values: unknown[] = [filters.interviewerId]
    let parameterIndex = 2

    if (filters.status !== undefined) {
      conditions.push(`status = $${parameterIndex}`)
      values.push(filters.status)
      parameterIndex += 1
    }

    if (filters.interviewType !== undefined) {
      conditions.push(`interview_type = $${parameterIndex}`)
      values.push(filters.interviewType)
      parameterIndex += 1
    }

    const result = await queryExecutor.query<{ count: string }>(
      createSqlQuery(
        `
          SELECT COUNT(*) AS count
          FROM premium_interviewer_slots
          WHERE ${conditions.join(' AND ')};
        `,
        values,
      ),
    )

    return Number(result.rows[0]?.count ?? 0)
  }

  async cancelSlotIfAvailable(
    queryExecutor: SqlQueryExecutor,
    slotId: string,
    interviewerId: string,
    updatedAt: string,
  ): Promise<PremiumInterviewerSlotRow | null> {
    const result = await queryExecutor.query<PremiumInterviewerSlotRow>(
      createSqlQuery(
        `
          UPDATE premium_interviewer_slots
          SET status = 'cancelled',
              updated_at = $3
          WHERE id = $1
            AND interviewer_id = $2
            AND status = 'available'
          RETURNING
            id,
            interviewer_id,
            interview_type,
            start_time,
            end_time,
            status,
            created_at,
            updated_at;
        `,
        [slotId, interviewerId, updatedAt],
      ),
    )

    return result.rows[0] ?? null
  }

  async getSlotById(
    queryExecutor: SqlQueryExecutor,
    slotId: string,
  ): Promise<PremiumInterviewerSlotRow | null> {
    const result = await queryExecutor.query<PremiumInterviewerSlotRow>(
      createSqlQuery(
        `
          SELECT
            id,
            interviewer_id,
            interview_type,
            start_time,
            end_time,
            status,
            created_at,
            updated_at
          FROM premium_interviewer_slots
          WHERE id = $1
          LIMIT 1;
        `,
        [slotId],
      ),
    )

    const [row] = result.rows

    if (!row) {
      return null
    }

    return parsePremiumInterviewerSlotRow(row)
  }
}
