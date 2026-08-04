export function formatCentsToUsd(amountCents: number): string {
  if (!Number.isFinite(amountCents)) {
    return '$0.00'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountCents / 100)
}
