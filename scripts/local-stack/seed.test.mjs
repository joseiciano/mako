import { describe, expect, it, vi } from 'vitest'
import { runSeed } from './seed.mjs'
import { buildPremiumSlots, premiumSlotMinutes, seedUsers } from './seed-users.mjs'

function createClient(existingEmails) {
  const queries = []

  return {
    queries,
    async query(sql, params = []) {
      queries.push({ sql, params })
      if (sql.startsWith('SELECT 1')) {
        return { rows: existingEmails.has(params[0]) ? [{}] : [], rowCount: 0 }
      }

      return { rows: [], rowCount: 1 }
    },
  }
}

describe('seed data', function describeData() {
  it('has unique emails and unique client addresses for all four roles', function uniqueUsers() {
    expect(new Set(seedUsers.map((user) => user.email)).size).toBe(4)
    expect(new Set(seedUsers.map((user) => user.clientAddress)).size).toBe(4)
    expect(seedUsers.map((user) => user.role)).toEqual([
      'learner',
      'interviewer',
      'verified-interviewer',
      'admin',
    ])
  })

  it('builds future slots that are exactly 60 minutes long', function sixtyMinutes() {
    const now = new Date('2026-11-18T10:00:00Z')
    const slots = buildPremiumSlots(now)

    for (const slot of slots) {
      expect(Date.parse(slot.endTime) - Date.parse(slot.startTime)).toBe(premiumSlotMinutes * 60_000)
      expect(Date.parse(slot.startTime)).toBeGreaterThan(now.getTime())
    }
    expect(new Set(slots.map((slot) => slot.id)).size).toBe(slots.length)
  })
})

describe('runSeed', function describeRunSeed() {
  it('signs up every missing user with its own client address', async function signsUp() {
    const client = createClient(new Set())
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))

    await runSeed({ client, fetchImpl, workersUrl: 'http://w' })

    expect(fetchImpl).toHaveBeenCalledTimes(4)
    const addresses = fetchImpl.mock.calls.map((call) => call[1].headers['cf-connecting-ip'])
    expect(new Set(addresses).size).toBe(4)
    expect(fetchImpl.mock.calls[0][0]).toBe('http://w/api/auth/sign-up/email')
  })

  it('skips sign-up for users that already exist but still applies roles', async function skipsExisting() {
    const existing = new Set(seedUsers.map((user) => user.email))
    const client = createClient(existing)
    const fetchImpl = vi.fn()

    await runSeed({ client, fetchImpl, workersUrl: 'http://w' })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(client.queries.filter((q) => q.sql.startsWith('UPDATE "user"'))).toHaveLength(4)
  })

  it('fails when a role update matches no row', async function failsOnNoRow() {
    const client = createClient(new Set(seedUsers.map((user) => user.email)))
    client.query = async (sql) => ({ rows: sql.startsWith('SELECT 1') ? [{}] : [], rowCount: 0 })

    await expect(runSeed({ client, fetchImpl: vi.fn(), workersUrl: 'http://w' })).rejects.toThrow(/matched 0 rows/)
  })

  it('fails when sign-up is rejected', async function failsOnReject() {
    const client = createClient(new Set())
    const fetchImpl = vi.fn(async () => new Response('too many', { status: 429 }))

    await expect(runSeed({ client, fetchImpl, workersUrl: 'http://w' })).rejects.toThrow(/429/)
  })

  it('inserts slots with conflict-safe parameterized SQL', async function slotsSql() {
    const client = createClient(new Set(seedUsers.map((user) => user.email)))

    await runSeed({ client, fetchImpl: vi.fn(), workersUrl: 'http://w' })

    const inserts = client.queries.filter((q) => q.sql.includes('INSERT INTO premium_interviewer_slots'))
    expect(inserts).toHaveLength(3)
    expect(inserts[0].sql).toContain('ON CONFLICT (id) DO UPDATE')
    expect(inserts[0].sql).toContain("status = 'available'")
    expect(inserts[0].params[4]).toBe('verified@mako.test')
  })
})
