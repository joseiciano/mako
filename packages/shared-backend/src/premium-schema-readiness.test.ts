import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('premium schema readiness', function premiumSchemaReadinessSuite() {
  it('locks the premium scheduling tables and key constraints in migration SQL', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../migrations/20260807160000_add_premium_scheduling_tables.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain(
      'CREATE TABLE IF NOT EXISTS premium_interviewer_slots',
    )
    expect(normalized).toContain('CREATE TABLE IF NOT EXISTS premium_slot_claims')
    expect(normalized).toContain(
      'CREATE TABLE IF NOT EXISTS premium_booking_credit_refunds',
    )
  })

  it('locks the premium_interviewer_slots status CHECK to available/claimed/cancelled', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../migrations/20260807160000_add_premium_scheduling_tables.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain(
      "status IN ('available', 'claimed', 'cancelled')",
    )
  })

  it('locks the exact 60-minute CHECK on premium_interviewer_slots', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../migrations/20260807160000_add_premium_scheduling_tables.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain("end_time = start_time + interval '60 minutes'")
  })

  it('locks the premium_interviewer_slots interview-type CHECK', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../migrations/20260807160000_add_premium_scheduling_tables.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain(
      "interview_type IN ('system_design', 'coding', 'behavioral')",
    )
  })

  it('locks the four premium_interviewer_slots indexes in migration SQL', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../migrations/20260807160000_add_premium_scheduling_tables.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain(
      'CREATE INDEX IF NOT EXISTS idx_premium_interviewer_slots_interviewer_active ON premium_interviewer_slots (interviewer_id, start_time, end_time) WHERE status <> \'cancelled\';',
    )
    expect(normalized).toContain(
      'CREATE INDEX IF NOT EXISTS idx_premium_interviewer_slots_available_start ON premium_interviewer_slots (status, start_time, id);',
    )
    expect(normalized).toContain(
      'CREATE INDEX IF NOT EXISTS idx_premium_interviewer_slots_interviewer_start ON premium_interviewer_slots (interviewer_id, start_time, id);',
    )
    expect(normalized).toContain(
      'CREATE INDEX IF NOT EXISTS idx_premium_interviewer_slots_interviewer_status_start ON premium_interviewer_slots (interviewer_id, status, start_time, id);',
    )
  })

  it('locks premium_slot_claims to idempotency_key UUID PRIMARY KEY with no surrogate id in original migration', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../migrations/20260807160000_add_premium_scheduling_tables.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)
    const claimsStart = normalized.indexOf(
      'CREATE TABLE IF NOT EXISTS premium_slot_claims (',
    )
    const claimsEnd = normalized.indexOf(');', claimsStart)
    const claimsBlock = normalized.slice(claimsStart, claimsEnd + 2)

    expect(claimsBlock).toContain(
      'idempotency_key UUID PRIMARY KEY',
    )
    expect(claimsBlock).not.toContain(
      'id UUID PRIMARY KEY',
    )
  })

  it('locks the unique slot_id and unique interview_id constraints on premium_slot_claims', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../migrations/20260807160000_add_premium_scheduling_tables.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain(
      'slot_id UUID NOT NULL UNIQUE REFERENCES premium_interviewer_slots(id)',
    )
    expect(normalized).toContain(
      'interview_id UUID NOT NULL UNIQUE REFERENCES interviews(id)',
    )
  })

  it('corrects premium_slot_claims to use idempotency_key as PRIMARY KEY with no surrogate id', async function run() {
    const correctiveMigrationSql = await readFile(
      new URL(
        '../migrations/20260808120000_correct_premium_slot_claims_primary_key.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(correctiveMigrationSql)

    expect(normalized).toContain(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'premium_slot_claims' AND column_name = 'id'",
    )
    expect(normalized).toContain(
      "ALTER TABLE premium_slot_claims DROP CONSTRAINT IF EXISTS premium_slot_claims_pkey",
    )
    expect(normalized).toContain(
      "ALTER TABLE premium_slot_claims DROP CONSTRAINT IF EXISTS premium_slot_claims_idempotency_key_key",
    )
    expect(normalized).toContain(
      "ALTER TABLE premium_slot_claims ADD CONSTRAINT premium_slot_claims_pkey PRIMARY KEY (idempotency_key)",
    )
    expect(normalized).toContain(
      "ALTER TABLE premium_slot_claims DROP COLUMN IF EXISTS id",
    )
  })

  it('locks the premium_booking_credit_refunds reason CHECK, credits CHECK, NOT NULL initiated_by_user_id, and scheduler index', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../migrations/20260807160000_add_premium_scheduling_tables.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain(
      "reason IN ('interviewer_cancelled', 'interviewer_account_deleted')",
    )
    expect(normalized).toContain('credits_refunded = 1')
    expect(normalized).toContain('initiated_by_user_id UUID NOT NULL')
    expect(normalized).toContain(
      'CREATE INDEX IF NOT EXISTS idx_premium_booking_credit_refunds_scheduler ON premium_booking_credit_refunds (scheduler_id, created_at);',
    )
  })
})

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
