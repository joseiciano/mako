import { describe, expect, it } from 'vitest'
import { TierPolicyService } from './tier-policy-service'
import { InsufficientCreditsError } from './types'

describe('TierPolicyService', function tierPolicyServiceSuite() {
  describe('resolveAiInterviewCreatePolicy', function aiPolicySuite() {
    it('consumes free AI quota when available and resolves standard tier', function run() {
      const service = new TierPolicyService()
      const result = service.resolveAiInterviewCreatePolicy({
        free_ai_interviews: 1,
        credits: 5,
      })

      expect(result).toEqual({
        tier: 'standard',
        consumption: 'free_ai_interview',
      })
    })

    it('consumes credit when free AI quota is exhausted and resolves premium tier', function run() {
      const service = new TierPolicyService()
      const result = service.resolveAiInterviewCreatePolicy({
        free_ai_interviews: 0,
        credits: 3,
      })

      expect(result).toEqual({
        tier: 'premium',
        consumption: 'credit',
      })
    })

    it('throws InsufficientCreditsError when both quotas are exhausted', function run() {
      const service = new TierPolicyService()

      expect(() =>
        service.resolveAiInterviewCreatePolicy({
          free_ai_interviews: 0,
          credits: 0,
        }),
      ).toThrow(InsufficientCreditsError)
    })

    it('respects injected policy config for tier mapping', function run() {
      const service = new TierPolicyService({
        freeAiInterviewTier: 'premium',
        creditAiInterviewTier: 'standard',
      })

      const freeResult = service.resolveAiInterviewCreatePolicy({
        free_ai_interviews: 2,
        credits: 0,
      })
      expect(freeResult.tier).toBe('premium')

      const creditResult = service.resolveAiInterviewCreatePolicy({
        free_ai_interviews: 0,
        credits: 1,
      })
      expect(creditResult.tier).toBe('standard')
    })
  })

  describe('resolvePeerToPeerPayments', function peerToPeerSuite() {
    it('resolves standard tier when both users have free standard quota', function run() {
      const service = new TierPolicyService()
      const result = service.resolvePeerToPeerPayments(
        { userId: 'user-a', freeStandardInterviews: 1, credits: 0 },
        { userId: 'user-b', freeStandardInterviews: 1, credits: 0 },
      )

      expect(result.tier).toBe('standard')
      expect(result.userPayments).toEqual([
        { userId: 'user-a', source: 'free_standard' },
        { userId: 'user-b', source: 'free_standard' },
      ])
    })

    it('resolves premium tier when one user pays with credit', function run() {
      const service = new TierPolicyService()
      const result = service.resolvePeerToPeerPayments(
        { userId: 'user-a', freeStandardInterviews: 0, credits: 2 },
        { userId: 'user-b', freeStandardInterviews: 1, credits: 0 },
      )

      expect(result.tier).toBe('premium')
      expect(result.userPayments).toEqual([
        { userId: 'user-a', source: 'credit' },
        { userId: 'user-b', source: 'free_standard' },
      ])
    })

    it('resolves premium tier when both users pay with credits', function run() {
      const service = new TierPolicyService()
      const result = service.resolvePeerToPeerPayments(
        { userId: 'user-a', freeStandardInterviews: 0, credits: 1 },
        { userId: 'user-b', freeStandardInterviews: 0, credits: 3 },
      )

      expect(result.tier).toBe('premium')
      expect(result.userPayments).toEqual([
        { userId: 'user-a', source: 'credit' },
        { userId: 'user-b', source: 'credit' },
      ])
    })

    it('throws InsufficientCreditsError when user A has no resources', function run() {
      const service = new TierPolicyService()

      expect(() =>
        service.resolvePeerToPeerPayments(
          { userId: 'user-a', freeStandardInterviews: 0, credits: 0 },
          { userId: 'user-b', freeStandardInterviews: 1, credits: 0 },
        ),
      ).toThrow(InsufficientCreditsError)
    })

    it('throws InsufficientCreditsError when user B has no resources', function run() {
      const service = new TierPolicyService()

      expect(() =>
        service.resolvePeerToPeerPayments(
          { userId: 'user-a', freeStandardInterviews: 1, credits: 0 },
          { userId: 'user-b', freeStandardInterviews: 0, credits: 0 },
        ),
      ).toThrow(InsufficientCreditsError)
    })

    it('throws InsufficientCreditsError when both users have no resources', function run() {
      const service = new TierPolicyService()

      expect(() =>
        service.resolvePeerToPeerPayments(
          { userId: 'user-a', freeStandardInterviews: 0, credits: 0 },
          { userId: 'user-b', freeStandardInterviews: 0, credits: 0 },
        ),
      ).toThrow(InsufficientCreditsError)
    })

    it('prefers free standard over credit for each user individually', function run() {
      const service = new TierPolicyService()
      const result = service.resolvePeerToPeerPayments(
        { userId: 'user-a', freeStandardInterviews: 2, credits: 5 },
        { userId: 'user-b', freeStandardInterviews: 0, credits: 1 },
      )

      expect(result.tier).toBe('premium')
      expect(result.userPayments).toEqual([
        { userId: 'user-a', source: 'free_standard' },
        { userId: 'user-b', source: 'credit' },
      ])
    })
  })
})
