import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('interview booking_channel schema readiness', function bookingChannelReadinessSuite() {
  it('adds booking_channel as a nullable TEXT column with a CHECK constraint and no backfill', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../../migrations/20260807150000_add_interviews_booking_channel.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain('ADD COLUMN IF NOT EXISTS booking_channel TEXT')
    expect(normalized).toContain(
      "booking_channel IS NULL OR booking_channel IN ('ai_direct', 'standard_match', 'verified_interviewer')",
    )

    // Backward-compatible first deployment: no NOT NULL contraction, no
    // database default, and no backfill UPDATE (Story 7.11 owns contraction).
    expect(normalized).not.toContain('booking_channel TEXT NOT NULL')
    expect(normalized).not.toContain('DEFAULT')
    expect(normalized).not.toMatch(/UPDATE interviews/i)
  })
})

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
