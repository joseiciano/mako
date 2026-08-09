import { createSqlQuery, type SqlQueryExecutor } from '../index'
import { bookingChannelSelect } from './booking-channel-sql'

export type PremiumCancellationInterviewRow = {
  id: string
  scheduler_id: string
  interviewer_id: string | null
  type: 'system_design' | 'coding' | 'behavioral'
  mode: 'peer_to_peer' | 'ai_led'
  tier: 'standard' | 'premium'
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
  booking_channel: 'ai_direct' | 'standard_match' | 'verified_interviewer'
  scheduled_at: string
}

export type PremiumCancellationInterviewSnapshotRow = {
  id: string
  scheduler_id: string
  interviewer_id: string | null
  mode: 'peer_to_peer' | 'ai_led'
  tier: 'standard' | 'premium'
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
  booking_channel: 'ai_direct' | 'standard_match' | 'verified_interviewer'
}

export type InsertPremiumCancellationRefundRowInput = {
  id: string
  interviewId: string
  schedulerId: string
  reason: 'interviewer_cancelled' | 'interviewer_account_deleted'
  initiatedByUserId: string
  createdAt: string
}

export class PremiumCancellationRepository {
  async lockUsersForUpdate(
    queryExecutor: SqlQueryExecutor,
    userIds: string[],
  ): Promise<{ id: string }[]> {
    const result = await queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          SELECT id
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

  async getInterviewForCancel(
    queryExecutor: SqlQueryExecutor,
    interviewId: string,
  ): Promise<PremiumCancellationInterviewRow | null> {
    const result = await queryExecutor.query<PremiumCancellationInterviewRow>(
      createSqlQuery(
        `
          SELECT
            id,
            scheduler_id,
            interviewer_id,
            type,
            mode,
            tier,
            status,
            ${bookingChannelSelect},
            scheduled_at
          FROM interviews
          WHERE id = $1
          LIMIT 1;
        `,
        [interviewId],
      ),
    )

    return result.rows[0] ?? null
  }

  async lockInterviewForUpdate(
    queryExecutor: SqlQueryExecutor,
    interviewId: string,
  ): Promise<PremiumCancellationInterviewRow | null> {
    const result = await queryExecutor.query<PremiumCancellationInterviewRow>(
      createSqlQuery(
        `
          SELECT
            id,
            scheduler_id,
            interviewer_id,
            type,
            mode,
            tier,
            status,
            ${bookingChannelSelect},
            scheduled_at
          FROM interviews
          WHERE id = $1
          LIMIT 1
          FOR UPDATE;
        `,
        [interviewId],
      ),
    )

    return result.rows[0] ?? null
  }

  async cancelInterviewIfScheduled(
    queryExecutor: SqlQueryExecutor,
    interviewId: string,
    updatedAt: string,
  ): Promise<PremiumCancellationInterviewRow | null> {
    const result = await queryExecutor.query<PremiumCancellationInterviewRow>(
      createSqlQuery(
        `
          UPDATE interviews
          SET status = 'cancelled',
              updated_at = $2
          WHERE id = $1
            AND status = 'scheduled'
          RETURNING
            id,
            scheduler_id,
            interviewer_id,
            type,
            mode,
            tier,
            status,
            ${bookingChannelSelect},
            scheduled_at;
        `,
        [interviewId, updatedAt],
      ),
    )

    return result.rows[0] ?? null
  }

  async insertRefundRow(
    queryExecutor: SqlQueryExecutor,
    input: InsertPremiumCancellationRefundRowInput,
  ): Promise<{ id: string } | null> {
    const result = await queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          INSERT INTO premium_booking_credit_refunds (
            id,
            interview_id,
            scheduler_id,
            reason,
            initiated_by_user_id,
            credits_refunded,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, 1, $6)
          ON CONFLICT (interview_id) DO NOTHING
          RETURNING id;
        `,
        [
          input.id,
          input.interviewId,
          input.schedulerId,
          input.reason,
          input.initiatedByUserId,
          input.createdAt,
        ],
      ),
    )

    return result.rows[0] ?? null
  }

  async incrementSchedulerCredits(
    queryExecutor: SqlQueryExecutor,
    schedulerId: string,
    updatedAt: string,
  ): Promise<{ id: string } | null> {
    const result = await queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE "user"
          SET credits = credits + 1,
              "updatedAt" = $2
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id;
        `,
        [schedulerId, updatedAt],
      ),
    )

    return result.rows[0] ?? null
  }

  async listAllUpcomingInterviewsForUser(
    queryExecutor: SqlQueryExecutor,
    userId: string,
  ): Promise<PremiumCancellationInterviewSnapshotRow[]> {
    const result = await queryExecutor.query<PremiumCancellationInterviewSnapshotRow>(
      createSqlQuery(
        `
          SELECT
            id,
            scheduler_id,
            interviewer_id,
            mode,
            tier,
            status,
            ${bookingChannelSelect}
          FROM interviews
          WHERE status = 'scheduled'
            AND scheduled_at > NOW()
            AND (scheduler_id = $1 OR interviewer_id = $1);
        `,
        [userId],
      ),
    )

    return result.rows
  }

  async lockInterviewsForUpdate(
    queryExecutor: SqlQueryExecutor,
    interviewIds: string[],
  ): Promise<PremiumCancellationInterviewSnapshotRow[]> {
    const result = await queryExecutor.query<PremiumCancellationInterviewSnapshotRow>(
      createSqlQuery(
        `
          SELECT
            id,
            scheduler_id,
            interviewer_id,
            mode,
            tier,
            status,
            ${bookingChannelSelect}
          FROM interviews
          WHERE id = ANY($1::uuid[])
          ORDER BY id
          FOR UPDATE;
        `,
        [interviewIds],
      ),
    )

    return result.rows
  }
}
