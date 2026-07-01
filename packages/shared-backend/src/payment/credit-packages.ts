import type { CreditPackage } from '@mako/shared'

export const CREDIT_PACKAGES: readonly CreditPackage[] = [
  { package_id: 'credits_5', display_name: '5 Credits', amount_cents: 2500, credits_granted: 5 },
  { package_id: 'credits_10', display_name: '10 Credits', amount_cents: 4500, credits_granted: 10 },
  { package_id: 'credits_20', display_name: '20 Credits', amount_cents: 8000, credits_granted: 20 },
]

export function listCreditPackages(): CreditPackage[] {
  return CREDIT_PACKAGES.map(function clone(pkg) { return { ...pkg } })
}

export function findCreditPackage(packageId: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find(function matchId(pkg) { return pkg.package_id === packageId })
}
