import assert from 'node:assert/strict'
import test from 'node:test'
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

test('getAccount returns active account profile', async function run() {
  const service = createService()

  const profile = await service.getAccount(activeSession)

  assert.equal(profile.id, 'user-1')
  assert.equal(profile.email, 'candidate@mako.dev')
  assert.equal(profile.displayName, 'Candidate One')
})

test('getAccount requires authenticated session', async function run() {
  const service = createService()

  await assert.rejects(
    async function rejectUnauthorized() {
      await service.getAccount(null)
    },
    AccountUnauthorizedError,
  )
})

test('updateProfile persists display name updates', async function run() {
  const service = createService()

  const updatedProfile = await service.updateProfile(activeSession, {
    displayName: '  Updated Name  ',
  })

  assert.equal(updatedProfile.displayName, 'Updated Name')

  const refreshedProfile = await service.getAccount(activeSession)
  assert.equal(refreshedProfile.displayName, 'Updated Name')
})

test('updateProfile validates display name input', async function run() {
  const service = createService()

  await assert.rejects(
    async function rejectInvalidInput() {
      await service.updateProfile(activeSession, {
        displayName: '   ',
      })
    },
    AccountValidationError,
  )
})

test('updateProfile throws not found when account is missing', async function run() {
  const accountRepository = new AccountRepository(createInMemoryAccountDataSource([]))
  const service = new AccountService(accountRepository)

  await assert.rejects(
    async function rejectMissingAccount() {
      await service.updateProfile(activeSession, {
        displayName: 'Any Name',
      })
    },
    AccountNotFoundError,
  )
})
