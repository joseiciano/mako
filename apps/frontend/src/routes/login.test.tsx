import { describe, expect, it, vi } from 'vitest'
import { Route } from './login'

vi.mock('@tanstack/react-router', function mockTanstackRouter() {
  return {
    createFileRoute: function createFileRoute() {
      return function configRoute(config: unknown) {
        return config
      }
    },
  }
})

vi.mock('#/lib/auth-client', function mockAuthClient() {
  return {
    authClient: {},
  }
})

type ValidateSearchFn = (search: Record<string, unknown>) => unknown

type RouteLike = {
  options?: { validateSearch?: ValidateSearchFn }
  validateSearch?: ValidateSearchFn
}

const validateSearch =
  (Route as RouteLike).options?.validateSearch ??
  (Route as RouteLike).validateSearch

function validate(search: Record<string, unknown>): unknown {
  return validateSearch?.(search)
}

describe('login validateSearch', function () {
  it('is defined on the login route', function () {
    expect(typeof validateSearch).toBe('function')
  })

  it('accepts verified=true and the two supported error codes', function () {
    expect(validate({ verified: 'true' })).toEqual({ verified: true })
    expect(validate({ verified: true })).toEqual({ verified: true })
    expect(validate({ error: 'TOKEN_EXPIRED' })).toEqual({
      error: 'TOKEN_EXPIRED',
    })
    expect(validate({ error: 'INVALID_TOKEN' })).toEqual({
      error: 'INVALID_TOKEN',
    })
    expect(validate({})).toEqual({})
  })

  it('discards arbitrary query values', function () {
    expect(validate({ verified: 'yes' })).toEqual({})
    expect(validate({ verified: '1' })).toEqual({})
    expect(validate({ verified: 'false' })).toEqual({})
    expect(validate({ error: 'FAKE_ERROR' })).toEqual({})
    expect(validate({ error: 'token_expired' })).toEqual({})
    expect(validate({ foo: 'bar' })).toEqual({})
    expect(validate({ verified: 'true', error: 'FAKE_ERROR' })).toEqual({
      verified: true,
    })
  })
})
