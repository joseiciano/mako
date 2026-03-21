import { describe, expect, it } from 'vitest'
import { formatHealthLabel } from './index'

describe('shared-frontend smoke tests', function () {
  it('formats health labels for display', function () {
    expect(
      formatHealthLabel({
        status: 'ok',
        service: 'frontend',
        timestamp: new Date().toISOString(),
      }),
    ).toBe('frontend • ok')
  })
})
