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

  it('documents interview optional columns in db-schemas.md and migration SQL', async function run() {
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
          '../../migrations/20260402123000_add_interviews_table.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    ])

    const normalizedSchemaDoc = normalizeWhitespace(schemaDoc)
    const normalizedMigrationSql = normalizeWhitespace(migrationSql)

    const optionalColumns = [
      'realtime_session_id',
      'excalidraw_room_id',
      'excalidraw_key',
      'recording_url',
      'screenshot_urls',
      'feedback',
    ]

    for (const column of optionalColumns) {
      expect(normalizedSchemaDoc).toContain(column)
      expect(normalizedMigrationSql).toContain(column)
    }
  })

  it('locks the full interviews column set and enum/check constraints in migration SQL', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../../migrations/20260402123000_add_interviews_table.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    const requiredColumns = [
      'id UUID PRIMARY KEY',
      'scheduler_id UUID NOT NULL',
      'scheduler_alias TEXT NOT NULL',
      'interviewer_id UUID',
      'interviewer_alias TEXT NOT NULL',
      'type TEXT NOT NULL',
      'mode TEXT NOT NULL',
      'tier TEXT NOT NULL',
      'status TEXT NOT NULL',
      'scheduled_at TIMESTAMPTZ NOT NULL',
      'created_at TIMESTAMPTZ NOT NULL',
      'updated_at TIMESTAMPTZ NOT NULL',
    ]

    for (const column of requiredColumns) {
      expect(normalized).toContain(column)
    }

    expect(normalized).toContain("type IN ('system_design', 'coding', 'behavioral')")
    expect(normalized).toContain("mode IN ('peer_to_peer', 'ai_led')")
    expect(normalized).toContain("tier IN ('standard', 'premium')")
    expect(normalized).toContain("status IN ('scheduled', 'ongoing', 'completed', 'cancelled')")
  })

  it('locks nullable vs required expectations for interviewer_id and optional session fields', async function run() {
    const migrationSql = await readFile(
      new URL(
        '../../migrations/20260402123000_add_interviews_table.sql',
        import.meta.url,
      ),
      'utf8',
    )

    const normalized = normalizeWhitespace(migrationSql)

    expect(normalized).toContain('interviewer_id UUID REFERENCES users(id)')
    expect(normalized).not.toContain('interviewer_id UUID NOT NULL')

    const nullableSessionFields = [
      'realtime_session_id TEXT',
      'excalidraw_room_id TEXT',
      'excalidraw_key TEXT',
      'recording_url TEXT',
      'screenshot_urls JSONB',
      'feedback JSONB',
    ]

    for (const field of nullableSessionFields) {
      expect(normalized).toContain(field)
      const fieldWithoutNullable = field.replace(/\s*$/, '')
      expect(normalized).not.toContain(`${fieldWithoutNullable} NOT NULL`)
    }

    expect(normalized).toContain('scheduler_id UUID NOT NULL')
    expect(normalized).toContain('scheduler_alias TEXT NOT NULL')
    expect(normalized).toContain('interviewer_alias TEXT NOT NULL')
  })
})

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
