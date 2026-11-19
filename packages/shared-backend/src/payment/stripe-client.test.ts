import { describe, expect, it } from 'vitest'
import { createStripeClient } from './stripe-client'

function apiConfig(client: ReturnType<typeof createStripeClient>) {
  const getApiField = (client as unknown as { getApiField: (name: string) => unknown }).getApiField.bind(client)
  return { host: getApiField('host'), port: getApiField('port'), protocol: getApiField('protocol') }
}

describe('createStripeClient', () => {
  it('keeps the SDK default host options when no base URL is given', () => {
    expect(apiConfig(createStripeClient('sk_test_x'))).toEqual({
      host: 'api.stripe.com',
      port: '443',
      protocol: 'https',
    })
  })

  it('treats a blank base URL as unset', () => {
    expect(apiConfig(createStripeClient('sk_test_x', '  '))).toEqual(
      apiConfig(createStripeClient('sk_test_x')),
    )
  })

  it('points the SDK at the given http base URL', () => {
    expect(apiConfig(createStripeClient('sk_test_x', 'http://stripe-mock:12111'))).toEqual({
      host: 'stripe-mock',
      port: '12111',
      protocol: 'http',
    })
  })

  it('rejects a value that is not an http(s) URL', () => {
    expect(() => createStripeClient('sk_test_x', 'not a url')).toThrow(
      'STRIPE_API_BASE_URL must be an http or https URL.',
    )
    expect(() => createStripeClient('sk_test_x', 'ftp://stripe-mock')).toThrow(
      'STRIPE_API_BASE_URL must be an http or https URL.',
    )
  })
})
