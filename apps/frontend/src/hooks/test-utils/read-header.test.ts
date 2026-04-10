import { describe, expect, it } from 'vitest'
import { readHeader } from './read-header'

describe('readHeader', function readHeaderSuite() {
  it('reads header names case-insensitively for object headers', function run() {
    const value = readHeader({ 'X-User-Id': 'abc-123' }, 'x-user-id')

    expect(value).toBe('abc-123')
  })

  it('reads header names case-insensitively for tuple headers', function run() {
    const value = readHeader([['X-User-Email', 'demo@mako.dev']], 'x-user-email')

    expect(value).toBe('demo@mako.dev')
  })

  it('returns null when header is not present', function run() {
    const value = readHeader({ 'x-user-id': 'abc-123' }, 'x-user-email')

    expect(value).toBeNull()
  })
})
