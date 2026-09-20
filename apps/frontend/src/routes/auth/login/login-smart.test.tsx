import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTHENTICATED_REDIRECT_PATH } from '#/routes/auth/shared/auth-flow'
import { LoginSmart, validateLoginForm, hasLoginErrors } from './login-smart'

const navigateMock = vi.hoisted(function createNavigateMock() {
  return vi.fn()
})

const signInEmailMock = vi.hoisted(function createSignInEmailMock() {
  return vi.fn()
})

vi.mock('@tanstack/react-router', function mockTanstackRouter() {
  return {
    Link: function Link(props: {
      children: ReactNode
      className?: string
      to: string
    }) {
      const { children, to, ...anchorProps } = props

      return (
        <a href={to} {...anchorProps}>
          {children}
        </a>
      )
    },
    useNavigate: function useNavigate() {
      return navigateMock
    },
  }
})

vi.mock('#/lib/auth-client', function mockAuthClient() {
  return {
    authClient: {
      signIn: {
        email: signInEmailMock,
      },
    },
  }
})

function renderWithQueryClient(element: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  )
}

describe('validateLoginForm', function () {
  it('returns no errors when values are valid', function () {
    const result = validateLoginForm({
      email: 'jose@example.com',
      password: 'strong-password',
    })

    expect(result).toEqual({})
    expect(hasLoginErrors(result)).toBe(false)
  })

  it('returns validation errors for missing and invalid values', function () {
    const result = validateLoginForm({
      email: 'invalid-email',
      password: '',
    })

    expect(result.email).toBe('Enter a valid email address.')
    expect(result.password).toBe('Password is required.')
    expect(hasLoginErrors(result)).toBe(true)
  })
})

describe('LoginSmart', function () {
  beforeEach(function resetMocks() {
    navigateMock.mockReset()
    signInEmailMock.mockReset()
  })

  it('renders the verified banner and signs verified users in to the dashboard', async function () {
    signInEmailMock.mockResolvedValue({ data: {} })

    renderWithQueryClient(<LoginSmart search={{ verified: true }} />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'securepass123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(function () {
      expect(signInEmailMock).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'securepass123',
        callbackURL: new URL(
          '/login?verified=true',
          window.location.origin,
        ).toString(),
      })
    })
    await waitFor(function () {
      expect(navigateMock).toHaveBeenCalledWith({ to: AUTHENTICATED_REDIRECT_PATH })
    })
    expect(screen.queryByText(/fresh verification link/i)).toBeNull()
  })

  it('maps the structured EMAIL_NOT_VERIFIED error to generic verification guidance', async function () {
    signInEmailMock.mockResolvedValue({
      error: {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'User email is not verified',
        status: 403,
      },
    })

    renderWithQueryClient(<LoginSmart search={{ verified: false }} />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'securepass123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(function () {
      expect(signInEmailMock).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'securepass123',
        callbackURL: new URL(
          '/login?verified=true',
          window.location.origin,
        ).toString(),
      })
    })

    await waitFor(function () {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /fresh verification link/i,
      )
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/check your email/i)
    expect(screen.queryByText('User email is not verified')).toBeNull()
    expect(screen.queryByText('EMAIL_NOT_VERIFIED')).toBeNull()
    expect(navigateMock).not.toHaveBeenCalledWith({
      to: AUTHENTICATED_REDIRECT_PATH,
    })
  })

  it('renders the verified callback banner as an accessible status message', function () {
    renderWithQueryClient(<LoginSmart search={{ verified: true }} />)

    expect(screen.getByRole('status')).toHaveTextContent(/verif/i)
  })

  it('renders the expired-link banner with guidance instead of the raw query value', function () {
    renderWithQueryClient(<LoginSmart search={{ error: 'TOKEN_EXPIRED' }} />)

    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent(/expired/i)
    expect(banner.textContent).not.toContain('TOKEN_EXPIRED')
  })

  it('renders the invalid-link banner with guidance instead of the raw query value', function () {
    renderWithQueryClient(<LoginSmart search={{ error: 'INVALID_TOKEN' }} />)

    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent(/invalid/i)
    expect(banner.textContent).not.toContain('INVALID_TOKEN')
  })

  it('shows only the link-error banner when verified and error are both present', function () {
    renderWithQueryClient(
      <LoginSmart search={{ verified: true, error: 'TOKEN_EXPIRED' }} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/expired/i)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('displays a form error when the auth client returns an error', async function () {
    signInEmailMock.mockResolvedValue({
      error: { message: 'Invalid credentials' },
    })

    renderWithQueryClient(<LoginSmart />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrongpass' },
    })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(function () {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('does not call auth client and shows validation errors when submitting invalid values', async function () {
    renderWithQueryClient(<LoginSmart />)

    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(function () {
      expect(signInEmailMock).not.toHaveBeenCalled()
    })

    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
  })
})
