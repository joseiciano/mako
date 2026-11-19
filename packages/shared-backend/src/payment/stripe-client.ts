import Stripe from 'stripe'

export type StripeClient = Stripe

/**
 * `apiBaseUrl` is the optional `STRIPE_API_BASE_URL` operator setting (local
 * stripe-mock). Unset or blank leaves the SDK defaults untouched; a value that
 * is not an http(s) URL throws.
 */
export function createStripeClient(secretKey: string, apiBaseUrl?: string): StripeClient {
  const config: Stripe.StripeConfig = {
    httpClient: Stripe.createFetchHttpClient(),
    ...parseStripeHostOptions(apiBaseUrl),
  }

  return new Stripe(secretKey, config)
}

function parseStripeHostOptions(apiBaseUrl: string | undefined): Stripe.StripeConfig {
  const trimmed = apiBaseUrl?.trim()
  if (!trimmed) {
    return {}
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('STRIPE_API_BASE_URL must be an http or https URL.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('STRIPE_API_BASE_URL must be an http or https URL.')
  }

  const protocol = parsed.protocol === 'http:' ? 'http' : 'https'
  const port = parsed.port || (protocol === 'http' ? '80' : '443')

  return { host: parsed.hostname, port, protocol }
}
