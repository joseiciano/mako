import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { InterviewerApplicationRepository } from './interviewer-application-repository'
import {
  InterviewerApplicationConflictError,
  InterviewerApplicationForbiddenError,
  InterviewerApplicationValidationError,
} from './types'

const userId = '11111111-1111-4111-8111-111111111111'
const applicationId = '22222222-2222-4222-8222-222222222222'
const companyId = '33333333-3333-4333-8333-333333333333'

describe('InterviewerApplicationRepository', function suite() {
  it('submits an application with ordered employment snapshot', async function run() {
    const queries: SqlQuery[] = []

    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        queries.push(queryInput)
        const text = queryInput.text

        if (text.includes('BEGIN') || text.includes('COMMIT') || text.includes('ROLLBACK')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FOR UPDATE') && text.includes('FROM "user"')) {
          return { rows: [{ id: userId }] as Row[] }
        }

        if (text.includes('status IN') && text.includes('LIMIT 1')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FROM user_companies')) {
          return {
            rows: [
              {
                id: companyId,
                user_id: userId,
                company: 'mako',
                role: 'backend engineer',
                joined: '2023-01-01T00:00:00.000Z',
                ended_at: null,
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
                deleted_at: null,
              },
            ] as Row[],
          }
        }

        if (text.includes('INSERT INTO user_interviewer_applications')) {
          const [, userIdVal, email, employmentHistory] = queryInput.values
          return {
            rows: [
              {
                id: applicationId,
                user_id: userIdVal,
                email,
                employment_history:
                  typeof employmentHistory === 'string'
                    ? JSON.parse(employmentHistory)
                    : employmentHistory,
                status: 'pending',
                reviewed_by: null,
                created_at: '2026-08-07T00:00:00.000Z',
                updated_at: '2026-08-07T00:00:00.000Z',
              },
            ] as Row[],
          }
        }

        return { rows: [] as Row[] }
      },
    })

    const result = await repository.submitApplication({
      userId,
      email: 'contact@example.com',
      employmentRecordIds: [companyId],
    })

    // Verify BEGIN and COMMIT bookend the transaction
    const normalizedTexts = queries.map(function normalize(q) {
      return q.text.trim().toUpperCase()
    })
    expect(normalizedTexts[0]).toBe('BEGIN;')
    expect(normalizedTexts.at(-1)).toBe('COMMIT;')

    // Verify snapshot ordering: sourceCompanyId is the locked company id
    expect(result.employment_history).toHaveLength(1)
    expect(result.employment_history[0]?.sourceCompanyId).toBe(companyId)
    expect(result.employment_history[0]?.company).toBe('mako')
    expect(result.employment_history[0]?.role).toBe('backend engineer')
    expect(result.employment_history[0]?.start).toBe('2023-01-01')
    expect(result.employment_history[0]?.end).toBeNull()
    expect(result.status).toBe('pending')
    expect(result.email).toBe('contact@example.com')
  })

  it('rejects submission when applicant user is not active', async function run() {
    const queries: SqlQuery[] = []

    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        queries.push(queryInput)
        const text = queryInput.text

        if (text.includes('BEGIN')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FOR UPDATE') && text.includes('FROM "user"')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('ROLLBACK')) {
          return { rows: [] as Row[] }
        }

        return { rows: [] as Row[] }
      },
    })

    await expect(
      repository.submitApplication({
        userId,
        email: 'contact@example.com',
        employmentRecordIds: [companyId],
      }),
    ).rejects.toBeInstanceOf(InterviewerApplicationForbiddenError)

    const normalizedTexts = queries.map(function normalize(q) {
      return q.text.trim().toUpperCase()
    })
    expect(normalizedTexts).toContain('ROLLBACK;')
  })

  it('rejects submission when an active application already exists', async function run() {
    const queries: SqlQuery[] = []

    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        queries.push(queryInput)
        const text = queryInput.text

        if (text.includes('BEGIN')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FOR UPDATE') && text.includes('FROM "user"')) {
          return { rows: [{ id: userId }] as Row[] }
        }

        if (text.includes('status IN') && text.includes('LIMIT 1')) {
          return { rows: [{ id: applicationId }] as Row[] }
        }

        if (text.includes('ROLLBACK')) {
          return { rows: [] as Row[] }
        }

        return { rows: [] as Row[] }
      },
    })

    await expect(
      repository.submitApplication({
        userId,
        email: 'contact@example.com',
        employmentRecordIds: [companyId],
      }),
    ).rejects.toBeInstanceOf(InterviewerApplicationConflictError)

    const normalizedTexts = queries.map(function normalize(q) {
      return q.text.trim().toUpperCase()
    })
    expect(normalizedTexts).toContain('ROLLBACK;')
  })

  it('rejects submission when selected records are missing or incomplete', async function run() {
    const queries: SqlQuery[] = []

    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        queries.push(queryInput)
        const text = queryInput.text

        if (text.includes('BEGIN')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FOR UPDATE') && text.includes('FROM "user"')) {
          return { rows: [{ id: userId }] as Row[] }
        }

        if (text.includes('status IN') && text.includes('LIMIT 1')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FROM user_companies')) {
          // Return only 1 row when 2 were requested
          return {
            rows: [
              {
                id: companyId,
                user_id: userId,
                company: 'mako',
                role: 'backend engineer',
                joined: '2023-01-01T00:00:00.000Z',
                ended_at: null,
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
                deleted_at: null,
              },
            ] as Row[],
          }
        }

        if (text.includes('ROLLBACK')) {
          return { rows: [] as Row[] }
        }

        return { rows: [] as Row[] }
      },
    })

    await expect(
      repository.submitApplication({
        userId,
        email: 'contact@example.com',
        employmentRecordIds: [
          companyId,
          '44444444-4444-4444-8444-444444444444',
        ],
      }),
    ).rejects.toBeInstanceOf(InterviewerApplicationValidationError)

    const normalizedTexts = queries.map(function normalize(q) {
      return q.text.trim().toUpperCase()
    })
    expect(normalizedTexts).toContain('ROLLBACK;')
  })

  it('rolls back transaction when insert returns no rows', async function run() {
    const queries: SqlQuery[] = []

    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        queries.push(queryInput)
        const text = queryInput.text

        if (text.includes('BEGIN') || text.includes('ROLLBACK')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FOR UPDATE') && text.includes('FROM "user"')) {
          return { rows: [{ id: userId }] as Row[] }
        }

        if (text.includes('status IN') && text.includes('LIMIT 1')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FROM user_companies')) {
          return {
            rows: [
              {
                id: companyId,
                user_id: userId,
                company: 'mako',
                role: 'backend engineer',
                joined: '2023-01-01T00:00:00.000Z',
                ended_at: null,
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
                deleted_at: null,
              },
            ] as Row[],
          }
        }

        if (text.includes('INSERT INTO user_interviewer_applications')) {
          return { rows: [] as Row[] }
        }

        return { rows: [] as Row[] }
      },
    })

    await expect(
      repository.submitApplication({
        userId,
        email: 'contact@example.com',
        employmentRecordIds: [companyId],
      }),
    ).rejects.toThrow('Failed to insert interviewer application record.')

    const normalizedTexts = queries.map(function normalize(q) {
      return q.text.trim().toUpperCase()
    })
    expect(normalizedTexts).toContain('ROLLBACK;')
  })

  it('maps unique constraint violation on insert to conflict error', async function run() {
    const queries: SqlQuery[] = []

    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        queries.push(queryInput)
        const text = queryInput.text

        if (text.includes('BEGIN') || text.includes('ROLLBACK')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FOR UPDATE') && text.includes('FROM "user"')) {
          return { rows: [{ id: userId }] as Row[] }
        }

        if (text.includes('status IN') && text.includes('LIMIT 1')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FROM user_companies')) {
          return {
            rows: [
              {
                id: companyId,
                user_id: userId,
                company: 'mako',
                role: 'backend engineer',
                joined: '2023-01-01T00:00:00.000Z',
                ended_at: null,
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
                deleted_at: null,
              },
            ] as Row[],
          }
        }

        if (text.includes('INSERT INTO user_interviewer_applications')) {
          const uniqueViolationError = Object.assign(new Error('duplicate key value'), {
            code: '23505',
          })
          throw uniqueViolationError
        }

        return { rows: [] as Row[] }
      },
    })

    await expect(
      repository.submitApplication({
        userId,
        email: 'contact@example.com',
        employmentRecordIds: [companyId],
      }),
    ).rejects.toBeInstanceOf(InterviewerApplicationConflictError)

    const normalizedTexts = queries.map(function normalize(q) {
      return q.text.trim().toUpperCase()
    })
    expect(normalizedTexts).toContain('ROLLBACK;')
  })

  it('gets latest application ordered by created_at desc and id desc', async function run() {
    let capturedQuery: SqlQuery | null = null

    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        capturedQuery = queryInput
        return {
          rows: [
            {
              id: applicationId,
              user_id: userId,
              email: 'contact@example.com',
              employment_history: [
                {
                  sourceCompanyId: companyId,
                  company: 'mako',
                  role: 'backend engineer',
                  start: '2023-01-01',
                  end: null,
                },
              ],
              status: 'pending',
              reviewed_by: null,
              created_at: '2026-08-07T00:00:00.000Z',
              updated_at: '2026-08-07T00:00:00.000Z',
            },
          ] as Row[],
        }
      },
    })

    const result = await repository.getLatestApplication(userId)

    expect(capturedQuery).not.toBeNull()
    expect(capturedQuery!.text).toContain('ORDER BY created_at DESC, id DESC')
    expect(capturedQuery!.text).toContain('LIMIT 1')
    expect(result).not.toBeNull()
    expect(result?.id).toBe(applicationId)
  })

  it('returns null when no latest application exists', async function run() {
    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>() {
        return { rows: [] as Row[] }
      },
    })

    const result = await repository.getLatestApplication(userId)

    expect(result).toBeNull()
  })

  it('isUserActive reports active user', async function run() {
    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>() {
        return { rows: [{ exists: 1 }] as Row[] }
      },
    })

    const isActive = await repository.isUserActive(userId)
    expect(isActive).toBe(true)
  })

  it('isUserActive reports inactive user', async function run() {
    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>() {
        return { rows: [] as Row[] }
      },
    })

    const isActive = await repository.isUserActive(userId)
    expect(isActive).toBe(false)
  })

  it('hasActiveApplication reports active application', async function run() {
    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>() {
        return { rows: [{ id: applicationId }] as Row[] }
      },
    })

    const hasActive = await repository.hasActiveApplication(userId)
    expect(hasActive).toBe(true)
  })

  it('hasActiveApplication reports no active application', async function run() {
    const repository = new InterviewerApplicationRepository({
      query: async function query<Row>() {
        return { rows: [] as Row[] }
      },
    })

    const hasActive = await repository.hasActiveApplication(userId)
    expect(hasActive).toBe(false)
  })
})
