import { createSqlQuery } from '../index'
import {
  type UserAccountPolicy,
} from './types'

export type SqlQueryExecutor = {
  query<Row>(query: { text: string; values: readonly unknown[] }): Promise<{ rows: Row[]; rowCount?: number }>
}

export class TierPolicyRepository {
  async lockUserForUpdate(
    queryExecutor: SqlQueryExecutor,
    userId: string,
  ): Promise<UserAccountPolicy | null> {
    const result = await queryExecutor.query<{
      id: string
      free_standard_interviews: number
      free_ai_interviews: number
      credits: number
    }>(
      createSqlQuery(
        `
          SELECT
            id,
            free_standard_interviews,
            free_ai_interviews,
            credits
          FROM "user"
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE;
        `,
        [userId],
      ),
    )

    const [row] = result.rows

    if (!row) {
      return null
    }

    return {
      userId: row.id,
      freeStandardInterviews: row.free_standard_interviews,
      freeAiInterviews: row.free_ai_interviews,
      credits: row.credits,
    }
  }

  async decrementFreeAiInterview(
    queryExecutor: SqlQueryExecutor,
    userId: string,
  ): Promise<boolean> {
    const result = await queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE "user"
          SET free_ai_interviews = free_ai_interviews - 1,
              "updatedAt" = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
            AND free_ai_interviews > 0
          RETURNING id;
        `,
        [userId],
      ),
    )

    return (result.rowCount ?? result.rows.length) > 0
  }

  async decrementFreeStandardInterview(
    queryExecutor: SqlQueryExecutor,
    userId: string,
  ): Promise<boolean> {
    const result = await queryExecutor.query<{ id: string }>(
      createSqlQuery(
        `
          UPDATE "user"
          SET free_standard_interviews = free_standard_interviews - 1,
              "updatedAt" = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
            AND free_standard_interviews > 0
          RETURNING id;
        `,
        [userId],
      ),
    )

    return (result.rowCount ?? result.rows.length) > 0
  }
}
