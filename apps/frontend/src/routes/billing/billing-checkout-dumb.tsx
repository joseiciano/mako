import type { FormEvent, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import type { CheckoutStatus } from './billing-checkout-smart'

export type BillingCheckoutDumbProps = {
  status: CheckoutStatus | 'setup-error'
  packageName?: string
  packageAmountLabel?: string
  isConfirmDisabled?: boolean
  isConfirming?: boolean
  onCancel?: () => void
  onConfirm?: (event: FormEvent<HTMLFormElement>) => void
  onRefreshBalance?: () => Promise<void>
  /** Reset the checkout phase so the Payment Element renders fresh. */
  onRetry?: () => void
  /** Render the Stripe Payment Element. Mounted throughout the flow. */
  renderPaymentElement?: () => ReactNode
  message?: string
}

/** Statuses whose status region should receive programmatic focus on entry. */
const FOCUSABLE_STATUSES: ReadonlySet<CheckoutStatus> = new Set([
  'failed',
  'pending-fulfillment',
])

export function BillingCheckoutDumb(props: BillingCheckoutDumbProps) {
  // Presentational focus management: move focus to the status region only when
  // we transition INTO a focusable status, never on initial render (which would
  // cause an unexpected focus jump when the checkout first appears).
  const statusRegionRef = useRef<HTMLDivElement | null>(null)
  const previousStatusRef = useRef<CheckoutStatus | 'setup-error' | null>(null)

  useEffect(
    function focusStatusRegionOnEntry() {
      const prev = previousStatusRef.current
      previousStatusRef.current = props.status
      const enteredTarget =
        FOCUSABLE_STATUSES.has(props.status as CheckoutStatus) &&
        prev !== null &&
        prev !== props.status
      if (enteredTarget) {
        statusRegionRef.current?.focus()
      }
    },
    [props.status],
  )

  if (props.status === 'setup-error') {
    return (
      <section
        aria-labelledby="checkout-heading"
        className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
      >
        <h2 id="checkout-heading" className="text-lg font-semibold text-white">
          Checkout
        </h2>
        <p className="mt-3 text-sm text-red-300" role="alert">
          {props.message ?? 'Payment checkout is temporarily unavailable.'}
        </p>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="checkout-heading"
      aria-busy={props.isConfirming || props.status === 'initializing'}
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="checkout-heading" className="text-lg font-semibold text-white">
          Complete your purchase
        </h2>
        <button
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={props.isConfirming}
          onClick={props.onCancel}
          type="button"
        >
          Cancel purchase
        </button>
      </div>

      <p className="mt-2 text-sm text-slate-300">
        Paying for{' '}
        <span className="font-semibold text-white">{props.packageName}</span> —{' '}
        <span className="font-semibold text-emerald-300">
          {props.packageAmountLabel}
        </span>
        . You cannot change the package while confirming.
      </p>

      {/*
        The Payment Element is mounted here, OUTSIDE the status switch, so it
        keeps the same React instance across status transitions. Rendering it
        inside status-specific wrappers (form/fragment/div) would change the
        parent element type on each transition and force a remount — and real
        Stripe's PaymentElement only fires onReady once on mount, so a remount
        after a failed confirm would silently break retry recovery.
        It is only unmounted in the terminal pending-fulfillment state, where
        payment is done and no retry can follow.
      */}
      {props.status !== 'pending-fulfillment' && renderPaymentElementBox(props)}

      {renderCheckoutBody(props, statusRegionRef)}
    </section>
  )
}

function renderCheckoutBody(
  props: BillingCheckoutDumbProps,
  statusRegionRef: React.RefObject<HTMLDivElement | null>,
) {
  switch (props.status) {
    case 'initializing':
      return (
        <p
          aria-live="polite"
          className="mt-4 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-3 text-sm text-slate-300"
          role="status"
        >
          Preparing secure checkout...
        </p>
      )

    case 'ready':
      return (
        <form className="mt-4 flex flex-col gap-4" onSubmit={props.onConfirm}>
          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center justify-center rounded-md border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={props.isConfirmDisabled}
              type="submit"
            >
              Confirm & pay
            </button>
            <span className="text-xs text-slate-400">
              Powered by Stripe. Your card details are handled securely.
            </span>
          </div>
        </form>
      )

    case 'confirming':
      return (
        <p
          aria-live="polite"
          className="mt-4 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-3 text-sm text-slate-300"
          role="status"
        >
          Confirming your payment...
        </p>
      )

    case 'pending-fulfillment':
      return (
        <div
          ref={statusRegionRef}
          tabIndex={-1}
          data-testid="checkout-status-region"
          className="mt-4 rounded-md border border-amber-700/60 bg-amber-950/30 px-3 py-3"
        >
          <p className="text-sm text-amber-200" role="status">
            Payment confirmed! Your credits are being applied and may take a
            moment to appear.
          </p>
          <button
            className="mt-3 inline-flex rounded-md border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={props.onRefreshBalance}
            type="button"
          >
            Check balance now
          </button>
        </div>
      )

    case 'failed':
      // The Payment Element is already mounted above (outside the switch), so
      // the failed state only surfaces the alert + retry affordance. Keeping
      // the element mounted lets the user fix their card details and resubmit
      // without a remount that would re-run onReady (which real Stripe only
      // fires once) and break retry recovery.
      return (
        <div
          ref={statusRegionRef}
          tabIndex={-1}
          data-testid="checkout-status-region"
          className="mt-4 rounded-md border border-red-900 bg-red-950/30 px-3 py-3"
        >
          <p className="text-sm text-red-200" role="alert">
            We couldn't process your payment. Please review your details and try
            again, or cancel to choose a different package.
          </p>
          <button
            className="mt-3 inline-flex rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
            onClick={props.onRetry}
            type="button"
          >
            Try again
          </button>
        </div>
      )

    default:
      // A status not handled above must surface rather than silently render a
      // payment-failure UI. Any CheckoutStatus variant added later lands here.
      throw new Error(`Unhandled checkout status: ${String(props.status)}`)
  }
}

function renderPaymentElementBox(props: BillingCheckoutDumbProps) {
  if (!props.renderPaymentElement) {
    return null
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
      {props.renderPaymentElement()}
    </div>
  )
}
