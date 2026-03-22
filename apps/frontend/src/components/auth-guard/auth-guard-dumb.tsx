import { Navigate } from '@tanstack/react-router'
import type { AuthGuardDumbProps } from './types'

export function AuthGuardDumb(props: AuthGuardDumbProps) {
  if (props.viewState === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 py-16">
        <p className="text-sm uppercase tracking-widest text-slate-400">
          Loading session...
        </p>
      </main>
    )
  }

  if (props.viewState === 'redirect') {
    return <Navigate to="/login" replace />
  }

  return <>{props.children}</>
}
