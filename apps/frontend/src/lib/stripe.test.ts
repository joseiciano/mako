import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Stripe } from '@stripe/stripe-js'

const { loadStripeMock } = vi.hoisted(function createMocks() {
  return { loadStripeMock: vi.fn() }
})

vi.mock('@stripe/stripe-js', function mockStripeJs() {
  return { loadStripe: loadStripeMock }
})

// The `stripePromise` singleton is module-scoped, so it must not leak between
// tests. Each test dynamically imports a fresh module instance via
// `vi.resetModules()`. This preserves the real "one SDK bootstrap per module"
// behavior (a genuine singleton within a single app module instance) without
// adding any test-only production APIs.
async function loadStripeModule() {
  vi.resetModules()
  return await import('./stripe')
}

describe('stripe client helper', function stripeLibSuite() {
  beforeEach(function resetMock() {
    loadStripeMock.mockReset()
    loadStripeMock.mockResolvedValue(null as unknown as Stripe)
  })

  afterEach(function resetEnv() {
    vi.unstubAllEnvs()
  })

  it('returns the configured publishable key', async function run() {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    const { getStripePublishableKey } = await loadStripeModule()

    expect(getStripePublishableKey()).toBe('pk_test_123')
  })

  it('returns undefined when the publishable key is unset', async function run() {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', '')
    const { getStripePublishableKey } = await loadStripeModule()

    expect(getStripePublishableKey()).toBeUndefined()
  })

  it('returns a loader when the publishable key is configured', async function run() {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    const { getStripeLoader } = await loadStripeModule()

    const loader = getStripeLoader()

    expect(loader).toBeTruthy()
    expect(typeof loader?.then).toBe('function')
    expect(loadStripeMock).toHaveBeenCalledWith('pk_test_123')
  })

  it('returns null loader when the publishable key is unconfigured', async function run() {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', '')
    const { getStripeLoader } = await loadStripeModule()

    expect(getStripeLoader()).toBeNull()
    expect(loadStripeMock).not.toHaveBeenCalled()
  })

  it('caches a single loader within one module instance (singleton)', async function run() {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    const { getStripeLoader } = await loadStripeModule()

    const first = getStripeLoader()
    const second = getStripeLoader()

    expect(first).toBe(second)
    expect(loadStripeMock).toHaveBeenCalledTimes(1)
  })

  it('creates a fresh isolated loader when the module is re-imported', async function run() {
    // First module instance with one key.
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    const firstModule = await loadStripeModule()
    const firstLoader = firstModule.getStripeLoader()
    expect(loadStripeMock).toHaveBeenCalledWith('pk_test_123')

    // A re-imported module (as happens across test cases) is a fresh singleton:
    // the cached promise does not leak, so a different configured key creates a
    // brand-new loader and bootstraps the SDK again with the new key.
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_456')
    const secondModule = await loadStripeModule()
    const secondLoader = secondModule.getStripeLoader()

    expect(secondLoader).not.toBe(firstLoader)
    expect(loadStripeMock).toHaveBeenLastCalledWith('pk_test_456')
    expect(loadStripeMock).toHaveBeenCalledTimes(2)
  })
})
