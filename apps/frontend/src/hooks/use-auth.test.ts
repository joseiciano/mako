import { describe, expect, it } from 'vitest'
import { getAuthState } from './use-auth'

describe('getAuthState', function () {
  it('maps authenticated payload into auth state', function () {
    const payload = {
      session: { id: 'session-1' },
      user: { id: 'user-1', email: 'user@example.com' },
    }

    expect(getAuthState(payload)).toEqual({
      isAuthenticated: true,
      session: payload.session,
      user: payload.user,
    })
  })

  it('maps missing payload into an unauthenticated state', function () {
    expect(getAuthState(null)).toEqual({
      isAuthenticated: false,
      session: null,
      user: null,
    })
  })
})
