import { describe, expect, it } from 'vitest'
import { AccountRepository, createInMemoryAccountDataSource } from './account-repository'
import { AccountService } from './account-service'
import {
  AccountNotFoundError,
  AccountUnauthorizedError,
  AccountValidationError,
  type AccountSession,
} from './types'

const activeSession: AccountSession = {
  userId: 'user-1',
  email: 'candidate@mako.dev',
}

function createService() {
  const accountRepository = new AccountRepository(
    createInMemoryAccountDataSource([
      {
        id: 'user-1',
        email: 'candidate@mako.dev',
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
    const service = createService()

    const profile = await service.getAccount(activeSession)

    expect(profile.id).toBe('user-1')
    expect(profile.email).toBe('candidate@mako.dev')
    expect(profile.displayName).toBe('Candidate One')
  })

  it('getAccount requires authenticated session', async function run() {
    const service = createService()

    await expect(
      service.getAccount(null),
    ).rejects.toBeInstanceOf(AccountUnauthorizedError)
  })

  it('updateProfile persists display name updates', async function run() {
    const service = createService()

    const updatedProfile = await service.updateProfile(activeSession, {
      displayName: '  Updated Name  ',
    })

    expect(updatedProfile.displayName).toBe('Updated Name')

    const refreshedProfile = await service.getAccount(activeSession)
    expect(refreshedProfile.displayName).toBe('Updated Name')
  })

  it('updateProfile validates display name input', async function run() {
    const service = createService()

    await expect(
      service.updateProfile(activeSession, {
        displayName: '   ',
      }),
    ).rejects.toBeInstanceOf(AccountValidationError)
  })

  it('updateProfile throws not found when account is missing', async function run() {
    const accountRepository = new AccountRepository(
      createInMemoryAccountDataSource([]),
    )
    const service = new AccountService(accountRepository)

    await expect(
      service.updateProfile(activeSession, {
        displayName: 'Any Name',
      }),
    ).rejects.toBeInstanceOf(AccountNotFoundError)
  })
})
