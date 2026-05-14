import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppShellSmart } from './app-shell-smart'

vi.mock('@tanstack/react-query', function mockReactQuery() {
  return {
    useMutation: function useMutation() {
      return {
        isPending: false,
        error: null,
        mutate: vi.fn(),
      }
    },
    useQueryClient: function useQueryClient() {
      return {
        setQueryData: vi.fn(),
      }
    },
  }
})

vi.mock('@tanstack/react-router', function mockTanstackRouter() {
  return {
    useNavigate: function useNavigate() {
      return vi.fn()
    },
    useRouterState: function useRouterState() {
      return '/dashboard'
    },
  }
})

vi.mock('#/hooks/use-auth', function mockUseAuth() {
  return {
    useAuth: function useAuth() {
      return {
        isPending: false,
        isAuthenticated: true,
        session: { id: 'session-1' },
        user: null,
        error: null,
      }
    },
  }
})

vi.mock('#/lib/auth-client', function mockAuthClient() {
  return {
    authClient: {
      signOut: vi.fn(),
    },
  }
})

describe('app-shell-smart', function () {
  it('renders desktop sidebar, header controls, and content', function () {
    const html = renderToString(
      <AppShellSmart>
        <p>Shell content</p>
      </AppShellSmart>,
    )

    expect(html).toContain('Desktop navigation')
    expect(html).toContain('aria-label="Open navigation menu"')
    expect(html).toContain('aria-controls="mobile-navigation-drawer"')
    expect(html).toContain('Mako User')
    expect(html).toContain('Shell content')
    expect(html).toContain('href="/dashboard"')
    expect(html).toContain('href="/interviews"')
    expect(html).toContain('href="/billing"')
    expect(html).toContain('href="/settings"')
  })
})
