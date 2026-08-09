import type { AccountProfile, UpdateAccountProfileInput } from '@mako/shared'
import { employmentRecordInputSchema } from '@mako/shared'
import type { PremiumCancellationService } from '../premium'
import type { SqlQueryExecutor } from '../index'
import type { DeleteAccountResponse } from './types'
import { AccountRepository } from './account-repository'
import {
  AccountForbiddenError,
  AccountNotFoundError,
  AccountUnauthorizedError,
  authenticatedUserIdSchema,
  parseCompanyRequest,
  parseProfileUpdateInput,
  type AccountServiceLogger,
  type AccountSession,
  type UserCompany,
} from './types'

export type AccountCleanupWorkflow = (userId: string) => Promise<void>

const noOpLogger: AccountServiceLogger = {
  info: function noOpInfo() {},
  error: function noOpError() {},
}

export class AccountService {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly runAccountCleanupWorkflow: AccountCleanupWorkflow =
      async function noopCleanupWorkflow() {},
    private readonly logger: AccountServiceLogger = noOpLogger,
    private readonly premiumCancellationService?: PremiumCancellationService,
    private readonly persistOutboxEvent?: (
      event: unknown,
      queryExecutor: SqlQueryExecutor,
    ) => Promise<void>,
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

    // All-or-nothing: when the premium cancellation service is configured, the
    // cancellation + refund + outbox work and the account soft-delete run in
    // one transaction, so any failure aborts before any of it is committed.
    // The account stays active if any affected interview cannot be cleanly
    // cancelled or refunded.
    if (this.premiumCancellationService) {
      const persistOutboxEvent = this.persistOutboxEvent

      await this.premiumCancellationService.cancelUpcomingInterviewsForUser({
        userId: userSession.userId,
        persistOutboxEvent: persistOutboxEvent
          ? persistOutboxEvent
          : async function noOutboxEventPersistence(): Promise<never> {
              throw new Error(
                'Outbox event persistence is not configured for account cancellation.',
              )
            },
        softDeleteAccount: async (queryExecutor) => {
          const didDeleteAccount = await this.accountRepository.deleteAccount(
            userSession.userId,
            queryExecutor,
          )

          if (!didDeleteAccount) {
            throw new AccountNotFoundError(
              'Unable to delete account because it does not exist or is already deleted.',
            )
          }
        },
      })

      // The premium cancellation transaction already handled every upcoming
      // interview and the soft-delete, so the repository's direct bulk update
      // is skipped.
      await Promise.all([
        this.accountRepository.invalidateSessions(userSession.userId),
        this.runAccountCleanupWorkflow(userSession.userId),
      ])
    } else {
      // Demo mode fallback: no premium cancellation service, so the
      // repository's direct bulk update remains the cancellation path.
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
    }

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
    this.logger.info('company.legacy_create_deprecated', { userId })

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
