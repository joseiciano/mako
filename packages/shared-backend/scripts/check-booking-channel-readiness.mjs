// Deploy-workflow readiness gate for the interviews.booking_channel NOT NULL
// contraction (Story 7.11 section 1). Runs before the contraction migration:
// it fails (exit code 1) while any interviews row still has a NULL
// booking_channel, so a leftover null can never pass through the contraction.
//
// The fleet-drain check (no previously-released Worker version that omits
// booking_channel is still serving writes) is a deployment orchestration
// concern: it requires inventory of the running Worker fleet and can only be
// verified by the deployment system, not from SQL. The deploy workflow must
// confirm the Story 7.10 revision is deployed (no rollback in flight) and that
// all Workers serving writes include booking_channel before this gate may
// pass. This script only verifies the SQL-side precondition (zero NULL rows).

import process from 'node:process'
import { Client } from 'pg'

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
      : undefined,
  })
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Example: DATABASE_URL=postgres://... node ./scripts/check-booking-channel-readiness.mjs',
    )
  }

  const client = createPgClient(databaseUrl)

  await client.connect()

  try {
    const nullResult = await client.query(
      'SELECT count(*) FROM interviews WHERE booking_channel IS NULL',
    )
    const totalResult = await client.query('SELECT count(*) FROM interviews')

    const nullCount = Number(nullResult.rows[0].count)
    const totalCount = Number(totalResult.rows[0].count)

    process.stdout.write(
      `Interviews total: ${totalCount}, booking_channel NULL: ${nullCount}\n`,
    )

    if (nullCount > 0) {
      throw new Error(
        `${nullCount} interviews row(s) still have NULL booking_channel. Run the resumable backfill and re-check before applying the NOT NULL contraction.`,
      )
    }

    process.stdout.write(
      'booking_channel readiness check passed: zero NULL rows. Safe to apply the NOT NULL contraction.\n',
    )
  } finally {
    await client.end()
  }
}

main().catch(function handleError(error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Readiness check failed: ${message}\n`)
  process.exitCode = 1
})
