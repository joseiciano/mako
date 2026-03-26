import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-6 py-16">
      <p className="text-sm uppercase tracking-widest text-emerald-300">Public route</p>
      <h1 className="text-3xl font-semibold text-white">Create account</h1>
      <p className="text-slate-300">
        Registration UI will connect to Better Auth in Story 4.3.
      </p>

      <div className="flex gap-3">
        <a className="rounded-md bg-emerald-500 px-4 py-2 text-slate-950" href="/login">
          Already have an account
        </a>
        <a className="rounded-md border border-slate-700 px-4 py-2 text-slate-100" href="/">
          Back to landing
        </a>
      </div>
    </main>
  )
}
