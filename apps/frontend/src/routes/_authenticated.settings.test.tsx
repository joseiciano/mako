import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import SettingsPage from './_authenticated.settings'

const useAccountMock = vi.hoisted(function createUseAccountMock() {
  return vi.fn()
})

vi.mock('#/hooks/use-account', function mockUseAccount() {
  return {
    useAccount: useAccountMock,
  }
})

vi.mock('@tanstack/react-router', function mockTanstackRouter() {
  return {
    Link: function Link(props: { to: string; children: ReactNode }) {
      return <a href={props.to}>{props.children}</a>
    },
    createFileRoute: function createFileRoute() {
      return function configRoute(config: unknown) {
        return config
      }
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

describe('SettingsPage', function suite() {
  it('shows interviewer availability link for verified interviewers', function run() {
    useAccountMock.mockReturnValue({
      data: { isVerifiedInterviewer: true },
      isLoading: false,
      isError: false,
      error: null,
    })

    renderWithQueryClient(<SettingsPage />)
    expect(screen.getByText('Interviewer Availability')).toBeTruthy()
  })

  it('hides interviewer availability link for non-verified users', function run() {
    useAccountMock.mockReturnValue({
      data: { isVerifiedInterviewer: false },
      isLoading: false,
      isError: false,
      error: null,
    })

    renderWithQueryClient(<SettingsPage />)
    expect(screen.queryByText('Interviewer Availability')).toBeNull()
  })

  it('links non-verified users to the interviewer application page', function run() {
    useAccountMock.mockReturnValue({
      data: { isVerifiedInterviewer: false },
      isSuccess: true,
      isLoading: false,
      isError: false,
      error: null,
    })

    renderWithQueryClient(<SettingsPage />)
    const link = screen.getByText('Become a verified interviewer').closest('a')
    expect(link?.getAttribute('href')).toBe('/settings/interviewer-application')
  })

  it('hides the application link for verified interviewers', function run() {
    useAccountMock.mockReturnValue({
      data: { isVerifiedInterviewer: true },
      isSuccess: true,
      isLoading: false,
      isError: false,
      error: null,
    })

    renderWithQueryClient(<SettingsPage />)
    expect(screen.queryByText('Become a verified interviewer')).toBeNull()
  })

  it('hides interviewer availability link while account is loading', function run() {
    useAccountMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    renderWithQueryClient(<SettingsPage />)
    expect(screen.queryByText('Interviewer Availability')).toBeNull()
  })
})
