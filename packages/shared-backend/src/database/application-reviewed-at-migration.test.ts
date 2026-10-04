import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('application reviewed_at migration', function () {
  it('adds a nullable reviewed_at TIMESTAMPTZ with no default (null on pending rows)', async function () {
    const sql = await readFile(
      new URL('../../migrations/20261115020000_add_application_reviewed_at.sql', import.meta.url),
      'utf8',
    )
    const normalized = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ')

    expect(normalized).toContain('ALTER TABLE user_interviewer_applications')
    expect(normalized).toContain('ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;')
    expect(normalized).not.toMatch(/reviewed_at TIMESTAMPTZ (NOT NULL|DEFAULT)/)
  })

  it('sorts after the application persistence migration that creates the table', async function () {
    const { readdir } = await import('node:fs/promises')
    const files = (await readdir(new URL('../../migrations/', import.meta.url))).sort()
    const target = files.indexOf('20261115020000_add_application_reviewed_at.sql')
    expect(target).toBeGreaterThan(
      files.indexOf('20260807130000_add_interviewer_application_persistence.sql'),
    )
    expect(target).toBeGreaterThan(files.indexOf('20261115015704_add_user_is_admin.sql'))
  })
})
