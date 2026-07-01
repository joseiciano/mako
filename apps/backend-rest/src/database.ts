import {
  createPostgresConnectionPool,
  type PostgresConnectionClient,
  type PostgresConnectionPool,
  type PostgresQueryResult,
  type SqlQuery,
  type SqlQueryExecutor,
} from '@mako/shared-backend'

export type DatabaseBinding = {
  query: (
    statementText: string,
    ...statementValues: readonly unknown[]
  ) => Promise<{ rows: unknown[] }>
}

export type HyperdriveBinding = {
  connectionString: string
}

export type DatabaseBindings = {
  DB?: DatabaseBinding
  HYPERDRIVE?: HyperdriveBinding
}

type PostgresClient = Awaited<
  ReturnType<ReturnType<typeof createPostgresConnectionPool>['connect']>
>

type PostgresPool = ReturnType<typeof createPostgresConnectionPool>

export function createDatabaseQueryExecutor(bindings: DatabaseBindings): SqlQueryExecutor {
  let transactionClient: PostgresClient | null = null

  return {
    async query<Row>(queryInput: SqlQuery) {
      const database = bindings.DB

      if (database) {
        const result = await database.query(queryInput.text, ...queryInput.values)

        return {
          rows: result.rows as Row[],
        }
      }

      const connectionString = bindings.HYPERDRIVE?.connectionString

      if (!connectionString) {
        throw new Error('Database binding `HYPERDRIVE` is not configured')
      }

      const pool = createPostgresConnectionPool(connectionString) as PostgresPool
      const statementValues = [...queryInput.values]
      const normalizedStatementText = normalizeSqlStatement(queryInput.text)
      const isBegin = normalizedStatementText === 'BEGIN;'
      const isCommit = normalizedStatementText === 'COMMIT;'
      const isRollback = normalizedStatementText === 'ROLLBACK;'

      if (isBegin) {
        if (transactionClient) {
          throw new Error('Transaction is already active for this query executor')
        }

        const client = await pool.connect()
        transactionClient = client

        try {
          const result = await client.query(queryInput.text, statementValues)

          return {
            rows: result.rows as Row[],
            rowCount: result.rowCount ?? undefined,
          }
        } catch (error) {
          await client.release()
          transactionClient = null
          throw error
        }
      }

      const activeQueryTarget = transactionClient ?? pool

      try {
        const result = await activeQueryTarget.query(queryInput.text, statementValues)

        return {
          rows: result.rows as Row[],
          rowCount: result.rowCount ?? undefined,
        }
      } finally {
        if ((isCommit || isRollback) && transactionClient) {
          await transactionClient.release()
          transactionClient = null
        }
      }
    },
  }
}

function normalizeSqlStatement(statementText: string): string {
  return statementText.trim().replace(/\s+/g, ' ').toUpperCase()
}
