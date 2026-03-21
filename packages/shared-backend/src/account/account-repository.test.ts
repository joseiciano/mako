import { describe, expect, it, vi } from 'vitest'
import type { SqlQuery } from '../index'
import { AccountRepository } from './account-repository'

describe('AccountRepository', function accountRepositorySuite() {
  it('soft deletes account by setting deleted_at', async function testDeleteAccount() {
    const query = vi.fn(async function query() {
      return { rowCount: 1 }
    })

    const repository = new AccountRepository({ query })

    const didDelete = await repository.deleteAccount(
      'c2e12f95-6db4-46d4-8f22-0e59261458cf',
    )

    expect(didDelete).toBe(true)
    expect(query).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('SET deleted_at = NOW()'),
        values: ['c2e12f95-6db4-46d4-8f22-0e59261458cf'],
      }),
    )
  })

  it('returns false when account is already deleted', async function testDeleteAccountNotFound() {
    const query = vi.fn(async function query() {
      return { rowCount: 0 }
    })

    const repository = new AccountRepository({ query })

    const didDelete = await repository.deleteAccount(
      '8e8f2886-ce8f-4bcc-a2d7-1b95f0e9bb3c',
    )

    expect(didDelete).toBe(false)
  })

  it('invalidates sessions and cancels upcoming interviews', async function testCleanupQueries() {
    const capturedQueries: SqlQuery[] = []
    const query = vi.fn(async function query(sqlQuery: SqlQuery) {
      capturedQueries.push(sqlQuery)
      return { rowCount: 1 }
    })

    const repository = new AccountRepository({ query })

    await repository.invalidateSessions('8e8f2886-ce8f-4bcc-a2d7-1b95f0e9bb3c')
    await repository.cancelUpcomingInterviews('8e8f2886-ce8f-4bcc-a2d7-1b95f0e9bb3c')

    expect(query).toHaveBeenCalledTimes(2)
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
})
