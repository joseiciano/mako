import type { AccountProfile, UpdateAccountProfileInput } from '@mako/shared'
import { AccountRepository } from './account-repository'
import {
  AccountNotFoundError,
  AccountUnauthorizedError,
  addCompanyRequestSchema,
  authenticatedUserIdSchema,
  parseProfileUpdateInput,
  type AccountSession,
  type UserCompany,
} from './types'

export class AccountService {
  constructor(private readonly accountRepository: AccountRepository) {}

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

  async getCompaniesByUserId(session: AccountSession | null): Promise<UserCompany[]> {
    const userSession = this.requireSession(session)
    const userId = authenticatedUserIdSchema.parse(userSession.userId)
    return this.accountRepository.getCompaniesByUserId(userId)
  }

  async addCompanyRecord(
    session: AccountSession | null,
    requestBody: unknown,
  ): Promise<UserCompany> {
    const userSession = this.requireSession(session)
    const userId = authenticatedUserIdSchema.parse(userSession.userId)
    const payload = addCompanyRequestSchema.parse(requestBody)

    return this.accountRepository.addCompanyRecord({
      userId,
      company: payload.company,
      joined: payload.joined,
    })
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
