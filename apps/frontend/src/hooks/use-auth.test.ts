import type { AuthClientSessionData } from '@mako/shared-frontend'
import { describe, expect, it, vi } from 'vitest'

const { getSessionMock } = vi.hoisted(function () {
  return {
    getSessionMock: vi.fn(),
  }
})

vi.mock('@mako/shared-frontend', async function () {
  const actual = await vi.importActual('@mako/shared-frontend')

  return {
    ...actual,
    authClient: {
      getSession: getSessionMock,
    },
  }
})

import { fetchAuthSession, getAuthState } from './use-auth'

describe('useAuth helpers', function () {
  it('maps authenticated session data into auth state', function () {
    const data = {
      session: {
        id: 'session-1',
      },
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    } as unknown as AuthClientSessionData

    expect(getAuthState(data)).toMatchObject({
      isAuthenticated: true,
      session: data?.session,
      user: data?.user,
    })
  })

  it('maps missing session data into an unauthenticated state', function () {
    expect(getAuthState(null)).toEqual({
      isAuthenticated: false,
      session: null,
      user: null,
    })
  })

  it('returns null when no session exists', async function () {
    getSessionMock.mockResolvedValueOnce({
      data: null,
      error: null,
    })

    await expect(fetchAuthSession()).resolves.toBeNull()
  })

  it('throws when the auth client returns an error', async function () {
    getSessionMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'request failed',
      },
    })

    await expect(fetchAuthSession()).rejects.toThrow('request failed')
  })
})
