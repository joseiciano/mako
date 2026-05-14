import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'

export type LoginFormValues = {
  email: string
  password: string
}

export type LoginFormErrors = {
  email?: string
  password?: string
}

type LoginDumbProps = {
  values: LoginFormValues
  errors: LoginFormErrors
  formError: string | null
  isSubmitting: boolean
  onValueChange: (field: keyof LoginFormValues, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function LoginDumb(props: LoginDumbProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl shadow-slate-950/40">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Welcome back
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Log in</h1>
        <p className="mt-2 text-sm text-slate-300">
          Continue your interview prep journey with Mako.
        </p>

        <form className="mt-8 space-y-5" onSubmit={props.onSubmit} noValidate>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-200">Email</span>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
              type="email"
              name="email"
              autoComplete="email"
              value={props.values.email}
              onChange={function onEmailChange(event) {
                props.onValueChange('email', event.currentTarget.value)
              }}
            />
            {props.errors.email ? (
              <p className="text-sm text-rose-300">{props.errors.email}</p>
            ) : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-200">Password</span>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
              type="password"
              name="password"
              autoComplete="current-password"
              value={props.values.password}
              onChange={function onPasswordChange(event) {
                props.onValueChange('password', event.currentTarget.value)
              }}
            />
            {props.errors.password ? (
              <p className="text-sm text-rose-300">{props.errors.password}</p>
            ) : null}
          </label>

          {props.formError ? (
            <p className="rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
              {props.formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={props.isSubmitting}
            className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {props.isSubmitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-300">
          New to Mako?{' '}
          <Link to="/register" className="font-semibold text-emerald-300">
            Create an account
          </Link>
          .
        </p>
      </section>
    </main>
  )
}
