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
  // `payment_intent` / `payment_intent_client_secret` query params. Detecting
  // that once — and confirming the returned client secret matches the active
  // intent — lets us go straight to pending-fulfillment on return instead of
  // showing "ready" and risking a duplicate confirm against an already-
  // authenticated intent. Requiring the secret match also prevents a crafted
  // URL from faking the fulfilled state. Computed lazily so the URL parse only
  // runs once per mount, not on every render.
  const [returnedFromStripe] = useState(() =>
    typeof window !== 'undefined'
      ? isStripeReturn(window.location.search, props.clientSecret)
      : false,
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
                // We landed back after a 3DS redirect; the intent was already
                // confirmed. Do not offer a duplicate Confirm & pay — go
                // straight to pending fulfillment and refresh the balance.
                setStatus('pending-fulfillment')
                props.onConfirmed()
                void handleRefreshBalance()
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
 * `/billing?payment_intent=x`) from faking the succeeded/pending state.
 */
export function isStripeReturn(search: string, clientSecret: string): boolean {
  const params = new URLSearchParams(search)
  const returnedSecret = params.get('payment_intent_client_secret')

  if (!returnedSecret) {
    return false
  }

  return returnedSecret === clientSecret
}
