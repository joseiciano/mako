import { describe, expect, it, vi } from 'vitest'
import type { SqlQuery } from '../index'
import {
  AccountRepository,
  createInMemoryAccountDataSource,
  type SqlQueryExecutor,
} from './account-repository'
import { AccountService } from './account-service'
import {
  AccountNotFoundError,
  AccountUnauthorizedError,
  AccountValidationError,
  type AccountSession,
} from './types'

const activeSession: AccountSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@mako.dev',
}

function createProfileService() {
  const accountRepository = new AccountRepository(
    createInMemoryAccountDataSource([
      {
        id: activeSession.userId,
        email: activeSession.email,
        displayName: 'Candidate One',
        credits: 10,
        freeStandardInterviews: 1,
        freeAiInterviews: 1,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]),
  )

  return new AccountService(accountRepository)
}

describe('AccountService', function suite() {
  it('getAccount returns active account profile', async function run() {
    const service = createProfileService()

    const profile = await service.getAccount(activeSession)

    expect(profile.id).toBe(activeSession.userId)
    expect(profile.email).toBe(activeSession.email)
    expect(profile.displayName).toBe('Candidate One')
  })

  it('getAccount requires authenticated session', async function run() {
    const service = createProfileService()

    await expect(service.getAccount(null)).rejects.toBeInstanceOf(
      AccountUnauthorizedError,
    )
  })

  it('updateProfile persists display name updates', async function run() {
    const service = createProfileService()

    const updatedProfile = await service.updateProfile(activeSession, {
      displayName: '  Updated Name  ',
    })

    expect(updatedProfile.displayName).toBe('Updated Name')

    const refreshedProfile = await service.getAccount(activeSession)
    expect(refreshedProfile.displayName).toBe('Updated Name')
  })

  it('updateProfile validates display name input', async function run() {
    const service = createProfileService()

    await expect(
      service.updateProfile(activeSession, {
        displayName: '   ',
      }),
    ).rejects.toBeInstanceOf(AccountValidationError)
  })

  it('updateProfile throws not found when account is missing', async function run() {
    const service = new AccountService(
      new AccountRepository(createInMemoryAccountDataSource([])),
    )

    await expect(
      service.updateProfile(activeSession, {
        displayName: 'Any Name',
      }),
    ).rejects.toBeInstanceOf(AccountNotFoundError)
  })

  it('deleteAccount rejects unauthenticated requests', async function run() {
    const service = new AccountService(
      new AccountRepository({
        dataSource: createInMemoryAccountDataSource([]),
        queryExecutor: createDeleteQueryExecutor({ didDelete: true }),
      }),
    )

    await expect(service.deleteAccount(null)).rejects.toBeInstanceOf(
      AccountUnauthorizedError,
    )
  })

  it('deleteAccount runs cleanup workflow and returns success', async function run() {
    const cleanupWorkflow = vi.fn(async function cleanupWorkflow() {})
    const service = new AccountService(
      new AccountRepository({
        dataSource: createInMemoryAccountDataSource([]),
        queryExecutor: createDeleteQueryExecutor({ didDelete: true }),
      }),
      cleanupWorkflow,
    )

    const result = await service.deleteAccount(activeSession)

    expect(result).toEqual({ success: true })
    expect(cleanupWorkflow).toHaveBeenCalledWith(activeSession.userId)
  })

  it('deleteAccount throws not found when user is missing', async function run() {
    const service = new AccountService(
      new AccountRepository({
        dataSource: createInMemoryAccountDataSource([]),
        queryExecutor: createDeleteQueryExecutor({ didDelete: false }),
      }),
    )

    await expect(service.deleteAccount(activeSession)).rejects.toBeInstanceOf(
      AccountNotFoundError,
    )
  })
})

function createDeleteQueryExecutor(options: { didDelete: boolean }): SqlQueryExecutor {
  return {
    async query<Row>(queryInput: SqlQuery) {
      if (queryInput.text.includes('UPDATE users')) {
        return {
          rows: options.didDelete ? ([{ id: activeSession.userId }] as Row[]) : [],
        }
      }

      return {
        rows: [] as Row[],
      }
    },
  }
}
