import type { DeleteAccountResponse } from './types'

export class AccountDeletionUnauthorizedError extends Error {
  constructor() {
    super('You must be authenticated to delete your account.')
    this.name = 'AccountDeletionUnauthorizedError'
  }
}

export class AccountDeletionNotFoundError extends Error {
  constructor() {
    super('Unable to delete account because it does not exist or is already deleted.')
    this.name = 'AccountDeletionNotFoundError'
  }
}

export type AccountDeletionRepository = {
  deleteAccount: (userId: string) => Promise<boolean>
  invalidateSessions: (userId: string) => Promise<void>
  cancelUpcomingInterviews: (userId: string) => Promise<void>
}

export type AccountCleanupWorkflow = (userId: string) => Promise<void>

export class AccountService {
  constructor(
    private readonly accountRepository: AccountDeletionRepository,
    private readonly runAccountCleanupWorkflow: AccountCleanupWorkflow =
      async function noopCleanupWorkflow() {},
  ) {}

  async deleteAccount(
    authenticatedUserId: string | null | undefined,
  ): Promise<DeleteAccountResponse> {
    if (!authenticatedUserId) {
      throw new AccountDeletionUnauthorizedError()
    }

    const didDeleteAccount = await this.accountRepository.deleteAccount(
      authenticatedUserId,
    )

    if (!didDeleteAccount) {
      throw new AccountDeletionNotFoundError()
    }

    await Promise.all([
      this.accountRepository.invalidateSessions(authenticatedUserId),
      this.accountRepository.cancelUpcomingInterviews(authenticatedUserId),
      this.runAccountCleanupWorkflow(authenticatedUserId),
    ])

    return {
      success: true,
    }
  }
}
