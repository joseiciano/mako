import { describe, expect, it, vi } from 'vitest'
import {
  AUTHENTICATED_REDIRECT_PATH,
  LOGGED_OUT_REDIRECT_PATH,
  getAuthErrorMessage,
  handleAuthSuccess,
  handleSignOutSuccess,
} from './auth-flow'

describe('auth flow helpers', function () {
  it('invalidates auth session and redirects after successful auth', async function () {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const navigate = vi.fn().mockResolvedValue(undefined)

    await handleAuthSuccess({ invalidateQueries }, navigate)

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['auth', 'session'],
    })
    expect(navigate).toHaveBeenCalledWith(AUTHENTICATED_REDIRECT_PATH)
  })

  it('clears auth session and redirects after successful sign out', async function () {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const setQueryData = vi.fn()
    const navigate = vi.fn().mockResolvedValue(undefined)

    await handleSignOutSuccess({ invalidateQueries, setQueryData }, navigate)

    expect(setQueryData).toHaveBeenCalledWith(['auth', 'session'], null)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['auth', 'session'],
    })
    expect(navigate).toHaveBeenCalledWith(LOGGED_OUT_REDIRECT_PATH)
  })

  it('normalizes unknown auth errors into a safe message', function () {
    expect(getAuthErrorMessage(new Error('Nope'))).toBe('Nope')
    expect(getAuthErrorMessage({})).toBe(
      'Something went wrong. Please try again.',
    )
  })
})
