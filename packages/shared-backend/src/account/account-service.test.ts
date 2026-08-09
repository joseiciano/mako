import { describe, expect, it, vi } from 'vitest'
import type { SqlQuery } from '../index'
import type { PremiumCancellationService } from '../premium'
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
        isVerifiedInterviewer: false,
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

  it('deleteAccount cancels upcoming interviews through the premium service before soft delete', async function run() {
    const cancelUpcomingInterviewsForUser = vi.fn(async function cancel() {
      return { outcome: 'cancelled', count: 0 }
    })
    const premiumCancellationService = {
      cancelUpcomingInterviewsForUser,
    } as unknown as PremiumCancellationService
    const persistOutboxEvent = vi.fn(async function persist() {})

    const accountRepository = new AccountRepository({
      dataSource: createInMemoryAccountDataSource([]),
      queryExecutor: createDeleteQueryExecutor({ didDelete: true }),
    })
    const deleteAccountSpy = vi.spyOn(accountRepository, 'deleteAccount')

    const service = new AccountService(
      accountRepository,
      async function noopCleanupWorkflow() {},
      undefined,
      premiumCancellationService,
      persistOutboxEvent,
    )

    const result = await service.deleteAccount(activeSession)

    expect(result).toEqual({ success: true })
    expect(cancelUpcomingInterviewsForUser).toHaveBeenCalledWith({
      userId: activeSession.userId,
      persistOutboxEvent: expect.any(Function),
      softDeleteAccount: expect.any(Function),
    })
    expect(deleteAccountSpy).not.toHaveBeenCalled()
  })

  it('deleteAccount does not soft delete the account when premium cancellation fails', async function run() {
    const cancellationError = new Error('Upcoming interview cancellation failed.')
    const cancelUpcomingInterviewsForUser = vi.fn(async function cancel() {
      throw cancellationError
    })
    const premiumCancellationService = {
      cancelUpcomingInterviewsForUser,
    } as unknown as PremiumCancellationService

    const accountRepository = new AccountRepository({
      dataSource: createInMemoryAccountDataSource([]),
      queryExecutor: createDeleteQueryExecutor({ didDelete: true }),
    })
    const deleteAccountSpy = vi.spyOn(accountRepository, 'deleteAccount')

    const service = new AccountService(
      accountRepository,
      async function noopCleanupWorkflow() {},
      undefined,
      premiumCancellationService,
      async function persist() {},
    )

    await expect(service.deleteAccount(activeSession)).rejects.toBe(
      cancellationError,
    )
    expect(deleteAccountSpy).not.toHaveBeenCalled()
  })

  it('deleteAccount propagates AccountNotFoundError when softDeleteAccount reports missing account', async function run() {
    const cancelUpcomingInterviewsForUser = vi.fn(async function cancel(input: {
      userId: string
      persistOutboxEvent: () => Promise<void>
      softDeleteAccount?: (queryExecutor: SqlQueryExecutor) => Promise<void>
    }) {
      if (input.softDeleteAccount) {
        throw new AccountNotFoundError('Unable to delete account because it does not exist or is already deleted.')
      }
      return { outcome: 'cancelled', count: 0 }
    })
    const premiumCancellationService = {
      cancelUpcomingInterviewsForUser,
    } as unknown as PremiumCancellationService

    const accountRepository = new AccountRepository({
      dataSource: createInMemoryAccountDataSource([]),
      queryExecutor: createDeleteQueryExecutor({ didDelete: true }),
    })
    const deleteAccountSpy = vi.spyOn(accountRepository, 'deleteAccount')

    const service = new AccountService(
      accountRepository,
      async function noopCleanupWorkflow() {},
      undefined,
      premiumCancellationService,
      async function persist() {},
    )

    await expect(service.deleteAccount(activeSession)).rejects.toBeInstanceOf(
      AccountNotFoundError,
    )
    expect(deleteAccountSpy).not.toHaveBeenCalled()
  })

  it('deleteAccount softDeleteAccount passes query executor to repository deleteAccount', async function run() {
    const passedExecutors: SqlQueryExecutor[] = []
    const cancelUpcomingInterviewsForUser = vi.fn(async function cancel(input: {
      userId: string
      persistOutboxEvent: () => Promise<void>
      softDeleteAccount?: (queryExecutor: SqlQueryExecutor) => Promise<void>
    }) {
      if (input.softDeleteAccount) {
        const mockExecutor = createDeleteQueryExecutor({ didDelete: true })
        passedExecutors.push(mockExecutor)
        await input.softDeleteAccount(mockExecutor)
      }
      return { outcome: 'cancelled', count: 0 }
    })
    const premiumCancellationService = {
      cancelUpcomingInterviewsForUser,
    } as unknown as PremiumCancellationService

    const accountRepository = new AccountRepository({
      dataSource: createInMemoryAccountDataSource([]),
      queryExecutor: createDeleteQueryExecutor({ didDelete: true }),
    })
    const deleteAccountSpy = vi.spyOn(accountRepository, 'deleteAccount')

    const service = new AccountService(
      accountRepository,
      async function noopCleanupWorkflow() {},
      undefined,
      premiumCancellationService,
      async function persist() {},
    )

    const result = await service.deleteAccount(activeSession)

    expect(result).toEqual({ success: true })
    expect(deleteAccountSpy).toHaveBeenCalledTimes(1)
    expect(deleteAccountSpy).toHaveBeenCalledWith(
      activeSession.userId,
      passedExecutors[0],
    )
  })
})

function createDeleteQueryExecutor(options: { didDelete: boolean }): SqlQueryExecutor {
  return {
    async query<Row>(queryInput: SqlQuery) {
      if (queryInput.text.includes('UPDATE "user"')) {
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
