import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const requireFromWorkingDirectory = createRequire(path.join(process.cwd(), 'noop.js'))
const pg = requireFromWorkingDirectory('pg')

export const rateLimitIdPatchSql =
  'ALTER TABLE "rateLimit" ADD COLUMN IF NOT EXISTS "id" TEXT'

export async function applyLocalSchemaPatch(connectionString) {
  const client = new pg.Client({ connectionString })

  await client.connect()
  try {
    await client.query(rateLimitIdPatchSql)
  } finally {
    await client.end()
  }
}

if (process.argv[1]?.endsWith('local-schema-patch.mjs')) {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }

  await applyLocalSchemaPatch(connectionString)
  process.stdout.write('Local schema patch applied: rateLimit.id\n')
}
