import { describe, expect, it } from 'vitest'
import { resolveAuthGuardViewState } from './auth-guard-smart'

describe('resolveAuthGuardViewState', function () {
  it('allows public routes without authentication', function () {
    expect(
      resolveAuthGuardViewState({
        pathname: '/login',
        isLoading: false,
        isAuthenticated: false,
      }),
    ).toBe('content')
  })

  it('returns loading when a protected route auth state is pending', function () {
    expect(
      resolveAuthGuardViewState({
        pathname: '/',
        isLoading: true,
        isAuthenticated: false,
      }),
    ).toBe('loading')
  })

  it('returns redirect when unauthenticated on protected routes', function () {
    expect(
      resolveAuthGuardViewState({
        pathname: '/',
        isLoading: false,
        isAuthenticated: false,
      }),
    ).toBe('redirect')
  })

  it('renders protected content when authenticated', function () {
    expect(
      resolveAuthGuardViewState({
        pathname: '/',
        isLoading: false,
        isAuthenticated: true,
      }),
    ).toBe('content')
  })
})
