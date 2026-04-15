import { parseUserRow, type SqlQuery, type UserRow } from '../index'
import {
  toUserCompany,
  type AccountProfileRecord,
  type UserCompany,
  type UserCompanyRow,
} from './types'

export type QueryResult<Row> = {
  rows: Row[]
  rowCount?: number
}

export type SqlQueryExecutor = {
  query<Row>(query: SqlQuery): Promise<QueryResult<Row>>
}

export interface AccountRepositoryDataSource {
  getByUserId(userId: string): Promise<AccountProfileRecord | null>
  updateDisplayName(
    userId: string,
    displayName: string,
  ): Promise<AccountProfileRecord | null>
}

export type AddCompanyRecordInput = {
  userId: string
  company: string
  joined: string
}

type AccountRepositoryDependencies = {
  dataSource?: AccountRepositoryDataSource
  queryExecutor?: SqlQueryExecutor
}

type AccountRepositoryConstructorInput =
  | AccountRepositoryDataSource
  | SqlQueryExecutor
  | AccountRepositoryDependencies

export class AccountRepository {
  private readonly dependencies: AccountRepositoryDependencies

  constructor(input: AccountRepositoryConstructorInput) {
    if (isDataSource(input)) {
      this.dependencies = { dataSource: input }
      return
    }

    if (isQueryExecutor(input)) {
      this.dependencies = { queryExecutor: input }
      return
    }

    this.dependencies = input
  }

  async getProfile(userId: string): Promise<AccountProfileRecord | null> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.getByUserId(userId)
    }

    const result = await this.getQueryExecutor().query<UserRow>({
      text: `
        SELECT
          id,
          email,
          name,
          credits,
          free_standard_interviews,
          free_ai_interviews,
          companies,
          created_at,
          updated_at,
          deleted_at
        FROM users
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1;
      `,
      values: [userId],
    })

    const [profileRow] = result.rows

    if (!profileRow) {
      return null
    }

    return toAccountProfileRecord(profileRow)
  }

  async updateProfile(
    userId: string,
    displayName: string,
  ): Promise<AccountProfileRecord | null> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.updateDisplayName(userId, displayName)
    }

    const result = await this.getQueryExecutor().query<UserRow>({
      text: `
        UPDATE users
        SET name = $2,
            updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING
          id,
          email,
          name,
          credits,
          free_standard_interviews,
          free_ai_interviews,
          companies,
          created_at,
          updated_at,
          deleted_at;
      `,
      values: [userId, displayName],
    })

    const [profileRow] = result.rows

    if (!profileRow) {
      return null
    }

    return toAccountProfileRecord(profileRow)
  }

  async deleteAccount(userId: string): Promise<boolean> {
    const query: SqlQuery = {
      text: `
        UPDATE users
        SET deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id;
      `,
      values: [userId],
    }

    const result = await this.getQueryExecutor().query<{ id: string }>(query)

    if (typeof result.rowCount === 'number') {
      return result.rowCount > 0
    }

    return result.rows.length > 0
  }

  async invalidateSessions(userId: string): Promise<void> {
    const query: SqlQuery = {
      text: `
        DELETE FROM "session"
        WHERE "userId" = $1;
      `,
      values: [userId],
    }

    await this.getQueryExecutor().query(query)
  }

  async cancelUpcomingInterviews(userId: string): Promise<void> {
    const query: SqlQuery = {
      text: `
        UPDATE interviews
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE status = 'scheduled'
          AND scheduled_at > NOW()
          AND (scheduler_id = $1 OR interviewer_id = $1);
      `,
      values: [userId],
    }

    await this.getQueryExecutor().query(query)
  }

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

    const result = await this.getQueryExecutor().query<UserCompanyRow>(query)

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

    const result = await this.getQueryExecutor().query<UserCompanyRow>(query)
    const [createdRow] = result.rows

    if (!createdRow) {
      throw new Error('Failed to insert company record')
    }

    return toUserCompany(createdRow)
  }

  private getDataSource(): AccountRepositoryDataSource {
    const dataSource = this.dependencies.dataSource

    if (!dataSource) {
      throw new Error('Account profile data source is not configured')
    }

    return dataSource
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.dependencies.queryExecutor

    if (!queryExecutor) {
      throw new Error('Account company query executor is not configured')
    }

    return queryExecutor
  }
}

export function createInMemoryAccountDataSource(
  seedProfiles: readonly AccountProfileRecord[],
): AccountRepositoryDataSource {
  const profileById = new Map<string, AccountProfileRecord>()

  for (const profile of seedProfiles) {
    profileById.set(profile.id, structuredClone(profile))
  }

  return {
    async getByUserId(userId: string): Promise<AccountProfileRecord | null> {
      const profile = profileById.get(userId)
      return profile ? structuredClone(profile) : null
    },
    async updateDisplayName(
      userId: string,
      displayName: string,
    ): Promise<AccountProfileRecord | null> {
      const existingProfile = profileById.get(userId)

      if (!existingProfile) {
        return null
      }

      const updatedProfile = {
        ...existingProfile,
        displayName,
      }

      profileById.set(userId, updatedProfile)
      return structuredClone(updatedProfile)
    },
  }
}

function isDataSource(
  input: AccountRepositoryConstructorInput,
): input is AccountRepositoryDataSource {
  return (
    typeof input === 'object' &&
    input !== null &&
    'getByUserId' in input &&
    typeof input.getByUserId === 'function' &&
    'updateDisplayName' in input &&
    typeof input.updateDisplayName === 'function'
  )
}

function isQueryExecutor(
  input: AccountRepositoryConstructorInput,
): input is SqlQueryExecutor {
  return (
    typeof input === 'object' &&
    input !== null &&
    'query' in input &&
    typeof input.query === 'function'
  )
}

function toAccountProfileRecord(rowInput: unknown): AccountProfileRecord {
  const row = parseUserRow(rowInput)

  return {
    id: row.id,
    email: row.email,
    displayName: row.name,
    credits: row.credits,
    freeStandardInterviews: row.free_standard_interviews,
    freeAiInterviews: row.free_ai_interviews,
    createdAt: row.created_at,
  }
}
