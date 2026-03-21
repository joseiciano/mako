import type { SqlQuery } from '../index'
import { toUserCompany, type UserCompany, type UserCompanyRow } from './types'

export type QueryResult<Row> = {
  rows: Row[]
}

export type SqlQueryExecutor = {
  query<Row>(query: SqlQuery): Promise<QueryResult<Row>>
}

export type AddCompanyRecordInput = {
  userId: string
  company: string
  joined: string
}

export type AccountRepositoryPort = {
  getCompaniesByUserId(userId: string): Promise<UserCompany[]>
  addCompanyRecord(input: AddCompanyRecordInput): Promise<UserCompany>
}

export class AccountRepository implements AccountRepositoryPort {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  async getCompaniesByUserId(userId: string): Promise<UserCompany[]> {
    const query: SqlQuery = {
      text: `
        SELECT
          id,
          user_id,
          company,
          joined,
          created_at,
          updated_at,
          deleted_at
        FROM "User_Companies"
        WHERE user_id = $1
          AND deleted_at IS NULL
        ORDER BY joined DESC, created_at DESC;
      `,
      values: [userId],
    }

    const result = await this.queryExecutor.query<UserCompanyRow>(query)

    return result.rows.map(function mapRowToUserCompany(row) {
      return toUserCompany(row)
    })
  }

  async addCompanyRecord(input: AddCompanyRecordInput): Promise<UserCompany> {
    const query: SqlQuery = {
      text: `
        INSERT INTO "User_Companies" (
          user_id,
          company,
          joined
        ) VALUES ($1, $2, $3)
        RETURNING
          id,
          user_id,
          company,
          joined,
          created_at,
          updated_at,
          deleted_at;
      `,
      values: [input.userId, input.company, input.joined],
    }

    const result = await this.queryExecutor.query<UserCompanyRow>(query)
    const [createdRow] = result.rows

    if (!createdRow) {
      throw new Error('Failed to insert company record')
    }

    return toUserCompany(createdRow)
  }
}
