import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-6 py-16">
      <p className="text-sm uppercase tracking-widest text-emerald-300">Public route</p>
      <h1 className="text-3xl font-semibold text-white">Login</h1>
      <p className="text-slate-300">
        Better Auth form integration lands in Story 4.3. This page remains outside the
        authenticated app shell.
      </p>

      <div className="flex gap-3">
        <a className="rounded-md bg-emerald-500 px-4 py-2 text-slate-950" href="/register">
          Create account
        </a>
        <a className="rounded-md border border-slate-700 px-4 py-2 text-slate-100" href="/">
          Back to landing
        </a>
      </div>
    </main>
  )
}
