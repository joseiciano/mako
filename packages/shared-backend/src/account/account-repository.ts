import { createSqlQuery, type SqlQuery } from '../index'

export type SqlQueryResult = {
  rowCount: number
}

export type AccountDatabase = {
  query: (query: SqlQuery) => Promise<SqlQueryResult>
}

export class AccountRepository {
  constructor(private readonly database: AccountDatabase) {}

  async deleteAccount(userId: string): Promise<boolean> {
    const query = createSqlQuery(
      `UPDATE users
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL`,
      [userId],
    )

    const result = await this.database.query(query)
    return result.rowCount > 0
  }

  async invalidateSessions(userId: string): Promise<void> {
    const query = createSqlQuery(
      `DELETE FROM "session"
       WHERE "userId" = $1`,
      [userId],
    )

    await this.database.query(query)
  }

  async cancelUpcomingInterviews(userId: string): Promise<void> {
    const query = createSqlQuery(
      `UPDATE interviews
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE status = 'scheduled'
         AND scheduled_at > NOW()
         AND (scheduler_id = $1 OR interviewer_id = $1)`,
      [userId],
    )

    await this.database.query(query)
  }
}
