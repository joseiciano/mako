import process from 'node:process'
import { Client } from 'pg'

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function assertSafeTestDatabaseUrl(connectionString) {
  let parsedConnectionString

  try {
    parsedConnectionString = new URL(connectionString)
  } catch {
    throw new Error('DATABASE_URL must be a valid postgres connection string')
  }

  if (!isLocalHostname(parsedConnectionString.hostname)) {
    throw new Error(
      'Refusing to reset non-local database. DATABASE_URL host must be localhost or 127.0.0.1.',
    )
  }

  const databaseName = parsedConnectionString.pathname.replace(/^\//, '')

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      'Refusing to reset database that does not end with "_test". Update DATABASE_URL to an isolated test database.',
    )
  }
}

function createPgClient(connectionString) {
  return new Client({
    connectionString,
    ssl: false,
  })
}

async function resetPublicSchema(client) {
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO CURRENT_USER;
    GRANT ALL ON SCHEMA public TO public;
  `)
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Example: DATABASE_URL=postgres://... pnpm db:test:reset',
    )
  }

  assertSafeTestDatabaseUrl(databaseUrl)

  const client = createPgClient(databaseUrl)

  await client.connect()

  try {
    await resetPublicSchema(client)
    process.stdout.write('Reset test database schema.\n')
  } finally {
    await client.end()
  }
}

main().catch(function handleError(error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Failed to reset test database: ${message}\n`)
  process.exitCode = 1
})
