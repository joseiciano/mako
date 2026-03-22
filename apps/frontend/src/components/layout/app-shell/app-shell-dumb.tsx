import type { ReactNode } from 'react'

type AppShellDumbProps = {
  pageTitle: string
  userName: string
  isSigningOut: boolean
  onSignOut: () => void
  children: ReactNode
}

export function AppShellDumb(props: AppShellDumbProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
              Application Shell
            </p>
            <h1 className="text-2xl font-semibold text-white">{props.pageTitle}</h1>
          </div>

          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-600">
              {props.userName}
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl shadow-slate-950/60">
              <p className="rounded-md px-3 py-2 text-sm text-slate-300">
                Signed in as <strong>{props.userName}</strong>
              </p>
              <a
                href="/dashboard"
                className="mt-1 block rounded-md px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Dashboard
              </a>
              <button
                type="button"
                className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={props.onSignOut}
                disabled={props.isSigningOut}
              >
                {props.isSigningOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </details>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-8">{props.children}</main>
    </div>
  )
}
