import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuardSmart } from './auth-guard-smart'

const { navigateMock, useAuthMock } = vi.hoisted(function createMocks() {
  return {
    navigateMock: vi.fn(),
    useAuthMock: vi.fn(),
  }
})

vi.mock('@tanstack/react-router', function mockTanstackRouter() {
  return {
    useNavigate: function useNavigate() {
      return navigateMock
    },
  }
})

vi.mock('#/hooks/use-auth', function mockUseAuth() {
  return {
    useAuth: useAuthMock,
  }
})

describe('AuthGuardSmart', function () {
  beforeEach(function resetMocks() {
    navigateMock.mockReset()
    useAuthMock.mockReset()
  })

  it('shows the loading state while the auth query is pending', function () {
    useAuthMock.mockReturnValue({
      isPending: true,
      isAuthenticated: false,
      session: null,
      user: null,
      error: null,
    })

    render(
      <AuthGuardSmart>
        <section>Private Content</section>
      </AuthGuardSmart>,
    )

    expect(screen.getByText('Checking authentication…')).toBeInTheDocument()
    expect(screen.queryByText('Private Content')).not.toBeInTheDocument()
  })

  it('renders children when the auth query resolves with a session', function () {
    useAuthMock.mockReturnValue({
      isPending: false,
      isAuthenticated: true,
      session: { id: 'session-1' },
      user: { id: 'user-1' },
      error: null,
    })

    render(
      <AuthGuardSmart>
        <section>Private Content</section>
      </AuthGuardSmart>,
    )

    expect(screen.getByText('Private Content')).toBeInTheDocument()
  })

  it('redirects to login when the auth query resolves unauthenticated', function () {
    useAuthMock.mockReturnValue({
      isPending: false,
      isAuthenticated: false,
      session: null,
      user: null,
      error: null,
    })

    render(
      <AuthGuardSmart>
        <section>Private Content</section>
      </AuthGuardSmart>,
    )

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/login',
      replace: true,
    })
    expect(screen.queryByText('Private Content')).not.toBeInTheDocument()
  })
})
