import { createHealthResponse } from '@mako/shared'
import { formatHealthLabel } from '@mako/shared-frontend'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const frontendHealth = createHealthResponse('frontend')
  const healthLabel = formatHealthLabel(frontendHealth)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-4xl font-semibold text-white">Mako Interview Practice</h1>
      <p className="text-slate-300">
        Public pages stay shell-free, while authenticated routes are now mounted in
        a protected app-shell layout.
      </p>

      <div className="flex flex-wrap gap-3">
        <a className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950" href="/login">
          Login
        </a>
        <a
          className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100"
          href="/register"
        >
          Register
        </a>
        <a
          className="rounded-md border border-emerald-400/60 px-4 py-2 text-sm font-medium text-emerald-200"
          href="/dashboard"
        >
          Go to Dashboard
        </a>
      </div>

      <pre className="mt-2 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-emerald-200">
        {healthLabel}
      </pre>
    </main>
  )
}
