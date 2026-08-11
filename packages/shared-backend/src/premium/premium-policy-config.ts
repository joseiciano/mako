export type PremiumPolicyConfig = {
  leadTimeMinutes: number
  horizonDays: number
}

export const defaultPremiumPolicyConfig: PremiumPolicyConfig = {
  leadTimeMinutes: 60,
  horizonDays: 90,
}

export function resolvePremiumPolicyConfig(
  overrides?: Partial<PremiumPolicyConfig>,
): PremiumPolicyConfig {
  return { ...defaultPremiumPolicyConfig, ...overrides }
}

export const premiumSlotPriceCredits = 1

export const premiumSlotWindowMinutes = 60
