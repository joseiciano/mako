import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('credit transactions schema readiness', function creditTransactionsSchemaReadinessSuite() {
  it('keeps credit_transactions schema aligned between docs and migration SQL', async function run() {
    const [schemaDoc, migrationSql] = await Promise.all([
      readFile(
        new URL(
          '../../../../docs/system/system-design/db-schemas.md',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../migrations/20260624120000_add_credit_transactions_table.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    ])

    const normalizedSchemaDoc = normalizeWhitespace(schemaDoc)
    const normalizedMigrationSql = normalizeWhitespace(migrationSql)

    expect(normalizedSchemaDoc).toContain('### Credit_Transactions')
    expect(normalizedSchemaDoc).toContain(
      '`idx_credit_transactions_stripe_payment_intent_id` unique on (`stripe_payment_intent_id`)',
    )
    expect(normalizedSchemaDoc).toContain(
      '`idx_credit_transactions_user_id_created_at` on (`user_id`, `created_at DESC`)',
    )

    expect(normalizedMigrationSql).toContain('CREATE TABLE IF NOT EXISTS credit_transactions')
    expect(normalizedMigrationSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_stripe_payment_intent_id',
    )
    expect(normalizedMigrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id_created_at',
    )
  })

  it('locks the full credit_transactions column set and constraints in migration SQL', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../../migrations/20260624120000_add_credit_transactions_table.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    const requiredColumns = [
      'id UUID PRIMARY KEY',
      'user_id UUID NOT NULL',
      'stripe_payment_intent_id TEXT NOT NULL',
      'amount INTEGER NOT NULL',
      'credits_granted INTEGER NOT NULL',
      'status TEXT NOT NULL',
      'created_at TIMESTAMPTZ NOT NULL',
    ]

    for (const column of requiredColumns) {
      expect(normalized).toContain(column)
    }

    expect(normalized).toContain('REFERENCES "user"(id)')
    expect(normalized).toContain('CHECK (credits_granted >= 0)')
  })

  it('enforces unique stripe_payment_intent_id to prevent duplicate credit grants', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../../migrations/20260624120000_add_credit_transactions_table.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_stripe_payment_intent_id')
    expect(normalized).toContain('ON credit_transactions (stripe_payment_intent_id)')
  })

  it('indexes user_id and created_at DESC for transaction history queries', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../../migrations/20260624120000_add_credit_transactions_table.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain('CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id_created_at')
    expect(normalized).toContain('ON credit_transactions (user_id, created_at DESC)')
  })

  it('documents foreign key relationship to user table in migration SQL', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../../migrations/20260624120000_add_credit_transactions_table.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain('user_id UUID NOT NULL REFERENCES "user"(id)')
  })
})

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}