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

  it('documents notification reliability tables and key indexes/constraints from migration SQL', async function run() {
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
          '../../migrations/20260522120000_add_notification_reliability_tables.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    ])

    const normalizedSchemaDoc = normalizeWhitespace(schemaDoc)
    const normalizedMigrationSql = normalizeWhitespace(migrationSql)

    expect(normalizedSchemaDoc).toContain('### notification_outbox_events')
    expect(normalizedSchemaDoc).toContain('### notification_processing_checkpoints')
    expect(normalizedSchemaDoc).toContain('### notification_reminder_schedules')
    expect(normalizedSchemaDoc).toContain(
      '`idx_notification_outbox_events_pending` on (`created_at`) WHERE `status = \'pending\'`',
    )
    expect(normalizedSchemaDoc).toContain(
      'Composite primary key on (`idempotency_key`, `checkpoint_key`)',
    )
    expect(normalizedSchemaDoc).toContain(
      '`idx_notification_reminder_schedules_due` on (`reminder_due_at`) WHERE `status = \'pending\'`',
    )
    expect(normalizedSchemaDoc).toContain(
      '`idx_notification_reminder_schedules_active_interview` unique on (`interview_id`) WHERE `status = \'pending\'`',
    )

    expect(normalizedMigrationSql).toContain('CREATE TABLE IF NOT EXISTS notification_outbox_events')
    expect(normalizedMigrationSql).toContain('CREATE TABLE IF NOT EXISTS notification_processing_checkpoints')
    expect(normalizedMigrationSql).toContain('CREATE TABLE IF NOT EXISTS notification_reminder_schedules')
    expect(normalizedMigrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_notification_outbox_events_pending ON notification_outbox_events (created_at) WHERE status = \'pending\';',
    )
    expect(normalizedMigrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_notification_reminder_schedules_due ON notification_reminder_schedules (reminder_due_at) WHERE status = \'pending\';',
    )
    expect(normalizedMigrationSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_reminder_schedules_active_interview ON notification_reminder_schedules (interview_id) WHERE status = \'pending\';',
    )
  })
})

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
