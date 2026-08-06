import { loadStripe, type Stripe } from '@stripe/stripe-js'

// Public Stripe publishable key. Configured through the standard frontend
// environment binding used across this application (VITE_*).
export function getStripePublishableKey(): string | undefined {
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

  return typeof publishableKey === 'string' && publishableKey.length > 0
    ? publishableKey
    : undefined
}

let stripePromise: Promise<Stripe | null> | null = null

// Returns a shared Stripe instance (or null when the publishable key is
// unconfigured, signalling checkout cannot be made available). The promise is
// cached so the SDK is only bootstrapped once per page load.
export function getStripeLoader(): Promise<Stripe | null> | null {
  const publishableKey = getStripePublishableKey()

  if (!publishableKey) {
    return null
  }

  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey)
  }

  return stripePromise
}
