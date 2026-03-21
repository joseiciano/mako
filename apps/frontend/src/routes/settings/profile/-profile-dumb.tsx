import type { AccountProfile } from '@mako/shared'
import type { FormEvent } from 'react'

export type ProfileDumbProps = {
  account: AccountProfile | null
  displayName: string
  isLoading: boolean
  isRefreshing: boolean
  isSaving: boolean
  errorMessage: string | null
  onRetry: () => void
  onDisplayNameChange: (nextValue: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ProfileDumb(props: ProfileDumbProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-lg font-semibold text-emerald-200">
              {getProfileInitials(props.account?.displayName ?? 'User')}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">
                Settings
              </p>
              <h1 className="text-2xl font-semibold text-white">
                {props.account?.displayName ?? 'Loading profile...'}
              </h1>
            </div>
          </div>
          <div className="text-sm text-slate-300">
            {props.isRefreshing ? 'Refreshing profile...' : 'Profile synced'}
          </div>
        </div>
      </header>

      {props.errorMessage ? (
        <section className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-100">
          <p>{props.errorMessage}</p>
          <button
            type="button"
            className="mt-3 rounded-md border border-rose-300/40 px-3 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-500/20"
            onClick={props.onRetry}
          >
            Retry
          </button>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Profile details</h2>
          <p className="mt-1 text-sm text-slate-300">
            Keep your account metadata and public display name up to date.
          </p>

          <form className="mt-6 flex flex-col gap-6" onSubmit={props.onSubmit}>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-200">Display Name</span>
              <input
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400 transition focus:ring-2"
                value={props.displayName}
                disabled={props.isLoading || props.isSaving}
                onChange={function onDisplayNameInputChange(event) {
                  props.onDisplayNameChange(event.target.value)
                }}
              />
            </label>

            <dl className="grid gap-4 rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-sm">
              <div className="space-y-1">
                <dt className="text-slate-400">Email</dt>
                <dd className="font-medium text-slate-200">
                  {props.account?.email ?? '—'}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-slate-400">Join Date</dt>
                <dd className="font-medium text-slate-200">
                  {formatDate(props.account?.createdAt)}
                </dd>
              </div>
            </dl>

            <button
              className="inline-flex w-fit items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={props.isLoading || props.isSaving}
            >
              {props.isSaving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Quotas & Credits</h2>
          <p className="mt-1 text-sm text-slate-300">
            Track your free sessions and credit balance in one place.
          </p>

          <div className="mt-5 grid gap-3 text-sm">
            <QuotaRow
              label="Credits"
              value={props.account?.credits ?? 0}
              loading={props.isLoading}
            />
            <QuotaRow
              label="Free Standard Interviews"
              value={props.account?.freeStandardInterviews ?? 0}
              loading={props.isLoading}
            />
            <QuotaRow
              label="Free AI Interviews"
              value={props.account?.freeAiInterviews ?? 0}
              loading={props.isLoading}
            />
          </div>
        </article>
      </section>
    </main>
  )
}

function QuotaRow(props: { label: string; value: number; loading: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2">
      <span className="text-slate-300">{props.label}</span>
      <span className="text-base font-semibold text-emerald-300">
        {props.loading ? '...' : props.value}
      </span>
    </div>
  )
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) {
    return '—'
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getProfileInitials(displayName: string): string {
  const parts = displayName
    .split(' ')
    .map(function mapToken(token) {
      return token.trim()
    })
    .filter(Boolean)

  if (parts.length === 0) {
    return 'U'
  }

  const initials = parts.slice(0, 2).map(function toInitial(token) {
    return token.at(0)?.toUpperCase() ?? ''
  })

  return initials.join('')
}
