import { describe, expect, it } from 'vitest'
import { MAX_DELAY_SECONDS, remainingDelaySeconds } from './delayed-send'

describe('remainingDelaySeconds', () => {
  const now = Date.parse('2026-05-22T10:00:00.000Z')

  it('returns 0 when the due time is now or past', () => {
    expect(remainingDelaySeconds(now, now)).toBe(0)
    expect(remainingDelaySeconds(now - 5000, now)).toBe(0)
  })

  it('returns the remaining seconds under the cap', () => {
    expect(remainingDelaySeconds(now + 3600_000, now)).toBe(3600)
  })

  it('rounds partial seconds up', () => {
    expect(remainingDelaySeconds(now + 1500, now)).toBe(2)
  })

  it('caps at 12 hours', () => {
    expect(remainingDelaySeconds(now + 30 * 3600_000, now)).toBe(MAX_DELAY_SECONDS)
    expect(MAX_DELAY_SECONDS).toBe(12 * 3600)
  })
})
