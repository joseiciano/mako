import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeError } from '@stripe/stripe-js'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { accountQueryKey } from '#/hooks/use-account'
import { getStripeLoader } from '#/lib/stripe'
import { BillingCheckoutDumb } from './billing-checkout-dumb'

export type CheckoutStatus =
  | 'initializing'
  | 'ready'
  | 'confirming'
  | 'failed'
  | 'pending-fulfillment'

export type BillingCheckoutProps = {
  clientSecret: string
  /** Display name of the selected package (shown so users know what they pay for). */
  packageName: string
  /** USD label for the selected package. */
  packageAmountLabel: string
  onCancel: () => void
  /** Fired after payment confirmation succeeds (fulfillment still pending). */
  onConfirmed: () => void
}

export function BillingCheckout(props: BillingCheckoutProps) {
  const stripePromise = getStripeLoader()

  if (!stripePromise) {
    return (
      <BillingCheckoutDumb
        status="setup-error"
        message="Payment checkout is temporarily unavailable. Please try again later."
      />
    )
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: props.clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#10b981',
            colorBackground: '#1e293b',
            colorText: '#f1f5f9',
            colorDanger: '#f87171',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          },
        },
      }}
    >
      <CheckoutForm
        clientSecret={props.clientSecret}
        packageName={props.packageName}
        packageAmountLabel={props.packageAmountLabel}
        onCancel={props.onCancel}
        onConfirmed={props.onConfirmed}
      />
    </Elements>
  )
}

/**
 * Lives under the `<Elements>` provider so it can use `useStripe` /
 * `useElements` and render the Stripe `PaymentElement`. Owns the checkout
 * status machine and client-side confirmation; it never mutates balances or
 * grants credits itself. Credential grant is exclusively the backend
 * webhook's job — on success we only invalidate/refetch server-backed queries.
 */
