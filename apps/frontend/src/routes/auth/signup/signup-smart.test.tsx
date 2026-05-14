import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTHENTICATED_REDIRECT_PATH } from '#/routes/auth/shared/auth-flow'
import { SignupSmart, validateSignupForm, hasSignupErrors } from './signup-smart'

const navigateMock = vi.hoisted(function createNavigateMock() {
  return vi.fn()
})

const signUpEmailMock = vi.hoisted(function createSignUpEmailMock() {
  return vi.fn()
})

vi.mock('@tanstack/react-router', function mockTanstackRouter() {
  return {
    useNavigate: function useNavigate() {
      return navigateMock
    },
  }
})

vi.mock('#/lib/auth-client', function mockAuthClient() {
  return {
    authClient: {
      signUp: {
        email: signUpEmailMock,
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

describe('validateSignupForm', function () {
  it('returns no errors when values are valid', function () {
    const result = validateSignupForm({
      name: 'Jose',
      email: 'jose@example.com',
      password: 'password123',
    })

    expect(result).toEqual({})
    expect(hasSignupErrors(result)).toBe(false)
  })

  it('returns validation errors for invalid values', function () {
    const result = validateSignupForm({
      name: 'J',
      email: 'jose-at-example.com',
      password: '123',
    })

    expect(result.name).toBe('Name must be at least 2 characters.')
    expect(result.email).toBe('Enter a valid email address.')
    expect(result.password).toBe('Password must be at least 8 characters.')
    expect(hasSignupErrors(result)).toBe(true)
  })
})

describe('SignupSmart', function () {
  beforeEach(function resetMocks() {
    navigateMock.mockReset()
    signUpEmailMock.mockReset()
  })

  it('calls auth client with name, email, and password and navigates on success', async function () {
    signUpEmailMock.mockResolvedValue({ data: {} })

    renderWithQueryClient(<SignupSmart />)

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Jose User' },
    })
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jose@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(function () {
      expect(signUpEmailMock).toHaveBeenCalledWith({
        name: 'Jose User',
        email: 'jose@example.com',
        password: 'password123',
      })
    })

    await waitFor(function () {
      expect(navigateMock).toHaveBeenCalledWith({ to: AUTHENTICATED_REDIRECT_PATH })
    })
  })

  it('displays a form error when the auth client returns an error', async function () {
    signUpEmailMock.mockResolvedValue({
      error: { message: 'Email already in use' },
    })

    renderWithQueryClient(<SignupSmart />)

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Jose User' },
    })
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jose@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(function () {
      expect(screen.getByText('Email already in use')).toBeInTheDocument()
    })
  })

  it('does not call auth client and shows validation errors when submitting invalid values', async function () {
    renderWithQueryClient(<SignupSmart />)

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'J' },
    })
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'invalid-email' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: '123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(function () {
      expect(signUpEmailMock).not.toHaveBeenCalled()
    })

    expect(screen.getByText('Name must be at least 2 characters.')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
  })
})
