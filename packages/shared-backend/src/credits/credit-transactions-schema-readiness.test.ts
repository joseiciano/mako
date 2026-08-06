import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, it } from 'vitest'
import { creditTransactionSchema as clientCreditTransactionSchema } from '@mako/shared'
import { creditTransactionRowSchema } from '../credit/types'

describe('credit transactions schema readiness', function creditTransactionsSchemaReadinessSuite() {
  let normalizedMigrationSql: string

  beforeAll(async function setup() {
    const migrationSql = await readFile(
      new URL(
        '../../migrations/20260624120000_add_credit_transactions_table.sql',
        import.meta.url,
      ),
      'utf8',
    )
    normalizedMigrationSql = normalizeWhitespace(migrationSql)
  })

  it('keeps credit_transactions schema aligned between docs and migration SQL', async function run() {
    const schemaDoc = await readFile(
      new URL(
        '../../../../docs/system/system-design/db-schemas.md',
        import.meta.url,
      ),
      'utf8',
    )

    const normalizedSchemaDoc = normalizeWhitespace(schemaDoc)

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
      expect(normalizedMigrationSql).toContain(column)
    }

    expect(normalizedMigrationSql).toContain('REFERENCES "user"(id)')
    expect(normalizedMigrationSql).toContain('CHECK (credits_granted >= 0)')
    expect(normalizedMigrationSql).toContain('CHECK (amount >= 0)')
    expect(normalizedMigrationSql).toContain("CHECK (status IN ('succeeded', 'pending', 'failed'))")
  })

  it('enforces unique stripe_payment_intent_id to prevent duplicate credit grants', async function run() {
    expect(normalizedMigrationSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_stripe_payment_intent_id ON credit_transactions (stripe_payment_intent_id);')
  })

  it('indexes user_id and created_at DESC for transaction history queries', async function run() {
    expect(normalizedMigrationSql).toContain('CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id_created_at ON credit_transactions (user_id, created_at DESC);')
  })

  it('documents foreign key relationship to user table in migration SQL', async function run() {
    expect(normalizedMigrationSql).toContain('user_id UUID NOT NULL REFERENCES "user"(id)')
  })

  it('permits zero amount and zero credits_granted CreditTransaction rows end to end', async function run() {
    // Migration CHECK constraints must explicitly allow zero-valued rows.
    expect(normalizedMigrationSql).toContain('CHECK (amount >= 0)')
    expect(normalizedMigrationSql).toContain('CHECK (credits_granted >= 0)')
    expect(normalizedMigrationSql).not.toContain('CHECK (amount > 0)')
    expect(normalizedMigrationSql).not.toContain('CHECK (credits_granted > 0)')

    // Internal DB row schema maps a zero-valued row without rejection.
    expect(
      creditTransactionRowSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        stripe_payment_intent_id: 'pi_zero',
        amount: 0,
        credits_granted: 0,
        status: 'succeeded',
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({ amount: 0, credits_granted: 0 })

    // Client response schema accepts a zero-valued transaction.
    expect(
      clientCreditTransactionSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        amount: 0,
        credits_granted: 0,
        status: 'succeeded',
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({ amount: 0, credits_granted: 0 })
  })
})

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
