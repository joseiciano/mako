import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { accountCompaniesQueryKey } from '#/hooks/use-account'
import { interviewsQueryRootKey } from '#/hooks/use-interviews'
import { accountQueryKey } from '#/hooks/use-account'
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
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    await handleAuthSuccess(queryClient, navigate)

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['auth', 'session'],
    })
    expect(navigate).toHaveBeenCalledWith(AUTHENTICATED_REDIRECT_PATH)
  })

  it('clears auth session cache and redirects after successful sign out', async function () {
    const navigate = vi.fn().mockResolvedValue(undefined)
    const queryClient = new QueryClient()
    const setQueryData = vi.spyOn(queryClient, 'setQueryData')
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries')
    const removeQueries = vi.spyOn(queryClient, 'removeQueries')

    await handleSignOutSuccess(queryClient, navigate)

    expect(setQueryData).toHaveBeenCalledWith(['auth', 'session'], null)
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: accountQueryKey })
    expect(cancelQueries).toHaveBeenCalledWith({
      queryKey: accountCompaniesQueryKey,
    })
    expect(cancelQueries).toHaveBeenCalledWith({
      queryKey: interviewsQueryRootKey,
    })
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: accountQueryKey })
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: accountCompaniesQueryKey,
    })
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: interviewsQueryRootKey,
    })
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
