import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { Hono } from 'hono'
import { createBetterAuth, type BetterAuthLike } from './auth-config'
import { createAuthSessionMiddleware } from './auth-middleware'
import { requireAdmin } from './require-admin'
import { resolveLocalTestDatabaseUrl } from '../database/test-database-url'

const origin = 'http://localhost:8787'
const frontendOrigin = 'http://localhost:3000'

describe('isAdmin schema and requireAdmin integration', function () {
  let client: Client
  let auth: BetterAuthLike
  let app: Hono
  const email = `admin-it-${crypto.randomUUID()}@example.com`
  const password = 'correct-password-123'

  async function authCall(path: string, body: unknown, headers: Record<string, string> = {}) {
    return await auth.handler(
      new Request(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: frontendOrigin, ...headers },
        body: JSON.stringify(body),
      }),
    )
  }

  beforeAll(async function setup() {
    const databaseUrl = resolveLocalTestDatabaseUrl()
    client = new Client({ connectionString: databaseUrl })
    await client.connect()
    auth = createBetterAuth({
      connectionString: databaseUrl,
      secret: 'integration-test-secret',
      baseURL: `${origin}/api/auth`,
      trustedOrigins: [frontendOrigin],
      requireEmailVerification: false,
    })
    app = new Hono()
    app.use('/api/*', createAuthSessionMiddleware({ getAuth: () => auth }))
    app.get('/api/admin', requireAdmin, (c) => c.json({ ok: true }))
  })

  afterAll(async function teardown() {
    await client.query(`DELETE FROM "user" WHERE email = $1`, [email])
    await client.end()
  })

  it('adds isAdmin as BOOLEAN NOT NULL DEFAULT FALSE and records the migration', async function () {
    const column = await client.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'user' AND column_name = 'isAdmin'`,
    )
    expect(column.rows[0]).toEqual({
      data_type: 'boolean',
      is_nullable: 'NO',
      column_default: 'false',
    })
    const applied = await client.query(
      `SELECT 1 FROM schema_migrations WHERE migration_name LIKE '%add_user_is_admin.sql'`,
    )
    expect(applied.rowCount).toBeGreaterThan(0)
  })

  it('ignores a client-supplied isAdmin on sign-up, re-evaluates per request, and fails closed after revoke', async function () {
    const signUp = await authCall('/api/auth/sign-up/email', {
      name: 'Admin IT',
      email,
      password,
      isAdmin: true,
    })
    expect(signUp.status).toBe(200)
    const row = await client.query<{ id: string; isAdmin: boolean }>(
      `SELECT id, "isAdmin" FROM "user" WHERE email = $1`,
      [email],
    )
    expect(row.rows[0].isAdmin).toBe(false)
    const userId = row.rows[0].id

    const signIn = await authCall('/api/auth/sign-in/email', { email, password })
    expect(signIn.status).toBe(200)
    const signInBody = (await signIn.json()) as { user: { isAdmin: boolean } }
    expect(signInBody.user.isAdmin).toBe(false)
    const cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')

    const adminRequest = () => app.request('/api/admin', { headers: { cookie } })

    expect((await adminRequest()).status).toBe(403)

    await client.query(
      `UPDATE "user" SET "isAdmin" = true, "updatedAt" = NOW() WHERE id = $1`,
      [userId],
    )
    expect((await adminRequest()).status).toBe(200)

    await client.query(
      `UPDATE "user" SET "isAdmin" = false, "updatedAt" = NOW() WHERE id = $1`,
      [userId],
    )
    expect((await adminRequest()).status).toBe(403)

    await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [userId])
    expect((await adminRequest()).status).toBe(401)
  })

  it('rejects a signed-in user writing isAdmin through update-user and leaves the row false', async function () {
    const signIn = await authCall('/api/auth/sign-in/email', { email, password })
    expect(signIn.status).toBe(200)
    const cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')

    const update = await authCall('/api/auth/update-user', { isAdmin: true }, { cookie })
    expect(update.status).toBeGreaterThanOrEqual(400)
    expect(update.status).toBeLessThan(500)

    const row = await client.query<{ isAdmin: boolean }>(
      `SELECT "isAdmin" FROM "user" WHERE email = $1`,
      [email],
    )
    expect(row.rows[0].isAdmin).toBe(false)
  })
})
