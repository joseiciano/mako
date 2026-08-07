import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { AccountRepository } from './account-repository'

const userId = '11111111-1111-4111-8111-111111111111'
const companyId = '22222222-2222-4222-8222-222222222222'

describe('AccountRepository', function accountRepositorySuite() {
  it('queries account profile by user id when using the database executor', async function shouldQueryProfile() {
    const executedQueries: SqlQuery[] = []

    const repository = new AccountRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

        return {
          rows: [
            {
              id: userId,
              email: 'candidate@mako.dev',
              name: 'Candidate',
              credits: 3,
              free_standard_interviews: 1,
              free_ai_interviews: 2,
              companies: false,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
              deleted_at: null,
            },
          ] as Row[],
        }
      },
    })

    const profile = await repository.getProfile(userId)

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('FROM "user"'),
        values: [userId],
      }),
    )
    expect(executedQueries[0]?.text).toContain('credits')
    expect(executedQueries[0]?.text).toContain('free_standard_interviews')
    expect(executedQueries[0]?.text).toContain('free_ai_interviews')
    expect(profile).toEqual({
      id: userId,
      email: 'candidate@mako.dev',
      displayName: 'Candidate',
      credits: 3,
      freeStandardInterviews: 1,
      freeAiInterviews: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('updates account profile display name through the database executor', async function shouldUpdateProfile() {
    const executedQueries: SqlQuery[] = []

    const repository = new AccountRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

        return {
          rows: [
            {
              id: userId,
              email: 'candidate@mako.dev',
              name: 'Updated Candidate',
              credits: 3,
              free_standard_interviews: 1,
              free_ai_interviews: 2,
              companies: false,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-02T00:00:00.000Z',
              deleted_at: null,
            },
          ] as Row[],
        }
      },
    })

    const profile = await repository.updateProfile(userId, 'Updated Candidate')

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('UPDATE "user"'),
        values: [userId, 'Updated Candidate'],
      }),
    )
    expect(profile?.displayName).toBe('Updated Candidate')
  })

  it('soft deletes account by setting deleted_at', async function shouldDeleteAccount() {
    const executedQueries: SqlQuery[] = []
    async function query<Row>(queryInput: SqlQuery) {
      executedQueries.push(queryInput)
      return {
        rows: [{ id: userId }] as Row[],
      }
    }

    const repository = new AccountRepository({ query })
    const didDelete = await repository.deleteAccount(userId)

    expect(didDelete).toBe(true)
    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('SET deleted_at = NOW()'),
        values: [userId],
      }),
    )
  })

  it('returns false when account is already deleted', async function shouldReturnFalseWhenNotFound() {
    async function query<Row>() {
      return {
        rows: [] as Row[],
      }
    }

    const repository = new AccountRepository({ query })
    const didDelete = await repository.deleteAccount(userId)

    expect(didDelete).toBe(false)
  })

  it('invalidates sessions and cancels upcoming interviews', async function shouldExecuteCleanupQueries() {
    const capturedQueries: SqlQuery[] = []
    async function query<Row>(sqlQuery: SqlQuery) {
      capturedQueries.push(sqlQuery)
      return { rows: [] as Row[] }
    }

    const repository = new AccountRepository({ query })

    await repository.invalidateSessions(userId)
    await repository.cancelUpcomingInterviews(userId)

    expect(capturedQueries).toHaveLength(2)
    expect(capturedQueries[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('DELETE FROM "session"'),
      }),
    )
    expect(capturedQueries[1]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('UPDATE interviews'),
      }),
    )
  })

  it('queries company history by user id', async function shouldQueryByUserId() {
    const executedQueries: Array<{ text: string; values: readonly unknown[] }> = []

    const repository = new AccountRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

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
      },
    })

    const companies = await repository.getCompaniesByUserId(userId)

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]?.text).toContain('FROM user_companies')
    expect(executedQueries[0]?.values).toEqual([userId])
    expect(companies).toEqual([
      {
        id: companyId,
        userId,
        company: 'mako',
        role: 'backend engineer',
        start: '2023-01-01',
        end: null,
        isComplete: true,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
        joined: '2023-01-01T00:00:00.000Z',
      },
    ])
  })

  it('inserts a company record for a user', async function shouldInsertCompany() {
    const executedQueries: Array<{ text: string; values: readonly unknown[] }> = []

    const repository = new AccountRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

        return {
          rows: [
            {
              id: companyId,
              user_id: userId,
              company: 'stripe',
              role: 'engineer',
              joined: '2022-05-01T00:00:00.000Z',
              ended_at: null,
              created_at: '2022-05-01T00:00:00.000Z',
              updated_at: '2022-05-01T00:00:00.000Z',
              deleted_at: null,
            },
          ] as Row[],
        }
      },
    })

    const company = await repository.addCompanyRecord({
      userId,
      company: 'stripe',
      role: 'engineer',
      joined: '2022-05-01T00:00:00.000Z',
      endedAt: null,
    })

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]?.text).toContain('INSERT INTO user_companies')
    expect(executedQueries[0]?.values).toHaveLength(8)
    expect(executedQueries[0]?.values[1]).toBe(userId)
    expect(executedQueries[0]?.values[2]).toBe('stripe')
    expect(executedQueries[0]?.values[3]).toBe('engineer')
    expect(executedQueries[0]?.values[4]).toBe('2022-05-01T00:00:00.000Z')
    expect(executedQueries[0]?.values[5]).toBeNull()
    expect(company.company).toBe('stripe')
    expect(company.userId).toBe(userId)
    expect(company.role).toBe('engineer')
    expect(company.isComplete).toBe(true)
  })

  it('updates a company record for a user', async function shouldUpdateCompany() {
    const executedQueries: Array<{ text: string; values: readonly unknown[] }> = []

    const repository = new AccountRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

        return {
          rows: [
            {
              id: companyId,
              user_id: userId,
              company: 'stripe',
              role: 'senior engineer',
              joined: '2020-03-01T00:00:00.000Z',
              ended_at: '2023-06-01T00:00:00.000Z',
              created_at: '2020-03-01T00:00:00.000Z',
              updated_at: '2023-06-01T00:00:00.000Z',
              deleted_at: null,
            },
          ] as Row[],
        }
      },
    })

    const company = await repository.updateCompanyRecord({
      id: companyId,
      userId,
      company: 'stripe',
      role: 'senior engineer',
      joined: '2020-03-01T00:00:00.000Z',
      endedAt: '2023-06-01T00:00:00.000Z',
    })

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]?.text).toContain('UPDATE user_companies')
    expect(executedQueries[0]?.values).toEqual([
      companyId,
      userId,
      'stripe',
      'senior engineer',
      '2020-03-01T00:00:00.000Z',
      '2023-06-01T00:00:00.000Z',
      expect.any(String),
    ])
    expect(company).toEqual({
      id: companyId,
      userId,
      company: 'stripe',
      role: 'senior engineer',
      start: '2020-03-01',
      end: '2023-06-01',
      isComplete: true,
      createdAt: '2020-03-01T00:00:00.000Z',
      updatedAt: '2023-06-01T00:00:00.000Z',
      joined: '2020-03-01T00:00:00.000Z',
    })
  })

  it('returns null when updating a missing company record', async function shouldReturnNullWhenMissing() {
    const repository = new AccountRepository({
      query: async function query<Row>() {
        return { rows: [] as Row[] }
      },
    })

    const company = await repository.updateCompanyRecord({
      id: companyId,
      userId,
      company: 'stripe',
      role: 'engineer',
      joined: '2020-03-01T00:00:00.000Z',
      endedAt: null,
    })

    expect(company).toBeNull()
  })

  it('soft deletes a company record by setting deleted_at', async function shouldSoftDeleteCompany() {
    const executedQueries: Array<{ text: string; values: readonly unknown[] }> = []

    const repository = new AccountRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)
        return {
          rows: [{ id: companyId }] as Row[],
        }
      },
    })

    const didDelete = await repository.softDeleteCompanyRecord({
      id: companyId,
      userId,
    })

    expect(didDelete).toBe(true)
    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('SET deleted_at = $3'),
        values: [
          companyId,
          userId,
          expect.any(String),
          expect.any(String),
        ],
      }),
    )
    const [, , deletedAt, updatedAt] = executedQueries[0].values
    expect(deletedAt).toBe(updatedAt)
  })

  it('returns false when soft deleting a missing company record', async function shouldReturnFalseWhenMissing() {
    const repository = new AccountRepository({
      query: async function query<Row>() {
        return { rows: [] as Row[] }
      },
    })

    const didDelete = await repository.softDeleteCompanyRecord({
      id: companyId,
      userId,
    })

    expect(didDelete).toBe(false)
  })

  it('reports whether a user account is active', async function shouldCheckUserActive() {
    const executedQueries: Array<{ text: string; values: readonly unknown[] }> = []

    const repository = new AccountRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)
        return {
          rows: [{ exists: 1 }] as Row[],
        }
      },
    })

    const isActive = await repository.isUserActive(userId)

    expect(isActive).toBe(true)
    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]).toEqual(
      expect.objectContaining({
        text: expect.stringMatching(/FROM "user"[\s\S]*deleted_at IS NULL/),
        values: [userId],
      }),
    )
  })

  it('reports inactive when no active user row exists', async function shouldCheckInactive() {
    const repository = new AccountRepository({
      query: async function query<Row>() {
        return { rows: [] as Row[] }
      },
    })

    const isActive = await repository.isUserActive(userId)

    expect(isActive).toBe(false)
  })
})
