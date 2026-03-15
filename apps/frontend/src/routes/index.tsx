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
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm uppercase tracking-widest text-emerald-300">
        Story 1.1 scaffold
      </p>
      <h1 className="text-4xl font-semibold text-white">Mako Frontend</h1>
      <p className="text-slate-300">
        TanStack Start is configured for Cloudflare Workers and can import from
        shared workspace packages.
      </p>
      <pre className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-emerald-200">
        {healthLabel}
      </pre>
    </main>
  )
}
