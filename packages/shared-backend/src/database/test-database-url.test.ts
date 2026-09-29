import { describe, expect, it } from 'vitest'
import { resolveLocalTestDatabaseUrl } from './test-database-url'

describe('resolveLocalTestDatabaseUrl', function resolveLocalTestDatabaseUrlSuite() {
  it.each([
    'postgres://postgres:postgres@localhost:54329/mako_test',
    'postgres://postgres:postgres@127.0.0.1:54329/mako_test',
  ])('accepts local _test URL %s', function acceptsLocalTestUrl(databaseUrl) {
    expect(resolveLocalTestDatabaseUrl(databaseUrl)).toBe(databaseUrl)
  })

  it.each([
    undefined,
    'postgres://postgres:postgres@db.example:5432/mako_test',
    'postgres://postgres:postgres@localhost:54329/mako',
    'postgres://postgres:postgres@localhost:54329/mako_test?sslmode=disable',
    'postgres://postgres:postgres@localhost:54329/mako_test?host=remote.example',
  ])('rejects unsafe test URL %s', function rejectsUnsafeTestUrl(databaseUrl) {
    expect(() => resolveLocalTestDatabaseUrl(databaseUrl)).toThrow()
  })
})
