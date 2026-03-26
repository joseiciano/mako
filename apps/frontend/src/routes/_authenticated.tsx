import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '../components/layout/app-shell/app-shell-smart'
import { authClient } from '../lib/auth-client'

type SessionPayload = {
  session: unknown
}

async function hasActiveSession(): Promise<boolean> {
  const { data } = await authClient.getSession()
  const payload = data as SessionPayload | null | undefined

  return payload?.session != null
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async function guardAuthenticatedRoute() {
    if (typeof window === 'undefined') {
      return
    }

    const activeSession = await hasActiveSession()

    if (!activeSession) {
      throw redirect({
        to: '/login',
      })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
