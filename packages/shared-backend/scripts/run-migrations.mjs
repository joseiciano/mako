import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const currentFile = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFile)
const packageDirectory = path.resolve(currentDirectory, '..')
const migrationsDirectory = path.join(packageDirectory, 'migrations')
const migrationsTableName = 'schema_migrations'

function isLocalConnectionString(connectionString) {
  return (
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1')
  )
}

function createPgClient(connectionString) {
  return new Client({
    connectionString,
    ssl: isLocalConnectionString(connectionString)
      ? false
      : {
          rejectUnauthorized: false,
        },
  })
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${migrationsTableName} (
      id BIGSERIAL PRIMARY KEY,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function getMigrationFiles() {
  const directoryEntries = await readdir(migrationsDirectory, {
    withFileTypes: true,
  })

  return directoryEntries
    .filter(function isSqlFile(entry) {
      return entry.isFile() && entry.name.endsWith('.sql')
    })
    .map(function toFileName(entry) {
      return entry.name
    })
    .sort()
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    `SELECT migration_name FROM ${migrationsTableName}`,
  )

  return new Set(
    result.rows.map(function rowToMigrationName(row) {
      return row.migration_name
    }),
  )
}

async function runSingleMigration(client, migrationName) {
  const migrationPath = path.join(migrationsDirectory, migrationName)
  const migrationSql = await readFile(migrationPath, 'utf8')

  if (!migrationSql.trim()) {
    throw new Error(`Migration ${migrationName} is empty`)
  }

  await client.query('BEGIN')

  try {
    await client.query(migrationSql)
    await client.query(
      `
        INSERT INTO ${migrationsTableName} (migration_name)
        VALUES ($1)
      `,
      [migrationName],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Example: DATABASE_URL=postgres://... pnpm db:migrate',
    )
  }

  const client = createPgClient(databaseUrl)

  await client.connect()

  try {
    await ensureMigrationsTable(client)

    const migrationFiles = await getMigrationFiles()
    const appliedMigrations = await getAppliedMigrations(client)

    const pendingMigrations = migrationFiles.filter(function isPending(fileName) {
      return !appliedMigrations.has(fileName)
    })

    if (pendingMigrations.length === 0) {
      process.stdout.write('No pending migrations.\n')
      return
    }

    for (const migrationName of pendingMigrations) {
      process.stdout.write(`Applying migration: ${migrationName}\n`)
      await runSingleMigration(client, migrationName)
      process.stdout.write(`Applied migration: ${migrationName}\n`)
    }

    process.stdout.write(
      `Migrations complete. Applied ${pendingMigrations.length} migration(s).\n`,
    )
  } finally {
    await client.end()
  }
}

main().catch(function handleError(error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Migration failed: ${message}\n`)
  process.exitCode = 1
})
