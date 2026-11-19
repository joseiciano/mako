import { describe, expect, it } from 'vitest'
import { assertLocalDatabaseUrl } from './database-guard.mjs'

describe('assertLocalDatabaseUrl', () => {
  it.each([
    'postgres://postgres:postgres@localhost:54332/mako_local',
    'postgresql://postgres:postgres@127.0.0.1:54332/mako_local',
    'postgres://postgres:postgres@[::1]:54332/mako_local',
    'postgres://postgres:postgres@postgres:5432/mako_local?sslmode=disable',
    'postgres://postgres:postgres@POSTGRES:5432/mako_local',
  ])('accepts %s', function accepts(url) {
    expect(assertLocalDatabaseUrl(url)).toBe(url)
  })

  it.each([
    'postgres://u:p@postgres.example.com:5432/db',
    'postgres://u:p@localhost.evil.com:5432/db',
    'postgres://u:p@evil.com/db?host=localhost',
    'postgres://localhost:x@evil.com:5432/db',
    'postgres://u:p@postgres-prod:5432/db',
    'postgres://u:p@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require',
    'postgres://u:p@localhost/db?host=prod.neon.tech',
    'postgres://u:p@postgres/db?hostaddr=1.2.3.4',
    'postgres://u:p@postgres/db?host=%2Fvar%2Frun',
    'postgres://u:p@localhost/db?service=prod',
    'postgres://u:p@localhost/db?sslmode=disable&host=prod.neon.tech',
    'postgres://u:p@10.0.0.5:5432/db',
    'postgres://u:p@0.0.0.0:5432/db',
    'http://localhost:5432/db',
    'not a url',
    '',
    undefined,
  ])('rejects %s', function rejects(url) {
    expect(function check() {
      assertLocalDatabaseUrl(url)
    }).toThrow(/Refusing/)
  })
})
