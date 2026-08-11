import { createSqlQuery, type SqlQueryExecutor } from '../index'
import { premiumSlotWindowMinutes } from './premium-policy-config'

export async function findInterviewOverlap(
  queryExecutor: SqlQueryExecutor,
  userId: string,
  startTime: string,
  endTime: string,
): Promise<{ id: string } | null> {
  const adjustedStart = new Date(
    new Date(startTime).getTime() - premiumSlotWindowMinutes * 60 * 1000,
  ).toISOString()

  const result = await queryExecutor.query<{ id: string }>(
    createSqlQuery(
      `
        SELECT id
        FROM interviews
        WHERE (interviewer_id = $1 OR scheduler_id = $1)
          AND status IN ('scheduled', 'ongoing')
          AND scheduled_at < $3
          AND scheduled_at > $2
        LIMIT 1;
      `,
      [userId, adjustedStart, endTime],
    ),
  )

  return result.rows[0] ?? null
}

export async function findPremiumSlotOverlap(
  queryExecutor: SqlQueryExecutor,
  userId: string,
  startTime: string,
  endTime: string,
  excludeSlotId?: string,
): Promise<{ id: string } | null> {
  if (excludeSlotId) {
    const result = await queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          SELECT id
          FROM premium_interviewer_slots
          WHERE interviewer_id = $1
            AND status <> 'cancelled'
            AND start_time < $3
            AND end_time > $2
            AND id != $4
          LIMIT 1;
        `,
        [userId, startTime, endTime, excludeSlotId],
      ),
    )

    return result.rows[0] ?? null
  }

  const result = await queryExecutor.query<{ id: string }>(
    createSqlQuery(
      `
        SELECT id
        FROM premium_interviewer_slots
        WHERE interviewer_id = $1
          AND status <> 'cancelled'
          AND start_time < $3
          AND end_time > $2
        LIMIT 1;
      `,
      [userId, startTime, endTime],
    ),
  )

  return result.rows[0] ?? null
}

export function computeInterviewEndTime(startTime: string): string {
  return new Date(
    new Date(startTime).getTime() + premiumSlotWindowMinutes * 60 * 1000,
  ).toISOString()
}
