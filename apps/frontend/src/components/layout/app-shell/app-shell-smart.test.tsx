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
    Link: function Link(props: { to: string; children: unknown }) {
      return <a href={props.to}>{props.children as never}</a>
    },
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
        user: {
          id: 'user-1',
          name: 'Alex Candidate',
          email: 'alex@example.com',
        },
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
  it('renders sidebar navigation, sign out control, and content', function () {
    const html = renderToString(
      <AppShellSmart>
        <p>Shell content</p>
      </AppShellSmart>,
    )

    expect(html).toContain('aria-label="Primary"')
    expect(html).toContain('Sign out')
    expect(html).toContain('Alex Candidate')
    expect(html).toContain('Shell content')
    expect(html).toContain('href="/dashboard"')
    expect(html).toContain('href="/interviews"')
    expect(html).toContain('href="/billing"')
    expect(html).toContain('href="/settings"')
  })
})
