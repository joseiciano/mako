import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { resolveLocalTestDatabaseUrl } from '../database/test-database-url'

type RateLimitColumn = {
  column_name: string
  data_type: string
  is_nullable: string
}

describe('rateLimit schema readiness', function rateLimitSchemaReadinessSuite() {
  let client: Client

  beforeAll(async function connect() {
    client = new Client({ connectionString: resolveLocalTestDatabaseUrl() })
    await client.connect()
  })

  afterAll(async function disconnect() {
    await client.end()
  })

  it('exposes the exact Better Auth rateLimit columns after migrations', async function run() {
    const result = await client.query<RateLimitColumn>(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'rateLimit'
      ORDER BY ordinal_position
    `)

    expect(result.rows).toEqual([
      { column_name: 'key', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'count', data_type: 'integer', is_nullable: 'NO' },
      { column_name: 'lastRequest', data_type: 'bigint', is_nullable: 'NO' },
    ])
  })

  it('locks key as the single-column primary key of rateLimit', async function run() {
    const result = await client.query<{ column_name: string }>(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'rateLimit'
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
    `)

    expect(result.rows.map(function toColumnName(row) {
      return row.column_name
    })).toEqual(['key'])
  })

  it('creates rateLimit with no user or profile columns', async function run() {
    const result = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'rateLimit'
    `)

    expect(
      result.rows.map(function toColumnName(row) {
        return row.column_name
      }).sort(),
    ).toEqual(['count', 'key', 'lastRequest'])
  })
})
