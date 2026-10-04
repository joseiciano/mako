import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SqlQuery, SqlQueryExecutor } from '../index'
import { AdminApplicationReviewRepository } from './admin-application-review-repository'
import { AdminApplicationReviewService } from './admin-application-review-service'
import { AdminReviewConflictError } from './types'

// Real-Postgres coverage against the isolated test database
// (docs/system/local-testing.md). Skipped unless DATABASE_URL points at a
// localhost database whose name ends in `_test`.
const databaseUrl = process.env.DATABASE_URL ?? ''
const isSafeTestDatabase = /^postgres(ql)?:\/\/[^/]*(127\.0\.0\.1|localhost)[:/][^?]*_test(\?|$)/.test(
  databaseUrl,
)

describe.skipIf(!isSafeTestDatabase)('admin application review (real Postgres)', function () {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 })
  const silentLogger = { info() {}, error() {} }
  const createdUserIds: string[] = []

  /** One executor per decision writer, holding a dedicated client while in a transaction. */
  function createExecutor(): SqlQueryExecutor {
    let client: pg.PoolClient | null = null

    return {
      async query<Row>(query: SqlQuery) {
        const normalized = query.text.trim().replace(/\s+/g, ' ').toUpperCase()

        if (normalized === 'BEGIN;') {
          client = await pool.connect()
          await client.query('BEGIN')
          return { rows: [] as Row[] }
        }

        const target = client ?? pool
        try {
          const result = await target.query(query.text, [...query.values])
          return { rows: result.rows as Row[], rowCount: result.rowCount ?? undefined }
        } finally {
          if ((normalized === 'COMMIT;' || normalized === 'ROLLBACK;') && client) {
            client.release()
            client = null
          }
        }
      },
    }
  }

  function createService(): AdminApplicationReviewService {
    return new AdminApplicationReviewService(
      new AdminApplicationReviewRepository(createExecutor()),
      silentLogger,
    )
  }

  async function insertUser(options: { deleted?: boolean; companies?: boolean } = {}) {
    const id = crypto.randomUUID()
    createdUserIds.push(id)
    await pool.query(
      `INSERT INTO "user" (id, email, name, companies, "createdAt", "updatedAt", deleted_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), $5)`,
      [
        id,
        `${id}@example.test`,
        `User ${id.slice(0, 4)}`,
        options.companies ?? false,
        options.deleted ? new Date() : null,
      ],
    )
    return id
  }

  async function insertApplication(userId: string) {
    const id = crypto.randomUUID()
    await pool.query(
      `INSERT INTO user_interviewer_applications
         (id, user_id, email, employment_history, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())`,
      [
        id,
        userId,
        `${userId}@example.test`,
        JSON.stringify([
          { sourceCompanyId: null, company: 'acme', role: 'Engineer', start: '2020-01-01', end: null },
        ]),
      ],
    )
    return id
  }

  async function readState(applicationId: string, userId: string) {
    const app = await pool.query(
      'SELECT status, reviewed_by, reviewed_at FROM user_interviewer_applications WHERE id = $1',
      [applicationId],
    )
    const user = await pool.query('SELECT companies FROM "user" WHERE id = $1', [userId])
    return { application: app.rows[0], companies: user.rows[0].companies as boolean }
  }

  beforeAll(async function applyMigration() {
    const sql = await readFile(
      new URL('../../migrations/20260902120000_add_application_reviewed_at.sql', import.meta.url),
      'utf8',
    )
    await pool.query(sql)
  })

  afterAll(async function cleanup() {
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM user_interviewer_applications WHERE user_id = ANY($1)', [createdUserIds])
      await pool.query('DELETE FROM user_interviewer_applications WHERE reviewed_by = ANY($1)', [createdUserIds])
      await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [createdUserIds])
    }
    await pool.end()
  })

  it('migration leaves reviewed_at nullable and NULL on a pending application', async function () {
    const column = await pool.query(
      `SELECT is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'user_interviewer_applications' AND column_name = 'reviewed_at'`,
    )
    expect(column.rows[0]).toEqual({ is_nullable: 'YES', column_default: null })

    const applicant = await insertUser()
    const applicationId = await insertApplication(applicant)
    const { application } = await readState(applicationId, applicant)
    expect(application.reviewed_at).toBeNull()
  })

  it('approves: records reviewer/reviewed_at and flips companies in one transaction', async function () {
    const admin = await insertUser()
    const applicant = await insertUser()
    const applicationId = await insertApplication(applicant)

    const { application } = await createService().decide({ userId: admin }, applicationId, {
      decision: 'approved',
    })

    expect(application.status).toBe('approved')
    expect(application.reviewedBy?.userId).toBe(admin)
    const state = await readState(applicationId, applicant)
    expect(state.companies).toBe(true)
    expect(state.application.reviewed_by).toBe(admin)
    expect(state.application.reviewed_at).toBeInstanceOf(Date)
  })

  it('rejects without mutating the applicant, and attributes the acting admin', async function () {
    const admin = await insertUser()
    const applicant = await insertUser()
    const applicationId = await insertApplication(applicant)

    await createService().decide({ userId: admin }, applicationId, { decision: 'rejected' })

    const state = await readState(applicationId, applicant)
    expect(state.application.status).toBe('rejected')
    expect(state.application.reviewed_by).toBe(admin)
    expect(state.application.reviewed_by).not.toBe(applicant)
    expect(state.companies).toBe(false)
  })

  it('approval of an already-eligible applicant still succeeds', async function () {
    const admin = await insertUser()
    const applicant = await insertUser({ companies: true })
    const applicationId = await insertApplication(applicant)

    await createService().decide({ userId: admin }, applicationId, { decision: 'approved' })
    const state = await readState(applicationId, applicant)
    expect(state.application.status).toBe('approved')
    expect(state.companies).toBe(true)
  })

  it('rolls back approval for a deleted applicant but allows rejection', async function () {
    const admin = await insertUser()
    const applicant = await insertUser({ deleted: true })
    const applicationId = await insertApplication(applicant)

    await expect(
      createService().decide({ userId: admin }, applicationId, { decision: 'approved' }),
    ).rejects.toBeInstanceOf(AdminReviewConflictError)

    let state = await readState(applicationId, applicant)
    expect(state.application.status).toBe('pending')
    expect(state.application.reviewed_by).toBeNull()
    expect(state.application.reviewed_at).toBeNull()
    expect(state.companies).toBe(false)

    const { application } = await createService().decide({ userId: admin }, applicationId, {
      decision: 'rejected',
    })
    expect(application.applicant.isAccountDeleted).toBe(true)
    state = await readState(applicationId, applicant)
    expect(state.application.status).toBe('rejected')
    expect(state.companies).toBe(false)
  })

  it.each([
    ['approved', 'approved'],
    ['approved', 'rejected'],
    ['rejected', 'approved'],
  ] as const)(
    'two concurrent writers (%s vs %s) converge to one winner and the loser conflicts',
    async function (first, second) {
      const adminA = await insertUser()
      const adminB = await insertUser()
      const applicant = await insertUser()
      const applicationId = await insertApplication(applicant)

      const results = await Promise.allSettled([
        createService().decide({ userId: adminA }, applicationId, { decision: first }),
        createService().decide({ userId: adminB }, applicationId, { decision: second }),
      ])

      const winners = results.filter((r) => r.status === 'fulfilled')
      const losers = results.filter((r) => r.status === 'rejected')
      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)
      expect((losers[0] as PromiseRejectedResult).reason).toBeInstanceOf(AdminReviewConflictError)

      const winnerIndex = results.findIndex((r) => r.status === 'fulfilled')
      const winningDecision = winnerIndex === 0 ? first : second
      const winningAdmin = winnerIndex === 0 ? adminA : adminB
      const state = await readState(applicationId, applicant)

      // No split state: decision, reviewer, and eligibility all come from the single winner.
      expect(state.application.status).toBe(winningDecision)
      expect(state.application.reviewed_by).toBe(winningAdmin)
      expect(state.companies).toBe(winningDecision === 'approved')

      const rows = await pool.query(
        'SELECT count(*)::int AS count FROM user_interviewer_applications WHERE user_id = $1',
        [applicant],
      )
      expect(rows.rows[0].count).toBe(1)
    },
  )

  it('detail and list reflect reviewer identity and ordering from the database', async function () {
    const admin = await insertUser()
    const applicant = await insertUser()
    const applicationId = await insertApplication(applicant)
    const service = createService()

    const before = await service.listApplications({ status: 'pending', limit: '100' })
    expect(before.applications.some((a) => a.applicationId === applicationId)).toBe(true)

    await service.decide({ userId: admin }, applicationId, { decision: 'approved' })
    const detail = await service.getApplication(applicationId)
    expect(detail.application.reviewedBy?.userId).toBe(admin)
    expect(detail.application.employmentHistory[0]?.sourceCompanyId).toBeNull()

    const approved = await service.listApplications({ status: 'approved', limit: '100' })
    const times = approved.applications.map((a) => a.createdAt)
    expect([...times].sort()).toEqual(times)
  })
})
