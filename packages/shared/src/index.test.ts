import { describe, expect, it } from 'vitest'
import { createHealthResponse } from './index'

describe('shared smoke tests', function () {
  it('creates a health response payload', function () {
    const response = createHealthResponse('shared')

    expect(response.status).toBe('ok')
    expect(response.service).toBe('shared')
    expect(new Date(response.timestamp).toString()).not.toBe('Invalid Date')
  })
})
