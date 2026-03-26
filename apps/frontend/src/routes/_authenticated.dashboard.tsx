import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-2xl font-semibold text-white">Dashboard</h2>
      <p className="mt-3 text-slate-300">
        Welcome back. This route is protected by the authenticated layout guard.
      </p>
    </section>
  )
}
