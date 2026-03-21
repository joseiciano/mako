import {
  addCompanyRequestSchema,
  authenticatedUserIdSchema,
  type UserCompany,
} from './types'
import { type AccountRepositoryPort } from './account-repository'

export class AccountService {
  constructor(private readonly accountRepository: AccountRepositoryPort) {}

  async getCompaniesByUserId(authenticatedUserId: string): Promise<UserCompany[]> {
    const userId = authenticatedUserIdSchema.parse(authenticatedUserId)
    return this.accountRepository.getCompaniesByUserId(userId)
  }

  async addCompanyRecord(
    authenticatedUserId: string,
    requestBody: unknown,
  ): Promise<UserCompany> {
    const userId = authenticatedUserIdSchema.parse(authenticatedUserId)
    const payload = addCompanyRequestSchema.parse(requestBody)

    return this.accountRepository.addCompanyRecord({
      userId,
      company: payload.company,
      joined: payload.joined,
    })
  }
}
