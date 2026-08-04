import { describe, expect, it } from 'vitest'
import { formatCentsToUsd } from './format-currency'

describe('formatCentsToUsd', function formatCentsSuite() {
  it('formats whole dollar amounts', function run() {
    expect(formatCentsToUsd(2500)).toBe('$25.00')
  })

  it('formats non-whole dollar amounts', function run() {
    expect(formatCentsToUsd(995)).toBe('$9.95')
  })

  it('formats zero', function run() {
    expect(formatCentsToUsd(0)).toBe('$0.00')
  })

  it('falls back for non-finite values', function run() {
    expect(formatCentsToUsd(Number.NaN)).toBe('$0.00')
  })
})
