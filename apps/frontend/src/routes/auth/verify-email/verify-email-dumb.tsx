import { Link } from '@tanstack/react-router'

const VERIFY_EMAIL_COPY =
  "Check your email. If an account is eligible, we'll send a verification link shortly. Delivery may take a few minutes. If you already have an account, you can sign in with the correct password to request a fresh link."

export function VerifyEmailDumb() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl shadow-slate-950/40">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Almost there
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Check your email
        </h1>
        <p
          role="status"
          className="mt-4 space-y-3 text-sm text-slate-300 [&_p]:mt-3"
        >
          {VERIFY_EMAIL_COPY}
        </p>
        <p className="mt-6 text-sm text-slate-300">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-emerald-300">
            Sign in
          </Link>
          .
        </p>
      </section>
    </main>
  )
}
