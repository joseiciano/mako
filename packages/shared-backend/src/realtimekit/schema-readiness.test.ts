import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

// Drift guard: every UPDATE/INSERT issued by the RealtimeKit repositories must
// reference only columns that exist in the migration schema. This catches the
// class of runtime failure where repository SQL references a column that was
// never added to the backing table (e.g. provider_asset_id on
// interview_recordings).

const MIGRATION_FILES = [
  '../../migrations/20260807120000_add_feedback_and_artifact_schema.sql',
  '../../migrations/20260402123000_add_interviews_table.sql',
]
const REPOSITORY_FILES = [
  './webhook-repository.ts',
  './finalization-repository.ts',
]

describe('realtimekit repository SQL schema readiness', function realtimekitSchemaReadinessSuite() {
  let migrationSql: string
  let repositorySources: string[]

  async function loadFiles() {
    const [migrations, ...sources] = await Promise.all([
      Promise.all(MIGRATION_FILES.map((file) =>
        readFile(new URL(file, import.meta.url), 'utf8'),
      )),
      ...REPOSITORY_FILES.map((file) =>
        readFile(new URL(file, import.meta.url), 'utf8'),
      ),
    ])
    // Repository statements may target tables defined across multiple
    // migrations (e.g. interview_recordings in the artifact schema and
    // interviews in the earlier interviews migration). Search them all.
    migrationSql = migrations.join('\n')
    repositorySources = sources
  }

  it('creates interview_recordings without a provider_asset_id column', async function run() {
    await loadFiles()

    const columns = extractTableColumns(migrationSql, 'interview_recordings')
    expect(columns).toContain('provider_status')
    expect(columns).not.toContain('provider_asset_id')
  })

  it('every repository UPDATE and INSERT references existing table columns', async function run() {
    await loadFiles()

    const referencedColumns = extractStatementColumnReferences(repositorySources)

    for (const { table, columns, statement } of referencedColumns) {
      const definedColumns = extractTableColumns(migrationSql, table)
      expect(definedColumns.length).toBeGreaterThan(0)

      for (const column of columns) {
        expect(
          definedColumns,
          `column "${column}" referenced by statement "${statement}" is not defined on ${table}`,
        ).toContain(column)
      }
    }
  })
})

type StatementReference = {
  table: string
  columns: string[]
  statement: string
}

function extractStatementColumnReferences(
  sources: string[],
): StatementReference[] {
  const references: StatementReference[] = []
  const statementPatternSource =
    /\b(?:UPDATE|INSERT INTO)\s+(interview_recordings|interview_artifacts|realtimekit_webhook_events|interviews)\s+([^;]*?)(?:;|$)/gs

  for (const source of sources) {
    // A fresh regex per source keeps matchAll iteration deterministic.
    const statementPattern = new RegExp(statementPatternSource.source, 'gs')

    for (const match of source.matchAll(statementPattern)) {
      const table = match[1]
      const body = match[2]
      references.push({
        table,
        columns: extractReferencedColumns(table, body),
        statement: normalizeWhitespace(match[0]).slice(0, 160),
      })
    }
  }

  return references
}

function extractReferencedColumns(table: string, body: string): string[] {
  const columns = new Set<string>()
  const bodyWithoutParameters = body.replace(/\$\d+/g, '')

  // SET clause assignments and INSERT column lists
  for (const match of bodyWithoutParameters.matchAll(/[a-z_]+(?=\s*=)/g)) {
    columns.add(match[0])
  }

  for (const match of bodyWithoutParameters.matchAll(/\(([a-z_,\s]+)\)/g)) {
    for (const column of match[1].split(',')) {
      const normalized = column.trim()
      if (/^[a-z_]+$/.test(normalized)) {
        columns.add(normalized)
      }
    }
  }

  // Nested references such as COALESCE(..., provider_asset_id) or
  // CASE ... THEN provider_status ... must also exist.
  for (const match of bodyWithoutParameters.matchAll(/[a-z_]+(?=\s*\))/g)) {
    columns.add(match[0])
  }

  for (const match of bodyWithoutParameters.matchAll(/(?:COALESCE|THEN|CASE)\s*\(\s*[^,)]+,\s*([a-z_]+)/g)) {
    columns.add(match[1])
  }

  // Exclude table aliases/qualifiers used in JOIN predicates.
  for (const column of columns) {
    if (column === table) {
      columns.delete(column)
    }
  }

  return [...columns].sort()
}

function extractTableColumns(
  migrationSql: string,
  tableName: string,
): string[] {
  const columns = new Set<string>()
  const createMatch = migrationSql.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\s*\\(`, 'i'),
  )

  if (createMatch && createMatch.index !== undefined) {
    const block = extractBalancedBlock(
      migrationSql,
      createMatch.index + createMatch[0].length - 1,
    )

    for (const line of block.split('\n')) {
      const columnMatch = line.match(/^\s*([a-z_]+)\s+[A-Z]/)
      if (columnMatch) {
        columns.add(columnMatch[1])
      }
    }
  }

  // Columns added later via ALTER TABLE ... ADD COLUMN live in the same
  // migration files; without them the guard would falsely reject e.g.
  // interviews.recording_status (added in the feedback schema migration).
  for (const alterMatch of migrationSql.matchAll(
    new RegExp(`ALTER TABLE (?:IF EXISTS )?${tableName}\\b([^;]*?);`, 'gi'),
  )) {
    for (const addMatch of alterMatch[1].matchAll(/\bADD COLUMN\s+([a-z_]+)/gi)) {
      columns.add(addMatch[1])
    }
  }

  return [...columns].sort()
}

function extractBalancedBlock(value: string, openIndex: number): string {
  let depth = 0

  for (let index = openIndex; index < value.length; index += 1) {
    if (value[index] === '(') {
      depth += 1
    } else if (value[index] === ')') {
      depth -= 1
      if (depth === 0) {
        return value.slice(openIndex + 1, index)
      }
    }
  }

  return ''
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
