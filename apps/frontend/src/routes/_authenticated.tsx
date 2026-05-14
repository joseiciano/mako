import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AuthGuard } from '../components/auth-guard'
import { AppShell } from '../components/layout/app-shell/app-shell-smart'
import { authSessionQueryOptions, getAuthState } from '../hooks/use-auth'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async function guardAuthenticatedRoute({ context }) {
    if (typeof window === 'undefined') {
      return
    }

    const session = await context.queryClient.fetchQuery(authSessionQueryOptions())

    if (!getAuthState(session).isAuthenticated) {
      throw redirect({
        to: '/login',
      })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <AuthGuard>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGuard>
  )
}
