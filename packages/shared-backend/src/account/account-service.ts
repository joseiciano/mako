import type { AccountProfile, UpdateAccountProfileInput } from '@mako/shared'
import { employmentRecordInputSchema } from '@mako/shared'
import type { DeleteAccountResponse } from './types'
import { AccountRepository } from './account-repository'
import {
  AccountForbiddenError,
  AccountNotFoundError,
  AccountUnauthorizedError,
  authenticatedUserIdSchema,
  parseCompanyRequest,
  parseProfileUpdateInput,
  type AccountSession,
  type UserCompany,
} from './types'

export type AccountCleanupWorkflow = (userId: string) => Promise<void>

export class AccountService {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly runAccountCleanupWorkflow: AccountCleanupWorkflow =
      async function noopCleanupWorkflow() {},
  ) {}

  async getAccount(session: AccountSession | null): Promise<AccountProfile> {
    const userSession = this.requireSession(session)
    const accountProfile = await this.accountRepository.getProfile(userSession.userId)

    if (!accountProfile) {
      throw new AccountNotFoundError()
    }

    return accountProfile
  }

  async updateProfile(
    session: AccountSession | null,
    input: unknown,
  ): Promise<AccountProfile> {
    const userSession = this.requireSession(session)
    const parsedInput = parseProfileUpdateInput(input)
    const updatedAccount = await this.accountRepository.updateProfile(
      userSession.userId,
      normalizeProfileInput(parsedInput).displayName,
    )

    if (!updatedAccount) {
      throw new AccountNotFoundError()
    }

    return updatedAccount
  }

  async deleteAccount(
    session: AccountSession | null,
  ): Promise<DeleteAccountResponse> {
    const userSession = this.requireSession(session)
    const didDeleteAccount = await this.accountRepository.deleteAccount(
      userSession.userId,
    )

    if (!didDeleteAccount) {
      throw new AccountNotFoundError(
        'Unable to delete account because it does not exist or is already deleted.',
      )
    }

    await Promise.all([
      this.accountRepository.invalidateSessions(userSession.userId),
      this.accountRepository.cancelUpcomingInterviews(userSession.userId),
      this.runAccountCleanupWorkflow(userSession.userId),
    ])

    return {
      success: true,
    }
  }

  async getCompaniesByUserId(session: AccountSession | null): Promise<UserCompany[]> {
    const userSession = this.requireSession(session)
    const userId = authenticatedUserIdSchema.parse(userSession.userId)
    const isActive = await this.accountRepository.isUserActive(userId)
    if (!isActive) throw new AccountForbiddenError()
    return this.accountRepository.getCompaniesByUserId(userId)
  }

  async addCompanyRecord(
    session: AccountSession | null,
    requestBody: unknown,
  ): Promise<UserCompany> {
    const userSession = this.requireSession(session)
    const userId = authenticatedUserIdSchema.parse(userSession.userId)
    const isActive = await this.accountRepository.isUserActive(userId)
    if (!isActive) throw new AccountForbiddenError()

    // Parse as either canonical or legacy (not mixed)
    const parsed = parseCompanyRequest(requestBody)

    if (parsed.kind === 'canonical') {
      return this.accountRepository.addCompanyRecord({
        userId,
        company: parsed.data.company,
        role: parsed.data.role,
        joined: canonicalStartDateToTimestamp(parsed.data.start),
        endedAt: parsed.data.end
          ? canonicalEndDateToTimestamp(parsed.data.end)
          : null,
      })
    }

    // Legacy: role = null, joined from payload
    return this.accountRepository.addCompanyRecord({
      userId,
      company: parsed.data.company,
      role: null,
      joined: parsed.data.joined,
      endedAt: null,
    })
  }

  async updateCompanyRecord(
    session: AccountSession | null,
    recordId: string,
    requestBody: unknown,
  ): Promise<UserCompany> {
    const userSession = this.requireSession(session)
    const userId = authenticatedUserIdSchema.parse(userSession.userId)
    const isActive = await this.accountRepository.isUserActive(userId)
    if (!isActive) throw new AccountForbiddenError()

    const parsed = employmentRecordInputSchema.parse(requestBody)

    const updated = await this.accountRepository.updateCompanyRecord({
      id: recordId,
      userId,
      company: parsed.company,
      role: parsed.role,
      joined: canonicalStartDateToTimestamp(parsed.start),
      endedAt: parsed.end ? canonicalEndDateToTimestamp(parsed.end) : null,
    })

    if (!updated) throw new AccountNotFoundError('Employment record not found.')
    return updated
  }

  async deleteCompanyRecord(
    session: AccountSession | null,
    recordId: string,
  ): Promise<{ success: true }> {
    const userSession = this.requireSession(session)
    const userId = authenticatedUserIdSchema.parse(userSession.userId)
    const isActive = await this.accountRepository.isUserActive(userId)
    if (!isActive) throw new AccountForbiddenError()

    const deleted = await this.accountRepository.softDeleteCompanyRecord({
      id: recordId,
      userId,
    })

    if (!deleted) throw new AccountNotFoundError('Employment record not found.')
    return { success: true }
  }

  private requireSession(session: AccountSession | null): AccountSession {
    if (!session) {
      throw new AccountUnauthorizedError()
    }

    return session
  }
}

function normalizeProfileInput(
  input: UpdateAccountProfileInput,
): UpdateAccountProfileInput {
  return {
    displayName: input.displayName.trim(),
  }
}

function canonicalStartDateToTimestamp(start: string): string {
  return new Date(start + 'T00:00:00.000Z').toISOString()
}

function canonicalEndDateToTimestamp(end: string): string {
  return new Date(end + 'T00:00:00.000Z').toISOString()
}
