import { describe, expect, it } from 'vitest'
import type { SqlQuery, SqlQueryExecutor } from '../index'
import { AdminApplicationReviewRepository } from './admin-application-review-repository'
import { adminId, applicantId, applicationId, buildDetailRow } from './test-support'

type Responder = (query: SqlQuery) => { rows: unknown[] } | undefined

function createExecutor(responder: Responder) {
  const statements: SqlQuery[] = []
  const executor: SqlQueryExecutor = {
    async query<Row>(query: SqlQuery) {
      statements.push(query)
      const response = responder(query)
      if (response instanceof Error) throw response
      return (response ?? { rows: [] }) as { rows: Row[] }
    },
  }

  return { executor, statements }
}

function texts(statements: SqlQuery[]): string[] {
  return statements.map((s) => s.text.replace(/\s+/g, ' ').trim())
}

describe('AdminApplicationReviewRepository', function () {
  it('lists with status filter, stable ordering, and limit + 1', async function () {
    const { executor, statements } = createExecutor(() => ({ rows: [] }))
    await new AdminApplicationReviewRepository(executor).listByStatus({
      status: 'pending',
      limit: 25,
      offset: 50,
    })

    const [sql] = texts(statements)
    expect(sql).toContain('WHERE a.status = $1')
    expect(sql).toContain('ORDER BY a.created_at ASC, a.id ASC')
    expect(sql).not.toContain('employment_history')
    expect(statements[0]?.values).toEqual(['pending', 26, 50])
  })

  it('reads detail with applicant and reviewer identity', async function () {
    const { executor, statements } = createExecutor(() => ({ rows: [buildDetailRow()] }))
    const row = await new AdminApplicationReviewRepository(executor).getDetail(applicationId)

    expect(row?.id).toBe(applicationId)
    const [sql] = texts(statements)
    expect(sql).toContain('applicant.deleted_at IS NOT NULL')
    expect(sql).toContain('LEFT JOIN "user" reviewer')
    expect(sql).toContain('a.employment_history')
  })

  it('approves in one transaction: guarded update, eligibility update, commit', async function () {
    const { executor, statements } = createExecutor((query) => {
      if (query.text.includes('UPDATE user_interviewer_applications')) {
        return { rows: [{ id: applicationId, user_id: applicantId }] }
      }
      if (query.text.includes('UPDATE "user"')) return { rows: [{ id: applicantId }] }
      if (query.text.includes('FROM user_interviewer_applications a')) {
        return { rows: [buildDetailRow({ status: 'approved', reviewed_by: adminId })] }
      }
      return undefined
    })

    const result = await new AdminApplicationReviewRepository(executor).decide({
      applicationId,
      adminId,
      decision: 'approved',
    })

    expect(result.outcome).toBe('decided')
    const sql = texts(statements)
    expect(sql[0]).toBe('BEGIN;')
    expect(sql[1]).toContain("AND status = 'pending'")
    expect(sql[1]).toContain('reviewed_by = $3')
    expect(sql[1]).toContain('reviewed_at = $4')
    expect(sql[1]).toContain('updated_at = $4')
    expect(sql[2]).toContain('SET companies = true')
    expect(sql[2]).toContain('deleted_at IS NULL')
    expect(sql.at(-1)).toBe('COMMIT;')
  })

  it('rejection does not touch the user row', async function () {
    const { executor, statements } = createExecutor((query) => {
      if (query.text.includes('UPDATE user_interviewer_applications')) {
        return { rows: [{ id: applicationId, user_id: applicantId }] }
      }
      if (query.text.includes('FROM user_interviewer_applications a')) {
        return { rows: [buildDetailRow({ status: 'rejected', reviewed_by: adminId })] }
      }
      return undefined
    })

    const result = await new AdminApplicationReviewRepository(executor).decide({
      applicationId,
      adminId,
      decision: 'rejected',
    })

    expect(result.outcome).toBe('decided')
    expect(texts(statements).some((s) => s.includes('UPDATE "user"'))).toBe(false)
  })

  it('rolls back the application transition when the eligibility update affects no row', async function () {
    const { executor, statements } = createExecutor((query) => {
      if (query.text.includes('UPDATE user_interviewer_applications')) {
        return { rows: [{ id: applicationId, user_id: applicantId }] }
      }
      return undefined
    })

    const result = await new AdminApplicationReviewRepository(executor).decide({
      applicationId,
      adminId,
      decision: 'approved',
    })

    expect(result).toEqual({ outcome: 'conflict', reason: 'applicant_deleted' })
    const sql = texts(statements)
    expect(sql.at(-1)).toBe('ROLLBACK;')
    expect(sql).not.toContain('COMMIT;')
  })

  it('distinguishes 404 from 409 after a zero-row guarded update', async function () {
    const missing = createExecutor(() => ({ rows: [] }))
    expect(
      await new AdminApplicationReviewRepository(missing.executor).decide({
        applicationId,
        adminId,
        decision: 'approved',
      }),
    ).toEqual({ outcome: 'not_found' })
    expect(texts(missing.statements).at(-1)).toBe('ROLLBACK;')

    const exists = createExecutor((query) =>
      query.text.includes('SELECT id FROM user_interviewer_applications')
        ? { rows: [{ id: applicationId }] }
        : { rows: [] },
    )
    expect(
      await new AdminApplicationReviewRepository(exists.executor).decide({
        applicationId,
        adminId,
        decision: 'approved',
      }),
    ).toEqual({ outcome: 'conflict', reason: 'not_pending' })
  })

  it('rolls back and rethrows on a query error', async function () {
    const boom = Object.assign(new Error('serialization'), { code: '40001' })
    const statements: SqlQuery[] = []
    const executor: SqlQueryExecutor = {
      async query<Row>(query: SqlQuery) {
        statements.push(query)
        if (query.text.includes('UPDATE user_interviewer_applications')) throw boom
        return { rows: [] as Row[] }
      },
    }

    await expect(
      new AdminApplicationReviewRepository(executor).decide({
        applicationId,
        adminId,
        decision: 'approved',
      }),
    ).rejects.toBe(boom)
    expect(texts(statements).at(-1)).toBe('ROLLBACK;')
  })
})
