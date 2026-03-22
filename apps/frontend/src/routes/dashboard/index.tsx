import { createFileRoute, Navigate } from '@tanstack/react-router'
import { AppShell } from '#/components/layout/app-shell'
import { useAuth } from '#/hooks/use-auth'

export const Route = createFileRoute('/dashboard/')({
  component: DashboardPage,
})

function DashboardPage() {
  const auth = useAuth()

  if (auth.isLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-16">
        <p className="text-slate-300">Loading your dashboard...</p>
      </main>
    )
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/auth/login" />
  }

  return (
    <AppShell pageTitle="Dashboard">
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold text-white">You are signed in.</h2>
        <p className="text-slate-300">
          This is the authenticated landing page for post-login and post-signup
          redirects.
        </p>
      </section>
    </AppShell>
  )
}
