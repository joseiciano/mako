import { Client, type QueryResultRow } from 'pg'

export type PostgresQueryResult<Row> = {
  rows: Row[]
  rowCount: number | null
}

export type PostgresConnectionClient = {
  query<Row extends QueryResultRow = QueryResultRow>(
    statementText: string,
    statementValues?: readonly unknown[],
  ): Promise<PostgresQueryResult<Row>>
  release(): Promise<void>
}

export type PostgresConnectionPool = {
  query<Row extends QueryResultRow = QueryResultRow>(
    statementText: string,
    statementValues?: readonly unknown[],
  ): Promise<PostgresQueryResult<Row>>
  connect(): Promise<PostgresConnectionClient>
  end(): Promise<void>
}

export function createPostgresConnectionPool(
  connectionString: string,
): PostgresConnectionPool {
  return {
    async query<Row extends QueryResultRow = QueryResultRow>(
      statementText: string,
      statementValues: readonly unknown[] = [],
    ) {
      const client = new Client({
        connectionString,
      })

      await client.connect()

      try {
        return await executeClientQuery<Row>(client, statementText, statementValues)
      } finally {
        await client.end()
      }
    },
    async connect(): Promise<PostgresConnectionClient> {
      const client = new Client({
        connectionString,
      })

      await client.connect()

      return {
        async query<Row extends QueryResultRow = QueryResultRow>(
          statementText: string,
          statementValues: readonly unknown[] = [],
        ) {
          return executeClientQuery<Row>(client, statementText, statementValues)
        },
        async release() {
          await client.end()
        },
      }
    },
    async end() {},
  }
}

async function executeClientQuery<Row extends QueryResultRow = QueryResultRow>(
  client: Client,
  statementText: string,
  statementValues: readonly unknown[],
): Promise<PostgresQueryResult<Row>> {
  const result = await client.query<Row>(statementText, [...statementValues])

  return {
    rows: result.rows,
    rowCount: result.rowCount ?? null,
  }
}
