import { describe, expect, it, vi } from 'vitest'
import {
  AccountDeletionNotFoundError,
  AccountDeletionUnauthorizedError,
  AccountService,
  type AccountDeletionRepository,
} from './account-service'

function createRepositoryMock(): AccountDeletionRepository {
  return {
    deleteAccount: vi.fn(async function deleteAccount() {
      return true
    }),
    invalidateSessions: vi.fn(async function invalidateSessions() {}),
    cancelUpcomingInterviews: vi.fn(async function cancelUpcomingInterviews() {}),
  }
}

describe('AccountService', function accountServiceSuite() {
  it('rejects unauthenticated deletions', async function testUnauthorizedDelete() {
    const repository = createRepositoryMock()
    const service = new AccountService(repository)

    await expect(service.deleteAccount(null)).rejects.toBeInstanceOf(
      AccountDeletionUnauthorizedError,
    )
  })

  it('deletes account and runs cleanup operations', async function testDeleteFlow() {
    const repository = createRepositoryMock()
    const cleanupWorkflow = vi.fn(async function cleanupWorkflow() {})
    const service = new AccountService(repository, cleanupWorkflow)

    const result = await service.deleteAccount(
      '6dc33758-c165-430f-8fc4-5388fdf9b000',
    )

    expect(result).toEqual({ success: true })
    expect(repository.deleteAccount).toHaveBeenCalledWith(
      '6dc33758-c165-430f-8fc4-5388fdf9b000',
    )
    expect(repository.invalidateSessions).toHaveBeenCalledWith(
      '6dc33758-c165-430f-8fc4-5388fdf9b000',
    )
    expect(repository.cancelUpcomingInterviews).toHaveBeenCalledWith(
      '6dc33758-c165-430f-8fc4-5388fdf9b000',
    )
    expect(cleanupWorkflow).toHaveBeenCalledWith(
      '6dc33758-c165-430f-8fc4-5388fdf9b000',
    )
  })

  it('throws not found if the account cannot be deleted', async function testNotFoundDelete() {
    const repository = createRepositoryMock()
    repository.deleteAccount = vi.fn(async function deleteAccount() {
      return false
    })

    const service = new AccountService(repository)

    await expect(
      service.deleteAccount('d3f778ec-1765-46f5-ac00-8d291c2cfdf0'),
    ).rejects.toBeInstanceOf(AccountDeletionNotFoundError)
  })
})
