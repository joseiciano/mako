import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authSessionQueryKey,
  authSessionQueryOptions,
  fetchAuthSession,
  getAuthState,
  useAuth,
} from './use-auth'

const { getSessionMock } = vi.hoisted(function createMocks() {
  return {
    getSessionMock: vi.fn(),
  }
})

vi.mock('../lib/auth-client', function mockAuthClient() {
  return {
    authClient: {
      getSession: getSessionMock,
    },
  }
})

function TestHarness() {
  const auth = useAuth()

  return (
    <div>
      <span data-testid="is-pending">{String(auth.isPending)}</span>
      <span data-testid="is-authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="user-id">
        {typeof auth.user === 'object' && auth.user !== null && 'id' in auth.user
          ? String(auth.user.id)
          : 'none'}
      </span>
    </div>
  )
}

describe('getAuthState', function () {
  it('maps authenticated payload into auth state', function () {
    const payload = {
      session: { id: 'session-1' },
      user: { id: 'user-1', email: 'user@example.com' },
    } as unknown as NonNullable<Parameters<typeof getAuthState>[0]>

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

describe('auth session query', function () {
  beforeEach(function resetMocks() {
    getSessionMock.mockReset()
  })

  it('exports the shared auth session query key', function () {
    expect(authSessionQueryKey).toEqual(['auth', 'session'])
  })

  it('fetches auth session data through the auth client', async function () {
    const sessionPayload = {
      session: { id: 'session-1' },
      user: { id: 'user-1' },
    }
    getSessionMock.mockResolvedValue({ data: sessionPayload })

    await expect(fetchAuthSession()).resolves.toEqual(sessionPayload)
    expect(getSessionMock).toHaveBeenCalledTimes(1)
  })

  it('builds tanstack query options for the auth session query', async function () {
    const sessionPayload = {
      session: { id: 'session-2' },
      user: { id: 'user-2' },
    }
    getSessionMock.mockResolvedValue({ data: sessionPayload })

    const options = authSessionQueryOptions()

    expect(options.queryKey).toEqual(authSessionQueryKey)
    expect(options.staleTime).toBeGreaterThan(0)
    expect(options.refetchOnWindowFocus).toBe(false)
    await expect(options.queryFn()).resolves.toEqual(sessionPayload)
  })

  it('reads auth state through tanstack query', async function () {
    getSessionMock.mockResolvedValue({
      data: {
        session: { id: 'session-3' },
        user: { id: 'user-3' },
      },
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <TestHarness />
      </QueryClientProvider>,
    )

    await waitFor(function () {
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true')
    })

    expect(screen.getByTestId('is-pending')).toHaveTextContent('false')
    expect(screen.getByTestId('user-id')).toHaveTextContent('user-3')
    expect(getSessionMock).toHaveBeenCalledTimes(1)
  })
})
