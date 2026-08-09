import {
  premiumMarketplaceListQuerySchema,
  premiumMarketplaceResponseSchema,
  type PremiumMarketplaceResponse,
} from '@mako/shared'
import { createSqlQuery, type SqlQueryExecutor } from '../index'
import { PremiumMarketplaceRepository } from './premium-marketplace-repository'
import {
  defaultPremiumPolicyConfig,
  premiumSlotPriceCredits,
  type PremiumPolicyConfig,
} from './premium-policy-config'

type PremiumNowFactory = () => string

const defaultNow: PremiumNowFactory = function createNow() {
  return new Date().toISOString()
}

export class PremiumMarketplaceService {
  constructor(
    private readonly repository: PremiumMarketplaceRepository,
    private readonly policyConfig: PremiumPolicyConfig = defaultPremiumPolicyConfig,
    private readonly queryExecutor: SqlQueryExecutor,
    private readonly now: PremiumNowFactory = defaultNow,
  ) {}

  async listAvailableSlots(query: unknown): Promise<PremiumMarketplaceResponse> {
    const parsedQuery = premiumMarketplaceListQuerySchema.parse(query)

    const now = this.now()
    const earliestStartTime = new Date(
      new Date(now).getTime() + this.policyConfig.leadTimeMinutes * 60 * 1000,
    ).toISOString()
    const latestStartTime = new Date(
      new Date(now).getTime() + this.policyConfig.horizonDays * 24 * 60 * 60 * 1000,
    ).toISOString()

    const slots = await this.repository.listAvailableMarketplaceSlots(this.queryExecutor, {
      limit: parsedQuery.limit,
      offset: parsedQuery.offset,
      interviewType: parsedQuery.interviewType,
      earliestStartTime,
      latestStartTime,
    })

    const total = await this.repository.countAvailableMarketplaceSlots(this.queryExecutor, {
      interviewType: parsedQuery.interviewType,
      earliestStartTime,
      latestStartTime,
    })

    const hasMore = parsedQuery.offset + slots.length < total

    return premiumMarketplaceResponseSchema.parse({
      slots: slots.map(function mapMarketplaceSlotRow(row) {
        return {
          slotId: row.id,
          interviewType: row.interview_type,
          startTime: row.start_time,
          endTime: row.end_time,
          interviewer: {
            displayName: row.interviewer_name,
            image: row.interviewer_image,
            isVerified: true,
          },
        }
      }),
      pagination: {
        limit: parsedQuery.limit,
        offset: parsedQuery.offset,
        hasMore,
      },
      policy: {
        leadTimeMinutes: this.policyConfig.leadTimeMinutes,
        horizonDays: this.policyConfig.horizonDays,
        priceCredits: premiumSlotPriceCredits,
      },
    })
  }
}
