import type { ReactNode } from 'react'

export type ProfileDumbProps = {
  dangerZone: ReactNode
}

export function ProfileDumb(props: ProfileDumbProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-14">
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-xs uppercase tracking-wide text-slate-400">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Profile</h1>
        <p className="mt-2 text-sm text-slate-300">
          Manage your account details and security preferences.
        </p>
      </section>

      {props.dangerZone}
    </main>
  )
}
