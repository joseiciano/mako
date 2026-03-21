import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { AccountRepository } from './account-repository'

const userId = '11111111-1111-4111-8111-111111111111'
const companyId = '22222222-2222-4222-8222-222222222222'

describe('AccountRepository', function accountRepositorySuite() {
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
              joined: '2023-01-01T00:00:00.000Z',
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
    expect(executedQueries[0]?.text).toContain('FROM "User_Companies"')
    expect(executedQueries[0]?.values).toEqual([userId])
    expect(companies).toEqual([
      {
        id: companyId,
        userId,
        company: 'mako',
        joined: '2023-01-01T00:00:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
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
              joined: '2022-05-01T00:00:00.000Z',
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
      joined: '2022-05-01T00:00:00.000Z',
    })

    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]?.text).toContain('INSERT INTO "User_Companies"')
    expect(executedQueries[0]?.values).toEqual([
      userId,
      'stripe',
      '2022-05-01T00:00:00.000Z',
    ])
    expect(company.company).toBe('stripe')
    expect(company.userId).toBe(userId)
  })
})
