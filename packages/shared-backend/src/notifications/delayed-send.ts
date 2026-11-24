export const MAX_DELAY_SECONDS = 12 * 60 * 60

export type DelayedSendOptions = {
  delaySeconds: number
}

export function remainingDelaySeconds(dueAtMs: number, nowMs: number): number {
  const remainingMs = dueAtMs - nowMs
  if (remainingMs <= 0) return 0
  return Math.min(Math.ceil(remainingMs / 1000), MAX_DELAY_SECONDS)
}
