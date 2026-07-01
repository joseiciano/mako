import Stripe from 'stripe'

export type StripeClient = Stripe

export function createStripeClient(secretKey: string): StripeClient {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}
