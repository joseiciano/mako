import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { accountCompaniesQueryKey } from '#/hooks/use-account'
import { interviewsQueryRootKey } from '#/hooks/use-interviews'
import { accountQueryKey } from '#/hooks/use-account'
import {
  AUTHENTICATED_REDIRECT_PATH,
  LOGGED_OUT_REDIRECT_PATH,
  AuthFlowError,
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

describe('structured auth flow errors', function () {
  it('carries Better Auth code, status, and safe message for structured errors', function () {
    let thrown: unknown

    try {
      throwIfAuthResultHasError({
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'User email is not verified',
          status: 403,
        },
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AuthFlowError)
    const authError = thrown as AuthFlowError
    expect(authError.code).toBe('EMAIL_NOT_VERIFIED')
    expect(authError.status).toBe(403)
    expect(getAuthErrorMessage(thrown)).toBe('User email is not verified')
  })

  it('keeps malformed errors on the generic safe fallback without code or status', function () {
    let thrown: unknown

    try {
      throwIfAuthResultHasError({ error: { message: '' } })
    } catch (error) {
      thrown = error
    }

    expect((thrown as AuthFlowError).code).toBeUndefined()
    expect((thrown as AuthFlowError).status).toBeUndefined()
    expect(getAuthErrorMessage(thrown)).toBe(
      'Something went wrong. Please try again.',
    )
  })
})
