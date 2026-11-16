import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Real-Postgres coverage of scripts/backfill-booking-channel.mjs. Runs in a
// throwaway schema with a minimal nullable `interviews` table so the shared
// test schema (where booking_channel is already NOT NULL) is untouched.
// Skipped unless DATABASE_URL points at a localhost database ending in `_test`.
const databaseUrl = process.env.DATABASE_URL ?? ''
const isSafeTestDatabase = /^postgres(ql)?:\/\/[^/]*(127\.0\.0\.1|localhost)[:/][^?]*_test(\?|$)/.test(
  databaseUrl,
)
const run = promisify(execFile)
const schema = `backfill_test_${process.pid}`

describe.skipIf(!isSafeTestDatabase)('backfill-booking-channel script (real Postgres)', function () {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })

  async function insertRow(mode: string, interviewerId: string | null) {
    const id = crypto.randomUUID()
    await pool.query(
      `INSERT INTO ${schema}.interviews (id, mode, interviewer_id, updated_at) VALUES ($1, $2, $3, NOW())`,
      [id, mode, interviewerId],
    )
    return id
  }

  async function runBackfill(batchSize: string) {
    const url = new URL(databaseUrl)
    url.searchParams.set('options', `-c search_path=${schema}`)
    const { stdout } = await run('node', ['./scripts/backfill-booking-channel.mjs'], {
      env: { ...process.env, DATABASE_URL: url.toString(), BATCH_SIZE: batchSize },
    })
    return stdout
  }

  async function channelOf(id: string) {
    const result = await pool.query(`SELECT booking_channel FROM ${schema}.interviews WHERE id = $1`, [id])
    return result.rows[0].booking_channel as string | null
  }

  beforeAll(async function setup() {
    await pool.query(`CREATE SCHEMA ${schema}`)
    await pool.query(
      `CREATE TABLE ${schema}.interviews (
        id UUID PRIMARY KEY,
        mode TEXT NOT NULL,
        interviewer_id UUID,
        booking_channel TEXT,
        updated_at TIMESTAMPTZ NOT NULL
      )`,
    )
  })

  afterAll(async function teardown() {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`)
    await pool.end()
  })

  it('backfills ai_led to ai_direct and peer_to_peer (including null interviewer_id) to standard_match across bounded batches', async function check() {
    const aiRows = [await insertRow('ai_led', null), await insertRow('ai_led', null)]
    const p2pNull = await insertRow('peer_to_peer', null)
    const p2pAssigned = await insertRow('peer_to_peer', crypto.randomUUID())

    const stdout = await runBackfill('2')

    expect(stdout).toContain('Backfill complete: zero NULL booking_channel rows remain.')
    expect(stdout.match(/Backfill batch:/g)?.length).toBeGreaterThan(1)
    expect(await Promise.all(aiRows.map(channelOf))).toEqual(['ai_direct', 'ai_direct'])
    expect(await channelOf(p2pNull)).toBe('standard_match')
    expect(await channelOf(p2pAssigned)).toBe('standard_match')
    const remaining = await pool.query(`SELECT count(*) FROM ${schema}.interviews WHERE booking_channel IS NULL`)
    expect(Number(remaining.rows[0].count)).toBe(0)
  })

  it('picks up null rows inserted by an older Worker after a run on a later sweep and leaves populated rows untouched', async function check() {
    const populatedId = await insertRow('ai_led', null)
    await pool.query(`UPDATE ${schema}.interviews SET booking_channel = 'verified_interviewer' WHERE id = $1`, [populatedId])

    const lateRow = await insertRow('peer_to_peer', null)
    expect(await channelOf(lateRow)).toBeNull()

    await runBackfill('1')

    expect(await channelOf(lateRow)).toBe('standard_match')
    expect(await channelOf(populatedId)).toBe('verified_interviewer')
    expect(await runBackfill('1')).toContain('No NULL booking_channel rows found.')
  })
})
