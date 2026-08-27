import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('feedback and artifact schema readiness', function feedbackSchemaReadinessSuite() {
  let normalizedMigrationSql: string
  let normalizedSchemaDoc: string

  async function loadFiles() {
    const [migrationSql, schemaDoc] = await Promise.all([
      readFile(
        new URL(
          '../../migrations/20260807120000_add_feedback_and_artifact_schema.sql',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../../docs/system/system-design/db-schemas.md',
          import.meta.url,
        ),
        'utf8',
      ),
    ])
    normalizedMigrationSql = normalizeWhitespace(migrationSql)
    normalizedSchemaDoc = normalizeWhitespace(schemaDoc)
  }

  it('adds feedback processing columns to interviews table', async function run() {
    await loadFiles()

    const feedbackColumns = [
      "recording_status TEXT NOT NULL DEFAULT 'not_started'",
      'screenshots_finalized_at TIMESTAMPTZ',
      'transcript TEXT',
      "feedback_status TEXT NOT NULL DEFAULT 'not_started'",
      'feedback_unavailable_reason TEXT',
      'feedback_error_code TEXT',
      'feedback_prompt_version TEXT',
      'feedback_generated_at TIMESTAMPTZ',
      'feedback_attempt_id TEXT',
      'feedback_processing_started_at TIMESTAMPTZ',
      'feedback_processing_heartbeat_at TIMESTAMPTZ',
    ]

    for (const column of feedbackColumns) {
      expect(normalizedMigrationSql).toContain(column)
    }
  })

  it('constrains recording_status to documented enum values', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain(
      "recording_status IN ('not_started', 'pending', 'recording', 'processing', 'ready', 'failed')",
    )
  })

  it('constrains feedback_status to documented enum values', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain(
      "feedback_status IN ('not_started', 'pending', 'processing', 'ready', 'failed')",
    )
  })

  it('constrains feedback_unavailable_reason to documented enum values', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain(
      "feedback_unavailable_reason IN ('no_consent', 'unsupported_format', 'no_recording')",
    )
  })

  it('constrains feedback_error_code to documented enum values', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain(
      "feedback_error_code IN ('assets_not_ready', 'transcription_failed', 'analysis_failed', 'invalid_feedback', 'internal_error')",
    )
  })

  it('adds cross-field check constraints for feedback status transitions', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain('interviews_feedback_ready_check')
    expect(normalizedMigrationSql).toContain('interviews_feedback_failed_check')
    expect(normalizedMigrationSql).toContain('interviews_feedback_processing_check')
    expect(normalizedMigrationSql).toContain('interviews_feedback_not_started_check')
    expect(normalizedMigrationSql).toContain('interviews_feedback_pending_check')
  })

  it('creates interview_artifacts table with required columns and constraints', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain('CREATE TABLE IF NOT EXISTS interview_artifacts')
    expect(normalizedMigrationSql).toContain('id UUID PRIMARY KEY')
    expect(normalizedMigrationSql).toContain('interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE')
    expect(normalizedMigrationSql).toContain(
      "artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('playback_recording', 'transcription_audio', 'screenshot'))",
    )
    expect(normalizedMigrationSql).toContain('object_key TEXT')
    expect(normalizedMigrationSql).toContain('provider_asset_id TEXT')
    expect(normalizedMigrationSql).toContain('idempotency_key TEXT')
    expect(normalizedMigrationSql).toContain('content_metadata JSONB')
    expect(normalizedMigrationSql).toContain('expires_at TIMESTAMPTZ')
    expect(normalizedMigrationSql).toContain('deleted_at TIMESTAMPTZ')
  })

  it('creates unique indexes for interview_artifacts idempotency and provider asset', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain('idx_interview_artifacts_interview_idempotency')
    expect(normalizedMigrationSql).toContain('idx_interview_artifacts_provider_asset')
    expect(normalizedMigrationSql).toContain('idx_interview_artifacts_interview_kind')
    expect(normalizedMigrationSql).toContain('idx_interview_artifacts_expiry')
  })

  it('creates interview_recordings table with required columns and constraints', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain('CREATE TABLE IF NOT EXISTS interview_recordings')
    expect(normalizedMigrationSql).toContain('provider_recording_id TEXT NOT NULL')
    expect(normalizedMigrationSql).toContain(
      "recording_type TEXT NOT NULL CHECK (recording_type IN ('composite', 'participant_track'))",
    )
    expect(normalizedMigrationSql).toContain('finalization_status TEXT NOT NULL')
    expect(normalizedMigrationSql).toContain(
      "finalization_status IN ('pending', 'processing', 'finalized', 'failed')",
    )
  })

  it('creates unique index for provider_recording_id', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain('idx_interview_recordings_provider')
    expect(normalizedMigrationSql).toContain('idx_interview_recordings_interview_type')
    expect(normalizedMigrationSql).toContain('idx_interview_recordings_stop_reconcile')
    expect(normalizedMigrationSql).toContain('idx_interview_recordings_pending_finalization')
  })

  it('creates interview_recording_consents table with composite primary key', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain('CREATE TABLE IF NOT EXISTS interview_recording_consents')
    expect(normalizedMigrationSql).toContain(
      "decision TEXT NOT NULL CHECK (decision IN ('consented', 'declined'))",
    )
    expect(normalizedMigrationSql).toContain('consent_copy_version TEXT NOT NULL')
    expect(normalizedMigrationSql).toContain('decided_at TIMESTAMPTZ NOT NULL')
    expect(normalizedMigrationSql).toContain('revoked_at TIMESTAMPTZ')
    expect(normalizedMigrationSql).toContain('PRIMARY KEY (interview_id, user_id)')
  })

  it('creates realtimekit_webhook_events table with provider_event_id primary key', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain('CREATE TABLE IF NOT EXISTS realtimekit_webhook_events')
    expect(normalizedMigrationSql).toContain('provider_event_id TEXT PRIMARY KEY')
    expect(normalizedMigrationSql).toContain(
      "status TEXT NOT NULL CHECK (status IN ('accepted', 'finalizing', 'processed', 'failed'))",
    )
    expect(normalizedMigrationSql).toContain('attempt_count INTEGER NOT NULL DEFAULT 0')
    expect(normalizedMigrationSql).toContain('idx_realtimekit_webhook_events_recording')
    expect(normalizedMigrationSql).toContain('idx_realtimekit_webhook_events_pending')
  })

  it('creates feedback_replay_audit table', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain('CREATE TABLE IF NOT EXISTS feedback_replay_audit')
    expect(normalizedMigrationSql).toContain('target_schema_version INTEGER NOT NULL')
    expect(normalizedMigrationSql).toContain('operator_identity TEXT NOT NULL')
    expect(normalizedMigrationSql).toContain('reason TEXT NOT NULL')
    expect(normalizedMigrationSql).toContain('idx_feedback_replay_audit_interview')
  })

  it('creates interview_transcription_chunks table with unique chunk identity', async function run() {
    await loadFiles()

    expect(normalizedMigrationSql).toContain('CREATE TABLE IF NOT EXISTS interview_transcription_chunks')
    expect(normalizedMigrationSql).toContain('feedback_attempt_id TEXT NOT NULL')
    expect(normalizedMigrationSql).toContain('chunk_index INTEGER NOT NULL')
    expect(normalizedMigrationSql).toContain(
      "status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'transcribed', 'failed'))",
    )
    expect(normalizedMigrationSql).toContain('idx_interview_transcription_chunks_unique')
    expect(normalizedMigrationSql).toContain('idx_interview_transcription_chunks_interview_attempt')
    expect(normalizedMigrationSql).toContain('idx_interview_transcription_chunks_pending')
  })

  it('documents new tables in db-schemas.md', async function run() {
    await loadFiles()

    expect(normalizedSchemaDoc).toContain('### Interview_Artifacts')
    expect(normalizedSchemaDoc).toContain('### Interview_Recordings')
    expect(normalizedSchemaDoc).toContain('### Interview_Recording_Consents')
    expect(normalizedSchemaDoc).toContain('### RealtimeKit_Webhook_Events')
    expect(normalizedSchemaDoc).toContain('### Feedback_Replay_Audit')
    expect(normalizedSchemaDoc).toContain('### Interview_Transcription_Chunks')
  })

  it('requires additive migration with efficient bounded uploaded-finalization sweep index', async function run() {
    const migrationsDirectory = new URL('../../migrations/', import.meta.url)
    const migrationFiles = await readdir(migrationsDirectory)
    const candidates = migrationFiles.filter(function isRecordingFinalizationMigration(file) {
      return /recording/i.test(file) && /finalization|sweep/i.test(file) && file.endsWith('.sql')
    })
    expect(candidates.length).toBeGreaterThan(0)

    const migrationSql = normalizeWhitespace(
      await readFile(new URL(candidates.sort().at(-1)!, migrationsDirectory), 'utf8'),
    ).toLowerCase()
    expect(migrationSql).toContain('create index')
    expect(migrationSql).toContain('interview_recordings')
    expect(migrationSql).toContain('provider_status')
    expect(migrationSql).toContain("'uploaded'")
    expect(migrationSql).toContain('finalization_status')
    expect(migrationSql).toContain("'pending'")
    expect(migrationSql).toContain("'failed'")
    expect(migrationSql).toMatch(/where[\s\S]*provider_status[\s\S]*uploaded/)
  })
  it('sweep partial index includes processing finalization_status for orphaned reclaim', async function run() {
    const migrationsDirectory = new URL('../../migrations/', import.meta.url)
    const migrationFiles = await readdir(migrationsDirectory)
    const candidates = migrationFiles.filter(function isRecordingFinalizationMigration(file) {
      return /recording/i.test(file) && /finalization|sweep/i.test(file) && file.endsWith('.sql')
    })
    expect(candidates.length).toBeGreaterThan(0)
    const migrationSql = normalizeWhitespace(await readFile(new URL(candidates.sort().at(-1)!, migrationsDirectory), 'utf8')).toLowerCase()
    expect(migrationSql).toContain("'processing'")
    expect(migrationSql).toMatch(/finalization_status[\s\S]*processing/)
  })

  it('marks recording_url and screenshot_urls as deprecated in db-schemas.md', async function run() {
    await loadFiles()

    expect(normalizedSchemaDoc).toContain('**deprecated**')
  })

  it('does not set default values for created_at or updated_at in new tables', async function run() {
    await loadFiles()

    // All new tables should have NOT NULL on created_at/updated_at but no DEFAULT
    const newTables = [
      'interview_artifacts',
      'interview_recordings',
      'interview_recording_consents',
      'realtimekit_webhook_events',
      'feedback_replay_audit',
      'interview_transcription_chunks',
    ]

    for (const table of newTables) {
      // Should NOT contain DEFAULT for created_at/updated_at in CREATE TABLE for this table
      // We check that the table has NOT NULL timestamps without DEFAULT
      expect(normalizedMigrationSql).toContain(`${table}`)
    }

    // Specifically verify no DEFAULT on timestamp columns (except the status defaults which are intentional)
    expect(normalizedMigrationSql).not.toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT')
    expect(normalizedMigrationSql).not.toContain('updated_at TIMESTAMPTZ NOT NULL DEFAULT')
  })

  it('leaves historical rows at feedback_status not_started without automatic processing', async function run() {
    await loadFiles()

    // The migration should not contain any UPDATE statements that would process historical interviews
    expect(normalizedMigrationSql).not.toContain('UPDATE interviews SET feedback_status')
    // The migration should not copy legacy URL values into normalized artifact rows
    expect(normalizedMigrationSql).not.toContain('INSERT INTO interview_artifacts')
  })
})

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