function CheckoutForm(props: {
  clientSecret: string
  packageName: string
  packageAmountLabel: string
  onCancel: () => void
  onConfirmed: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<CheckoutStatus>('initializing')
  const [elementReady, setElementReady] = useState(false)

  // When Stripe redirects for 3DS authentication it returns to the page with
  // `payment_intent` / `payment_intent_client_secret` query params. The
  // matching client secret proves we were returned for THIS intent (preventing
  // a crafted URL from faking fulfillment) but it does NOT prove success — the
  // returned intent may be canceled, requires further action, etc. We must call
  // `retrievePaymentIntent` to read the authoritative status. Computed lazily
  // so the URL parse only runs once per mount, not on every render.
  const [returnedFromStripe] = useState(() =>
    typeof window !== 'undefined'
      ? isStripeReturn(window.location.search, props.clientSecret)
      : false,
  )

  // Guards the async retrieve+reconcile below so it runs exactly once per
  // mount even if effects re-run (e.g. due to rerenders or prop identity
  // changes). Prevents duplicate pending/onConfirmed handling.
  const returnHandledRef = useRef(false)

  useEffect(
    function reconcileStripeReturn() {
      if (!returnedFromStripe || returnHandledRef.current || !stripe) {
        return
      }
      returnHandledRef.current = true

      let cancelled = false
      void (async function reconcile() {
        try {
          const { paymentIntent } = await stripe.retrievePaymentIntent(
            props.clientSecret,
          )
          if (cancelled) {
            return
          }
          if (
            !paymentIntent ||
            (paymentIntent.status !== 'succeeded' &&
              paymentIntent.status !== 'processing')
          ) {
            // Missing intent, retrieval returned nothing, or the intent did not
            // succeed (canceled / requires_payment_method / requires_action /
            // unknown). Never fabricate success from the URL secret alone.
            setStatus('failed')
            return
          }
          // Credential grant still happens asynchronously via the backend Stripe
          // webhook, so show pending fulfillment and let the account query refresh
          // once Postgres updates. We do NOT show a final balance.
          setStatus('pending-fulfillment')
          props.onConfirmed()
          void queryClient.invalidateQueries({ queryKey: accountQueryKey })
          void queryClient.refetchQueries({ queryKey: accountQueryKey })
        } catch {
          if (!cancelled) {
            setStatus('failed')
          }
        }
      })()

      return function cancel() {
        cancelled = true
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [returnedFromStripe, stripe, props.clientSecret],
  )

  // A new client secret (new package / restart) resets the checkout phase.
  // Uses a ref so the initial mount is NOT treated as a change (the Payment
  // Element's onReady fires before this effect on mount and must not be
  // clobbered back to "initializing").
  const previousSecretRef = useRef(props.clientSecret)
  useEffect(
    function resetOnNewSecret() {
      if (previousSecretRef.current === props.clientSecret) {
        return
      }
      previousSecretRef.current = props.clientSecret
      setElementReady(false)
      setStatus('initializing')
    },
    [props.clientSecret],
  )

  async function handleRefreshBalance() {
    await queryClient.invalidateQueries({ queryKey: accountQueryKey })
    await queryClient.refetchQueries({ queryKey: accountQueryKey })
  }

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault()

    if (!stripe || !elements || status === 'confirming' || !elementReady) {
      return
    }

    setStatus('confirming')

    let error: StripeError | undefined
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + window.location.pathname,
        },
        redirect: 'if_required',
      })
      error = result.error
    } catch {
      // confirmPayment can reject on network/transport errors. Surface a
      // recoverable failure state rather than leaving the UI stuck confirming.
      setStatus('failed')
      return
    }

    if (error) {
      setStatus('failed')
      return
    }

    // confirmPayment resolved without an error for an in-place (non-redirect)
    // Payment Intent. Credential grant still happens asynchronously via the
    // backend Stripe webhook, so we must NOT show a final balance. Invalidate
    // the server-backed account query so balances refresh once Postgres updates.
    setStatus('pending-fulfillment')
    props.onConfirmed()
    await handleRefreshBalance()
  }

  function handleRetry() {
    // The Payment Element stays mounted and interactive; its `onReady` only
    // fires once on mount, so it must NOT be reset to `false`. Jump straight
    // back to the ready phase so the Confirm & pay button reappears.
    setStatus('ready')
  }

  return (
    <BillingCheckoutDumb
      status={status}
      packageName={props.packageName}
      packageAmountLabel={props.packageAmountLabel}
      onCancel={props.onCancel}
      onConfirm={handleConfirm}
      isConfirmDisabled={!stripe || !elements || !elementReady || status !== 'ready'}
      isConfirming={status === 'confirming'}
      onRefreshBalance={handleRefreshBalance}
      onRetry={handleRetry}
      renderPaymentElement={function renderPaymentElement() {
        return (
          <PaymentElement
            onReady={function handleElementReady() {
              setElementReady(true)
              if (!stripe || !elements || status !== 'initializing') {
                return
              }
              if (returnedFromStripe) {
                // We landed back after a Stripe redirect. The returned intent's
                // status is reconciled asynchronously via `retrievePaymentIntent`
                // in the effect above; keep the checkout in a non-interactive
                // phase until that resolution lands.
                return
              }
              // The Payment Element reports readiness after it renders and
              // mounts, which gates the confirm button so users can't pay
              // before checkout is usable.
              setStatus('ready')
            }}
          />
        )
      }}
    />
  )
}

/**
 * Returns true when the URL query contains the params Stripe appends after a
 * redirect-based confirmation (e.g. 3DS) returns to `return_url`, and the
 * returned `payment_intent_client_secret` matches the active draft's client
 * secret. Requiring a match prevents a crafted URL (e.g.
 * `/billing?payment_intent=x`) from spoofing a return. NOTE: a match only
 * proves identity of the intent — it does NOT prove payment success. Callers
 * must still reconcile the authoritative status via `retrievePaymentIntent`.
 */
export function isStripeReturn(search: string, clientSecret: string): boolean {
  const params = new URLSearchParams(search)
  const returnedSecret = params.get('payment_intent_client_secret')

  if (!returnedSecret) {
    return false
  }

  return returnedSecret === clientSecret
}
