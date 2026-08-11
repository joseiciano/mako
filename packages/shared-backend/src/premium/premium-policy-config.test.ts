import { describe, expect, it } from 'vitest'
import {
  defaultPremiumPolicyConfig,
  premiumSlotPriceCredits,
  resolvePremiumPolicyConfig,
} from './premium-policy-config'

describe('resolvePremiumPolicyConfig', function resolvePremiumPolicyConfigSuite() {
  it('returns defaults when no overrides are provided', function returnsDefaults() {
    expect(resolvePremiumPolicyConfig()).toEqual(defaultPremiumPolicyConfig)
    expect(resolvePremiumPolicyConfig().leadTimeMinutes).toBe(60)
    expect(resolvePremiumPolicyConfig().horizonDays).toBe(90)
  })

  it('applies partial overrides on top of the defaults', function appliesOverrides() {
    expect(resolvePremiumPolicyConfig({ leadTimeMinutes: 30 })).toEqual({
      leadTimeMinutes: 30,
      horizonDays: 90,
    })
    expect(resolvePremiumPolicyConfig({ horizonDays: 30 })).toEqual({
      leadTimeMinutes: 60,
      horizonDays: 30,
    })
    expect(
      resolvePremiumPolicyConfig({ leadTimeMinutes: 120, horizonDays: 45 }),
    ).toEqual({
      leadTimeMinutes: 120,
      horizonDays: 45,
    })
  })

  it('does not mutate the default config when overrides are applied', function noDefaultMutation() {
    resolvePremiumPolicyConfig({ leadTimeMinutes: 15 })
    expect(defaultPremiumPolicyConfig.leadTimeMinutes).toBe(60)
  })
})

describe('premiumSlotPriceCredits', function premiumSlotPriceCreditsSuite() {
  it('is exactly 1 credit per premium slot', function isOneCredit() {
    expect(premiumSlotPriceCredits).toBe(1)
  })
})
