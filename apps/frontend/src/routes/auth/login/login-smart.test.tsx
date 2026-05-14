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

  it('calls auth client with email and password and navigates on success', async function () {
    signInEmailMock.mockResolvedValue({ data: {} })

    renderWithQueryClient(<LoginSmart />)

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
      })
    })

    await waitFor(function () {
      expect(navigateMock).toHaveBeenCalledWith({ to: AUTHENTICATED_REDIRECT_PATH })
    })
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
