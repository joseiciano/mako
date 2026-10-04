import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('user isAdmin schema', function () {
  it('adds a non-null, default-false isAdmin column idempotently', async function () {
    const sql = await readFile(
      new URL('../../migrations/20260901120000_add_user_is_admin.sql', import.meta.url),
      'utf8',
    )
    const normalized = sql.replace(/\s+/g, ' ')

    expect(normalized).toContain('ALTER TABLE "user"')
    expect(normalized).toContain(
      'ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT FALSE',
    )
  })

  it('registers isAdmin as a server-only Better Auth field (input: false)', async function () {
    const source = await readFile(
      new URL('./auth-config.ts', import.meta.url),
      'utf8',
    )
    const normalized = source.replace(/\s+/g, ' ')

    expect(normalized).toContain(
      "isAdmin: { type: 'boolean', required: true, defaultValue: false, input: false, returned: true, }",
    )
  })
})
