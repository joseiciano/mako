import { describe, expect, it } from 'vitest'
import { parseUserRow, toBackendHealth } from './index'

describe('shared-backend smoke tests', function () {
  it('creates backend health payloads', function () {
    expect(toBackendHealth('shared-backend')).toMatchObject({
      status: 'ok',
      service: 'shared-backend',
    })
  })

  it('parses a user database row', function () {
    const parsedRow = parseUserRow({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      name: 'Test User',
      credits: 3,
      free_standard_interviews: 1,
      free_ai_interviews: 2,
      companies: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
    })

    expect(parsedRow.email).toBe('user@example.com')
    expect(parsedRow.credits).toBe(3)
  })
})
