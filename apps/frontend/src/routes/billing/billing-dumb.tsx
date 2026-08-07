import type {
  AccountProfile,
  CreditPackage,
  CreditTransaction,
} from '@mako/shared'
import type { ReactNode } from 'react'
import { formatCentsToUsd } from '#/lib/format-currency'

export type BillingState = 'loading' | 'error' | 'populated'

export type BillingDumbProps = {
  state: BillingState
  account?: AccountProfile
  errorMessage?: string
  onRetry?: () => void
  isRetrying?: boolean
  packages?: CreditPackage[]
  packagesLoading?: boolean
  packagesError?: string
  isRetryingPackages?: boolean
  onRetryPackages?: () => void
  selectedPackageId?: string
  onSelectPackage?: (packageId: string) => void
  isPurchasing?: boolean
  purchaseError?: string
  onPurchase?: () => void
  /** Renders the Stripe checkout once a payment intent is available. */
  renderCheckout?: () => ReactNode
  transactions?: CreditTransaction[]
  transactionsTotal?: number
  transactionsLoading?: boolean
  transactionsError?: string
  isRetryingTransactions?: boolean
  onRetryTransactions?: () => void
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
        <CreditPackageSection {...props} />
        {props.renderCheckout ? props.renderCheckout() : null}

        <TransactionHistorySection {...props} />
      </div>
    </div>
  )
}

function CreditPackageSection(props: BillingDumbProps) {
  return (
    <section
      aria-labelledby="credit-packages-heading"
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
    >
      <h2 id="credit-packages-heading" className="text-lg font-semibold text-white">
        Credit packages
      </h2>

      {renderPackageContent(props)}
    </section>
  )
}

function renderPackageContent(props: BillingDumbProps) {
  if (props.packagesLoading) {
    return (
      <p
        aria-live="polite"
        className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300"
        role="status"
      >
        Loading credit packages...
      </p>
    )
  }

  if (props.packagesError) {
    return (
      <div className="mt-2 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
        <p role="alert">{props.packagesError}</p>
        {props.onRetryPackages && (
          <button
            className="mt-3 inline-flex rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={props.isRetryingPackages}
            onClick={props.onRetryPackages}
            type="button"
          >
            {props.isRetryingPackages ? 'Retrying...' : 'Retry packages'}
          </button>
        )}
      </div>
    )
  }

  const packages = props.packages ?? []
  const checkoutActive = Boolean(props.renderCheckout)

  if (packages.length === 0) {
    return (
      <p className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
        No credit packages are available right now.
      </p>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div
        aria-label="Choose a credit package"
        className="grid gap-3 sm:grid-cols-2"
        role="radiogroup"
      >
        {packages.map(function renderPackage(pkg) {
          const isSelected = props.selectedPackageId === pkg.package_id

          return (
            <label
              className={`flex flex-col gap-1 rounded-lg border p-4 transition ${
                checkoutActive ? 'cursor-default' : 'cursor-pointer'
              } ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-950/40'
                  : 'border-slate-800 bg-slate-950/80 hover:border-slate-600'
              }`}
              key={pkg.package_id}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium text-white">{pkg.display_name}</span>
                <span className="text-sm font-semibold text-emerald-300">
                  {formatCentsToUsd(pkg.amount_cents)}
                </span>
              </span>
              <span className="text-sm text-slate-300">{pkg.credits_granted} credits</span>
              <span className="mt-2 flex items-center gap-2">
                <input
                  aria-label={`Select ${pkg.display_name}`}
                  checked={isSelected}
                  className="accent-emerald-500"
                  disabled={checkoutActive}
                  name="credit-package"
                  onChange={function handleChange(event) {
                    if (event.target.checked && props.onSelectPackage) {
                      props.onSelectPackage(pkg.package_id)
                    }
                  }}
                  type="radio"
                  value={pkg.package_id}
                />
                <span className="text-sm text-slate-400">
                  {checkoutActive ? 'Locked during checkout' : 'Select'}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      {!checkoutActive && (
        <div className="flex flex-col gap-2">
          <button
            className="inline-flex w-fit items-center justify-center rounded-md border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!props.selectedPackageId || props.isPurchasing}
            onClick={props.onPurchase}
            type="button"
          >
            {props.isPurchasing ? 'Starting purchase...' : 'Start purchase'}
          </button>

          {props.purchaseError && (
            <p className="text-sm text-red-300" role="alert">
              {props.purchaseError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function TransactionHistorySection(props: BillingDumbProps) {
  const hasHistory = Array.isArray(props.transactions)

  return (
    <section
      aria-labelledby="transaction-history-heading"
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="transaction-history-heading"
          className="text-lg font-semibold text-white"
        >
          Transaction history
        </h2>
        {hasHistory && (
          <span className="text-sm text-slate-400">
            {props.transactionsTotal ?? 0} total
          </span>
        )}
      </div>

      {renderTransactionContent(props)}
    </section>
  )
}

function renderTransactionContent(props: BillingDumbProps) {
  if (props.transactionsLoading) {
    return (
      <p
        aria-live="polite"
        className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300"
        role="status"
      >
        Loading transaction history...
      </p>
    )
  }

  if (props.transactionsError) {
    return (
      <div className="mt-2 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
        <p role="alert">{props.transactionsError}</p>
        {props.onRetryTransactions && (
          <button
            className="mt-3 inline-flex rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={props.isRetryingTransactions}
            onClick={props.onRetryTransactions}
            type="button"
          >
            {props.isRetryingTransactions ? 'Retrying...' : 'Retry history'}
          </button>
        )}
      </div>
    )
  }

  const transactions = props.transactions ?? []

  if (transactions.length === 0) {
    return (
      <p className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
        No credit purchases yet.
      </p>
    )
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Credit purchase history</caption>
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-400">
            <th scope="col" className="py-2 pr-4 font-medium">
              Amount
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Credits
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Status
            </th>
            <th scope="col" className="py-2 font-medium">
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(function renderTransactionRow(transaction) {
            return (
              <tr
                className="border-t border-slate-800"
                key={transaction.id}
              >
                <td className="py-3 pr-4 font-medium text-white">
                  {formatCentsToUsd(transaction.amount)}
                </td>
                <td className="py-3 pr-4 text-slate-300">
                  {transaction.credits_granted} credits
                </td>
                <td className="py-3 pr-4 text-slate-300">
                  {formatTransactionStatus(transaction.status)}
                </td>
                <td className="py-3 text-slate-400">
                  {formatTransactionDate(transaction.created_at)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function formatTransactionStatus(status: string): string {
  if (status.length === 0) {
    return status
  }

  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatTransactionDate(value: string): string {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.valueOf())) {
    return '—'
  }

  // Render in UTC so the date never shifts across timezones; created_at is an
  // ISO timestamp and users expect the date they purchased on.
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
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
