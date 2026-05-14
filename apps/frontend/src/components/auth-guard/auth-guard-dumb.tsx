import type { ReactNode } from 'react'

export type AuthGuardDumbProps = {
  children: ReactNode
  error?: unknown
  isAuthenticated: boolean
  isPending: boolean
}

export function AuthGuardDumb(props: AuthGuardDumbProps) {
  if (props.isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
        <p aria-live="polite" role="status" className="text-slate-300">
          Checking authentication…
        </p>
      </main>
    )
  }

  if (props.error != null) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
        <p role="alert" className="text-rose-200">
          Unable to verify your session. Please try again.
        </p>
      </main>
    )
  }

  if (!props.isAuthenticated) {
    return null
  }

  return <>{props.children}</>
}
