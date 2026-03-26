import { describe, expect, it, vi } from 'vitest'
import {
  AUTHENTICATED_REDIRECT_PATH,
  LOGGED_OUT_REDIRECT_PATH,
  getAuthErrorMessage,
  handleAuthSuccess,
  handleSignOutSuccess,
  throwIfAuthResultHasError,
} from './auth-flow'

describe('auth flow helpers', function () {
  it('invalidates auth session and redirects after successful auth', async function () {
    const navigate = vi.fn().mockResolvedValue(undefined)

    await handleAuthSuccess(navigate)

    expect(navigate).toHaveBeenCalledWith(AUTHENTICATED_REDIRECT_PATH)
  })

  it('redirects after successful sign out', async function () {
    const navigate = vi.fn().mockResolvedValue(undefined)

    await handleSignOutSuccess(navigate)

    expect(navigate).toHaveBeenCalledWith(LOGGED_OUT_REDIRECT_PATH)
  })

  it('throws when auth client returns an error result', function () {
    expect(function throwAuthError() {
      throwIfAuthResultHasError({
        error: {
          message: 'Invalid credentials',
        },
      })
    }).toThrow('Invalid credentials')
  })

  it('does not throw when auth client returns a success result', function () {
    expect(function passSuccessfulResult() {
      throwIfAuthResultHasError({ error: null })
    }).not.toThrow()
  })

  it('normalizes unknown auth errors into a safe message', function () {
    expect(getAuthErrorMessage(new Error('Nope'))).toBe('Nope')
    expect(getAuthErrorMessage({})).toBe(
      'Something went wrong. Please try again.',
    )
  })
})
