import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('interview schema readiness', function interviewSchemaReadinessSuite() {
  it('keeps interview list indexes aligned between docs and migration SQL for filtered and unfiltered list paths', async function run() {
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
          '../../migrations/20260415120000_add_interview_participant_indexes.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    ])

    const normalizedSchemaDoc = normalizeWhitespace(schemaDoc)
    const normalizedMigrationSql = normalizeWhitespace(migrationSql)

    expect(normalizedSchemaDoc).toContain(
      '`idx_interviews_scheduler_scheduled_at_id` on (`scheduler_id`, `scheduled_at`, `id`)',
    )
    expect(normalizedSchemaDoc).toContain(
      '`idx_interviews_interviewer_scheduled_at_id` on (`interviewer_id`, `scheduled_at`, `id`)',
    )
    expect(normalizedSchemaDoc).toContain(
      '`idx_interviews_scheduler_status_scheduled_at_id` on (`scheduler_id`, `status`, `scheduled_at`, `id`)',
    )
    expect(normalizedSchemaDoc).toContain(
      '`idx_interviews_interviewer_status_scheduled_at_id` on (`interviewer_id`, `status`, `scheduled_at`, `id`)',
    )
    expect(normalizedMigrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_interviews_scheduler_scheduled_at_id ON interviews (scheduler_id, scheduled_at, id);',
    )
    expect(normalizedMigrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_interviews_interviewer_scheduled_at_id ON interviews (interviewer_id, scheduled_at, id);',
    )
    expect(normalizedMigrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_interviews_scheduler_status_scheduled_at_id ON interviews (scheduler_id, status, scheduled_at, id);',
    )
    expect(normalizedMigrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_interviews_interviewer_status_scheduled_at_id ON interviews (interviewer_id, status, scheduled_at, id);',
    )
  })
})

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
