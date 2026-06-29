import {
  InsufficientCreditsError,
  type InterviewPolicyConfig,
  type InterviewTier,
  type ResolvedInterviewCreatePolicy,
  type UserAccountPolicy,
  type PeerToPeerPaymentResolution,
} from './types'

const defaultPolicyConfig: InterviewPolicyConfig = {
  freeAiInterviewTier: 'standard',
  creditAiInterviewTier: 'premium',
}

export class TierPolicyService {
  constructor(
    private readonly policyConfig: InterviewPolicyConfig = defaultPolicyConfig,
  ) {}

  resolveAiInterviewCreatePolicy(
    accountPolicy: {
      free_ai_interviews: number
      credits: number
    },
  ): ResolvedInterviewCreatePolicy {
    if (accountPolicy.free_ai_interviews > 0) {
      return {
        tier: this.policyConfig.freeAiInterviewTier,
        consumption: 'free_ai_interview',
      }
    }

    if (accountPolicy.credits > 0) {
      return {
        tier: this.policyConfig.creditAiInterviewTier,
        consumption: 'credit',
      }
    }

    throw new InsufficientCreditsError()
  }

  resolvePeerToPeerPayments(
    userA: Pick<UserAccountPolicy, 'userId' | 'freeStandardInterviews' | 'credits'>,
    userB: Pick<UserAccountPolicy, 'userId' | 'freeStandardInterviews' | 'credits'>,
  ): PeerToPeerPaymentResolution {
    const paymentA = this.resolveSinglePeerToPeerPayment(userA)
    const paymentB = this.resolveSinglePeerToPeerPayment(userB)

    if (!paymentA || !paymentB) {
      throw new InsufficientCreditsError()
    }

    const tier: InterviewTier =
      paymentA.source === 'credit' || paymentB.source === 'credit'
        ? 'premium'
        : 'standard'

    return {
      tier,
      userPayments: [paymentA, paymentB],
    }
  }

  private resolveSinglePeerToPeerPayment(
    user: Pick<UserAccountPolicy, 'userId' | 'freeStandardInterviews' | 'credits'>,
  ): { userId: string; source: 'free_standard' | 'credit' } | null {
    if (user.freeStandardInterviews > 0) {
      return { userId: user.userId, source: 'free_standard' }
    }

    if (user.credits > 0) {
      return { userId: user.userId, source: 'credit' }
    }

    return null
  }
}
