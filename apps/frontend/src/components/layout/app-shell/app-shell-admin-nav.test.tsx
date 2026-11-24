import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShellSmart } from './app-shell-smart'

const authUser = vi.hoisted(function createAuthUser() {
  return { current: { id: 'user-1', name: 'Alex', email: 'a@example.com', isAdmin: false } }
})

vi.mock('@tanstack/react-query', function mockReactQuery() {
  return {
    useMutation: function useMutation() {
      return { isPending: false, error: null, mutate: vi.fn() }
    },
    useQueryClient: function useQueryClient() {
      return { setQueryData: vi.fn() }
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
        user: authUser.current,
        error: null,
      }
    },
  }
})

vi.mock('#/lib/auth-client', function mockAuthClient() {
  return { authClient: { signOut: vi.fn() } }
})

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1
}

describe('app shell admin navigation', function suite() {
  beforeEach(function reset() {
    authUser.current = { id: 'user-1', name: 'Alex', email: 'a@example.com', isAdmin: false }
  })

  // The mobile drawer only renders its items while open, so server rendering
  // exercises the sidebar; both receive the same `navigationItems` list.
  it('shows the admin entry in the navigation for admins', function run() {
    authUser.current = { ...authUser.current, isAdmin: true }
    const html = renderToString(
      <AppShellSmart>
        <p>content</p>
      </AppShellSmart>,
    )

    expect(countOccurrences(html, 'href="/admin/reviews"')).toBeGreaterThanOrEqual(1)
  })

  it('hides the admin route for non-admins', function run() {
    const html = renderToString(
      <AppShellSmart>
        <p>content</p>
      </AppShellSmart>,
    )

    expect(html).not.toContain('/admin/reviews')
  })
})
