import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('interview booking_channel contraction readiness', function bookingChannelContractionSuite() {
  it('contracts booking_channel to NOT NULL with a guarded precondition and no backfill UPDATE', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../../migrations/20260807170000_contract_interviews_booking_channel_not_null.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    // The migration aborts if any NULL row survives before the validated CHECK
    // or SET NOT NULL runs, so a leftover null can never pass through.
    expect(normalized).toContain("RAISE EXCEPTION 'booking_channel nulls remain'")

    // Contract via a NOT VALID helper CHECK, validate it without a full-table
    // ACCESS EXCLUSIVE lock, then a fast SET NOT NULL, then drop the helper.
    expect(normalized).toContain('CHECK (booking_channel IS NOT NULL) NOT VALID')
    expect(normalized).toContain('VALIDATE CONSTRAINT')
    expect(normalized).toContain('ALTER COLUMN booking_channel SET NOT NULL')
    expect(normalized).toContain(
      'DROP CONSTRAINT interviews_booking_channel_not_null_check',
    )

    // The contraction must never backfill: any remaining NULL aborts in the
    // guarded precondition. Backfill belongs in the resumable bounded script.
    expect(normalized).not.toMatch(/UPDATE interviews/i)
  })

  it('keeps the backfill as a resumable bounded repeated sweep in the backfill script', async function run() {
    const backfillScript = await readFile(
      new URL('../../scripts/backfill-booking-channel.mjs', import.meta.url),
      'utf8',
    )

    const normalized = normalizeWhitespace(backfillScript)

    // Bounded, resumable repeated sweep from the beginning over NULL rows,
    // never a monotonic cursor and never one unbounded UPDATE.
    expect(normalized).toContain('WHERE booking_channel IS NULL')
    expect(normalized).toContain('ORDER BY id LIMIT')

    // Derive the channel deterministically from mode.
    expect(normalized).toContain(
      "CASE WHEN mode = 'ai_led' THEN 'ai_direct' ELSE 'standard_match' END",
    )
  })

  it('exposes the deploy-workflow readiness query that counts NULL booking_channel rows', async function run() {
    const readinessScript = await readFile(
      new URL(
        '../../scripts/check-booking-channel-readiness.mjs',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(readinessScript)

    expect(normalized).toContain(
      'SELECT count(*) FROM interviews WHERE booking_channel IS NULL',
    )
  })
})

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
