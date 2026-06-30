import type { AccountProfile } from '@mako/shared'

export type BillingState = 'loading' | 'error' | 'populated'

export type BillingDumbProps = {
  state: BillingState
  account?: AccountProfile
  errorMessage?: string
  onRetry?: () => void
  isRetrying?: boolean
}

export function BillingDumb(props: BillingDumbProps) {
  const isBusy = props.state === 'loading'

  return (
    <main aria-busy={isBusy} className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
        <h1 className="text-2xl font-semibold text-white">Billing</h1>
        <p className="mt-2 text-sm text-slate-300">
          Review your interview balances and credit usage.
        </p>
      </header>

      {renderBillingContent(props)}
    </main>
  )
}

function renderBillingContent(props: BillingDumbProps) {
  if (props.state === 'loading') {
    return (
      <p
        aria-live="polite"
        className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300"
        role="status"
      >
        Loading billing data...
      </p>
    )
  }

  if (props.state === 'error') {
    return (
      <section className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-200">
        <p role="alert">{props.errorMessage ?? 'Unable to load billing balances.'}</p>
        {props.onRetry && (
          <button
            className="mt-3 inline-flex rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={props.isRetrying}
            onClick={props.onRetry}
            type="button"
          >
            {props.isRetrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
      </section>
    )
  }

  const account = props.account

  if (!account) {
    return (
      <section className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-200">
        <p role="alert">Unable to load billing balances.</p>
      </section>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
      <BalanceSummaryCards account={account} />

      <div className="flex flex-col gap-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-lg font-semibold text-white">Credit packages</h2>
          <p className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            Credit purchase options will be available here soon.
          </p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-lg font-semibold text-white">Activity & history</h2>
          <p className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            Transaction history will appear here once credit purchases are enabled.
          </p>
        </section>
      </div>
    </div>
  )
}

function BalanceSummaryCards(props: { account: AccountProfile }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-semibold text-white">Balance summary</h2>
      <p className="mt-1 text-sm text-slate-300">
        Free AI interviews are consumed before paid credits. Credit-backed AI usage is resolved
        server-side according to account policy.
      </p>

      <dl className="mt-4 grid gap-3">
        <BalanceCard label="Credits" value={props.account.credits} />
        <BalanceCard
          label="Free Standard Interviews"
          value={props.account.freeStandardInterviews}
        />
        <BalanceCard label="Free AI Interviews" value={props.account.freeAiInterviews} />
      </dl>
    </section>
  )
}

function BalanceCard(props: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{props.label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-emerald-300">{props.value}</dd>
    </div>
  )
}
