import type { AccountProfileRecord } from './types'

export interface AccountRepositoryDataSource {
  getByUserId(userId: string): Promise<AccountProfileRecord | null>
  updateDisplayName(
    userId: string,
    displayName: string,
  ): Promise<AccountProfileRecord | null>
}

export class AccountRepository {
  constructor(private readonly dataSource: AccountRepositoryDataSource) {}

  async getProfile(userId: string): Promise<AccountProfileRecord | null> {
    return this.dataSource.getByUserId(userId)
  }

  async updateProfile(
    userId: string,
    displayName: string,
  ): Promise<AccountProfileRecord | null> {
    return this.dataSource.updateDisplayName(userId, displayName)
  }
}

export function createInMemoryAccountDataSource(
  seedProfiles: readonly AccountProfileRecord[],
): AccountRepositoryDataSource {
  const profileById = new Map<string, AccountProfileRecord>()

  for (const profile of seedProfiles) {
    profileById.set(profile.id, structuredClone(profile))
  }

  return {
    async getByUserId(userId: string): Promise<AccountProfileRecord | null> {
      const profile = profileById.get(userId)
      return profile ? structuredClone(profile) : null
    },
    async updateDisplayName(
      userId: string,
      displayName: string,
    ): Promise<AccountProfileRecord | null> {
      const existingProfile = profileById.get(userId)

      if (!existingProfile) {
        return null
      }

      const updatedProfile = {
        ...existingProfile,
        displayName,
      }

      profileById.set(userId, updatedProfile)
      return structuredClone(updatedProfile)
    },
  }
}
