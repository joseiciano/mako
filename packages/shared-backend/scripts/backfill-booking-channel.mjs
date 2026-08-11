// Resumable bounded backfill for interviews.booking_channel (Story 7.11
// section 1). Runs repeated sweeps from the beginning over rows where
// booking_channel IS NULL, deriving the value deterministically from mode:
// ai_led -> ai_direct, peer_to_peer -> standard_match. Each batch runs in its
// own small transaction with short statement_timeout and lock_timeout so a
// stuck batch aborts instead of blocking the fleet. Repeats sweeps until a
// full sweep finds zero NULL rows, then exits 0. Safe to re-run at any time;
// this is never a monotonic cursor and never one unbounded UPDATE.
//
// Usage: DATABASE_URL=postgres://... [BATCH_SIZE=1000] node ./scripts/backfill-booking-channel.mjs

import process from 'node:process'
import { Client } from 'pg'

const defaultBatchSize = 1000

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

function parseBatchSize(rawValue) {
  if (rawValue === undefined || rawValue === '') {
    return defaultBatchSize
  }

  const parsed = Number.parseInt(rawValue, 10)

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`BATCH_SIZE must be a positive integer, got "${rawValue}"`)
  }

  return parsed
}

async function countNullRows(client) {
  const result = await client.query(
    'SELECT count(*) FROM interviews WHERE booking_channel IS NULL',
  )

  return Number(result.rows[0].count)
}

async function runBatch(client, batchSize) {
  await client.query('BEGIN')

  try {
    await client.query("SET LOCAL statement_timeout = '10s'")
    await client.query("SET LOCAL lock_timeout = '2s'")
    const result = await client.query(
      `
        UPDATE interviews
        SET
          booking_channel = CASE
            WHEN mode = 'ai_led' THEN 'ai_direct'
            ELSE 'standard_match'
          END,
          updated_at = NOW()
        WHERE
          booking_channel IS NULL
          AND id IN (
            SELECT id
            FROM interviews
            WHERE booking_channel IS NULL
            ORDER BY id
            LIMIT $1
          )
      `,
      [batchSize],
    )
    await client.query('COMMIT')

    return result.rowCount ?? 0
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Example: DATABASE_URL=postgres://... BATCH_SIZE=1000 node ./scripts/backfill-booking-channel.mjs',
    )
  }

  const batchSize = parseBatchSize(process.env.BATCH_SIZE)

  const client = createPgClient(databaseUrl)

  await client.connect()

  try {
    let nullsRemaining = await countNullRows(client)

    if (nullsRemaining === 0) {
      process.stdout.write(
        'No NULL booking_channel rows found. Backfill complete.\n',
      )
      return
    }

    while (nullsRemaining > 0) {
      const batchStartedAt = Date.now()
      const processed = await runBatch(client, batchSize)

      // Track remaining without a full-table COUNT after every batch.
      // Only re-COUNT when the batch made no progress (to detect stalls)
      // or when the tracked remainder drops to zero (to verify).
      nullsRemaining -= processed

      if (processed === 0 || nullsRemaining <= 0) {
        nullsRemaining = await countNullRows(client)
      }

      const batchDurationMs = Date.now() - batchStartedAt

      process.stdout.write(
        `Backfill batch: processed=${processed} nullsRemaining=${nullsRemaining} batchTimeMs=${batchDurationMs}\n`,
      )

      if (processed === 0 && nullsRemaining > 0) {
        throw new Error(
          `Backfill made no progress but ${nullsRemaining} NULL row(s) remain. Aborting to avoid a busy loop.`,
        )
      }
    }

    process.stdout.write(
      'Backfill complete: zero NULL booking_channel rows remain.\n',
    )
  } finally {
    await client.end()
  }
}

main().catch(function handleError(error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Backfill failed: ${message}\n`)
  process.exitCode = 1
})
