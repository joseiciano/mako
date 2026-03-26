import { describe, expect, it } from 'vitest'
import { shouldRedirectToLogin } from './app-shell-smart'

describe('app-shell auth guard helpers', function () {
  it('redirects authenticated routes with no active session', function () {
    expect(
      shouldRedirectToLogin({
        session: null,
        isSessionPending: false,
      }),
    ).toBe(true)
  })

  it('does not redirect while session is still resolving', function () {
    expect(
      shouldRedirectToLogin({
        session: null,
        isSessionPending: true,
      }),
    ).toBe(false)
  })

  it('does not redirect when a session exists', function () {
    expect(
      shouldRedirectToLogin({
        session: { id: 'active-session' },
        isSessionPending: false,
      }),
    ).toBe(false)
  })
})
