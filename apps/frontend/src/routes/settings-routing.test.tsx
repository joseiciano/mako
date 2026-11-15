import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { routeTree } from '../routeTree.gen'

const authState = { isAuthenticated: true }

vi.mock('../hooks/use-auth', function mockUseAuth() {
  return {
    authSessionQueryOptions: function authSessionQueryOptions() {
      return {
        queryKey: ['auth', 'session'],
        queryFn: async function getSession() {
          return { session: { id: 's' }, user: { id: 'u' } }
        },
      }
    },
    getAuthState: function getAuthState() {
      return { isAuthenticated: authState.isAuthenticated }
    },
  }
})

vi.mock('../components/auth-guard', function mockAuthGuard() {
  return {
    AuthGuard: function AuthGuard(props: { children: ReactNode }) {
      return <>{props.children}</>
    },
  }
})

vi.mock('../components/layout/app-shell/app-shell-smart', function mockShell() {
  return {
    AppShell: function AppShell(props: { children: ReactNode }) {
      return <>{props.children}</>
    },
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('settings routing', function suite() {
  afterEach(function teardown() {
    authState.isAuthenticated = true
    vi.unstubAllGlobals()
  })

  it('renders the interviewer application page at /settings/interviewer-application', async function run() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async function impl(input: RequestInfo | URL) {
        const url = String(input)
        if (url.includes('/api/interviewer/status')) return json({ application: null })
        if (url.includes('/api/companies')) return json({ companies: [] })
        return json({ error: 'not found' }, 404)
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: ['/settings/interviewer-application'] }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Become a verified interviewer' }),
    ).toBeTruthy()
  })

  it('redirects an unauthenticated user from /settings/interviewer-application to /login', async function run() {
    authState.isAuthenticated = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async function impl() {
        return json({ error: 'not found' }, 404)
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: ['/settings/interviewer-application'] }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await waitFor(function redirected() {
      expect(router.state.location.pathname).toBe('/login')
    })
    expect(screen.queryByRole('heading', { name: 'Become a verified interviewer' })).toBeNull()
  })
})
