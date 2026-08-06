import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { BillingCheckout, isStripeReturn } from './billing-checkout-smart'

const {
  useStripeMock,
  useElementsMock,
  PaymentElementMock,
  getStripeLoaderMock,
  invalidateQueriesMock,
  refetchQueriesMock,
} = vi.hoisted(function createMocks() {
  return {
    useStripeMock: vi.fn(),
    useElementsMock: vi.fn(),
    PaymentElementMock: vi.fn(),
    getStripeLoaderMock: vi.fn(),
    invalidateQueriesMock: vi.fn(),
    refetchQueriesMock: vi.fn(),
  }
})

vi.mock('@stripe/react-stripe-js', function mockStripeReact() {
  return {
    useStripe: useStripeMock,
    useElements: useElementsMock,
    Elements: function MockElements({ children }: { children: React.ReactNode }) {
      return <div>{children}</div>
    },
    PaymentElement: PaymentElementMock,
  }
})

vi.mock('#/lib/stripe', function mockStripeLib() {
  return {
    getStripeLoader: getStripeLoaderMock,
  }
})

vi.mock('#/hooks/use-account', function mockUseAccount() {
  return {
    accountQueryKey: ['account'],
  }
})

function createTestQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  // Persist invalidation/refetch recording by patching the methods after construction.
  queryClient.invalidateQueries = vi.fn(
    queryClient.invalidateQueries.bind(queryClient),
  ) as typeof queryClient.invalidateQueries
  queryClient.refetchQueries = vi.fn(
    queryClient.refetchQueries.bind(queryClient),
  ) as typeof queryClient.refetchQueries
  return queryClient
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function setupStripeReady() {
  const confirmPaymentMock = vi.fn(async () => ({ error: undefined }))
  const stripe = {
    confirmPayment: confirmPaymentMock,
  }
  useStripeMock.mockReturnValue(stripe)
  useElementsMock.mockReturnValue({})
  PaymentElementMock.mockImplementation(function MockPaymentElement(props: {
    onReady?: () => void
  }) {
    // Fire onReady in an effect (real Stripe does this after mount) so the
    // checkout transitions to the ready phase.
    React.useEffect(function notifyReady() {
      props.onReady?.()
    }, [])
    return <div data-testid="payment-element">Payment Element</div>
  })
  getStripeLoaderMock.mockReturnValue(Promise.resolve(stripe))
  return { stripe, confirmPaymentMock }
}

describe('billing-checkout behavior', function billingCheckoutSuite() {
  beforeEach(function resetMocks() {
    vi.restoreAllMocks()
    useStripeMock.mockReset()
    useElementsMock.mockReset()
    PaymentElementMock.mockReset()
    getStripeLoaderMock.mockReset()
    invalidateQueriesMock.mockReset()
    refetchQueriesMock.mockReset()
  })

  it('renders setup error when Stripe is not configured', function run() {
    getStripeLoaderMock.mockReturnValue(null)

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
  })

  it('shows initializing state before Stripe and Payment Element are ready', function run() {
    useStripeMock.mockReturnValue(null)
    useElementsMock.mockReturnValue(null)
    getStripeLoaderMock.mockReturnValue(Promise.resolve(null))

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
      { wrapper: createWrapper(createTestQueryClient()) },
    )

    expect(screen.getByRole('status')).toHaveTextContent(/preparing secure checkout/i)
  })

  it('renders the Payment Element once during the flow', async function run() {
    setupStripeReady()

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
      { wrapper: createWrapper(createTestQueryClient()) },
    )

    await waitFor(function waitForReady() {
      expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
    })

    expect(screen.getAllByTestId('payment-element')).toHaveLength(1)
  })

  it('does not grant credits locally and reports pending fulfillment on success', async function run() {
    const { stripe } = setupStripeReady()
    const onConfirmed = vi.fn()
    const queryClient = createTestQueryClient()
    const invalidate = queryClient.invalidateQueries as unknown as ReturnType<
      typeof vi.fn
    >
    const refetch = queryClient.refetchQueries as unknown as ReturnType<typeof vi.fn>

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={vi.fn()}
        onConfirmed={onConfirmed}
      />,
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(function waitForReady() {
      expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
    })

    act(function clickConfirm() {
      screen.getByRole('button', { name: /confirm & pay/i }).click()
    })

    await waitFor(function waitForPending() {
      expect(screen.getByText(/credits are being applied/i)).toBeInTheDocument()
    })

    // Never grant credits locally.
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1)
    // Notify the parent that payment was confirmed so it clears its draft.
    expect(onConfirmed).toHaveBeenCalledTimes(1)
    // Account query invalidated + refetched so webhook-fulfilled balance appears.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account'] })
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['account'] })
    expect(screen.getByRole('status')).toHaveTextContent(/payment confirmed/i)
  })

  it('shows failure state when Stripe confirmation fails', async function run() {
    setupStripeReady()
    // Re-point confirmPayment to a failing implementation for this test.
    useStripeMock.mockReturnValue({
      confirmPayment: vi.fn(async () => ({
        error: { message: 'Your card was declined.' },
      })),
    })

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
      { wrapper: createWrapper(createTestQueryClient()) },
    )

    await waitFor(function waitForReady() {
      expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
    })

    act(function clickConfirm() {
      screen.getByRole('button', { name: /confirm & pay/i }).click()
    })

    await waitFor(function waitForFailure() {
      expect(screen.getByText(/couldn't process your payment/i)).toBeInTheDocument()
    })
  })

  it('surfaces failure state when confirmPayment rejects', async function run() {
    setupStripeReady()
    // ConfirmPayment transport/network failure rejects the promise.
    useStripeMock.mockReturnValue({
      confirmPayment: vi.fn(async () => {
        throw new Error('Network error')
      }),
    })

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
      { wrapper: createWrapper(createTestQueryClient()) },
    )

    await waitFor(function waitForReady() {
      expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
    })

    act(function clickConfirm() {
      screen.getByRole('button', { name: /confirm & pay/i }).click()
    })

    await waitFor(function waitForFailure() {
      expect(screen.getByText(/couldn't process your payment/i)).toBeInTheDocument()
    })
  })

  it('keeps Payment Element ready after retry so users can resubmit', async function run() {
    // Real Stripe fires onReady only once on first mount. Simulate that so a
    // retry that drops back to "initializing" cannot silently recover.
    let readyFired = false
    const confirmPaymentMock = vi.fn(async () => ({
      error: { message: 'Your card was declined.' },
    }))
    const stripe = { confirmPayment: confirmPaymentMock }
    useStripeMock.mockReturnValue(stripe)
    useElementsMock.mockReturnValue({})
    PaymentElementMock.mockImplementation(function MockPaymentElement(props: {
      onReady?: () => void
    }) {
      React.useEffect(function notifyReadyOnce() {
        if (!readyFired) {
          readyFired = true
          props.onReady?.()
        }
      }, [])
      return <div data-testid="payment-element">Payment Element</div>
    })
    getStripeLoaderMock.mockReturnValue(Promise.resolve(stripe))

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
      { wrapper: createWrapper(createTestQueryClient()) },
    )

    await waitFor(function waitForReady() {
      expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
    })

    act(function clickConfirm() {
      screen.getByRole('button', { name: /confirm & pay/i }).click()
    })

    await waitFor(function waitForFailure() {
      expect(screen.getByText(/couldn't process your payment/i)).toBeInTheDocument()
    })

    // The Payment Element stays mounted; retry must NOT re-set elementReady to
    // false (onReady only fires once) and must return to the ready phase
    // directly so the confirm button reappears without restarting.
    act(function clickRetry() {
      screen.getByRole('button', { name: /try again/i }).click()
    })

    expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
    // Exactly one Payment Element was ever mounted throughout retry.
    expect(screen.getAllByTestId('payment-element')).toHaveLength(1)
  })

  it('keeps the same PaymentElement instance mounted through confirm failure and retry', async function run() {
    // Real Stripe fires onReady only once on first mount; simulate that so a
    // remount during retry cannot silently recover via a second onReady.
    let readyFired = false
    const confirmPaymentMock = vi.fn(async () => ({
      error: { message: 'Your card was declined.' },
    }))
    const stripe = { confirmPayment: confirmPaymentMock }
    useStripeMock.mockReturnValue(stripe)
    useElementsMock.mockReturnValue({})

    // Track mount/cleanup lifecycle rather than DOM count after retry. A DOM
    // count of one is satisfied both when the element stays mounted AND when it
    // unmounts then remounts, so it cannot catch the regression.
    const lifecycle = { mounts: 0, unmounts: 0 }
    PaymentElementMock.mockImplementation(function MockPaymentElement(props: {
      onReady?: () => void
    }) {
      React.useEffect(function notifyReadyOnce() {
        if (!readyFired) {
          readyFired = true
          props.onReady?.()
        }
      }, [])
      React.useLayoutEffect(function trackLifecycle() {
        lifecycle.mounts += 1
        return function trackCleanup() {
          lifecycle.unmounts += 1
        }
      }, [])
      return <div data-testid="payment-element">Payment Element</div>
    })
    getStripeLoaderMock.mockReturnValue(Promise.resolve(stripe))

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
      { wrapper: createWrapper(createTestQueryClient()) },
    )

    await waitFor(function waitForReady() {
      expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
    })

    act(function clickConfirm() {
      screen.getByRole('button', { name: /confirm & pay/i }).click()
    })

    await waitFor(function waitForFailure() {
      expect(screen.getByText(/couldn't process your payment/i)).toBeInTheDocument()
    })

    // The Payment Element must have survived the transition to the failed
    // state — it is never unmounted and no second instance is mounted.
    expect(lifecycle.mounts).toBe(1)
    expect(lifecycle.unmounts).toBe(0)

    act(function clickRetry() {
      screen.getByRole('button', { name: /try again/i }).click()
    })

    // Retry returns directly to ready; the same instance is still mounted.
    expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
    expect(lifecycle.mounts).toBe(1)
    expect(lifecycle.unmounts).toBe(0)
  })

  it('confirms payment with a clean return_url (origin + pathname)', async function run() {
    const { stripe } = setupStripeReady()
    const originalLocation = window.location
    const fakeLocation = {
      ...originalLocation,
      href:
        'https://mako.dev/billing?payment_intent=pi_123&payment_intent_client_secret=pi_secret',
      origin: 'https://mako.dev',
      pathname: '/billing',
    }
    Object.defineProperty(window, 'location', {
      value: fakeLocation,
      writable: true,
      configurable: true,
    })

    try {
      render(
        <BillingCheckout
          clientSecret="pi_secret"
          packageName="5 Credits"
          packageAmountLabel="$25.00"
          onCancel={vi.fn()}
          onConfirmed={vi.fn()}
        />,
        { wrapper: createWrapper(createTestQueryClient()) },
      )

      await waitFor(function waitForReady() {
        expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
      })

      act(function clickConfirm() {
        screen.getByRole('button', { name: /confirm & pay/i }).click()
      })

      await waitFor(function waitForPending() {
        expect(screen.getByText(/credits are being applied/i)).toBeInTheDocument()
      })

      // return_url must strip any stale Stripe query params (origin + pathname).
      expect(stripe.confirmPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmParams: { return_url: 'https://mako.dev/billing' },
        }),
      )
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    }
  })

  it('blocks duplicate confirmation while confirmation is pending', async function run() {
    let resolveConfirm: (value: { error: undefined }) => void = () => {}
    const confirmPaymentMock = vi.fn(
      () =>
        new Promise<{ error: undefined }>(function pending(resolve) {
          resolveConfirm = resolve
        }),
    )
    const stripe = { confirmPayment: confirmPaymentMock }
    useStripeMock.mockReturnValue(stripe)
    useElementsMock.mockReturnValue({})
    PaymentElementMock.mockImplementation(function MockPaymentElement(props: {
      onReady?: () => void
    }) {
      React.useEffect(function notifyReady() {
        props.onReady?.()
      }, [])
      return <div data-testid="payment-element">Payment Element</div>
    })
    getStripeLoaderMock.mockReturnValue(Promise.resolve(stripe))
    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
      { wrapper: createWrapper(createTestQueryClient()) },
    )

    await waitFor(function waitForReady() {
      expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
    })

    act(function clickConfirm() {
      screen.getByRole('button', { name: /confirm & pay/i }).click()
    })

    expect(screen.getByText(/confirming your payment/i)).toBeInTheDocument()

    // Second click while pending should be a no-op.
    act(function clickAgain() {
      const confirmBtn = screen.queryByRole('button', { name: /confirm & pay/i })
      expect(confirmBtn).not.toBeInTheDocument()
    })

    act(function resolvePending() {
      resolveConfirm({ error: undefined })
    })

    await waitFor(function waitForPending() {
      expect(screen.getByText(/credits are being applied/i)).toBeInTheDocument()
    })

    expect(confirmPaymentMock).toHaveBeenCalledTimes(1)
  })

  it('shows pending fulfillment with manual refresh affordance', async function run() {
    setupStripeReady()
    const queryClient = createTestQueryClient()
    const invalidate = queryClient.invalidateQueries as unknown as ReturnType<
      typeof vi.fn
    >
    const refetch = queryClient.refetchQueries as unknown as ReturnType<typeof vi.fn>

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(function waitForReady() {
      expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
    })

    act(function clickConfirm() {
      screen.getByRole('button', { name: /confirm & pay/i }).click()
    })

    await waitFor(function waitForPending() {
      expect(screen.getByText(/credits are being applied/i)).toBeInTheDocument()
    })

    // Manual refresh button triggers invalidation + refetch.
    act(function clickRefresh() {
      screen.getByRole('button', { name: /check balance now/i }).click()
    })

    await waitFor(function waitForRefetch() {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account'] })
      expect(refetch).toHaveBeenCalledWith({ queryKey: ['account'] })
    })
  })

  it('uses retrievePaymentIntent to confirm a genuine Stripe return with succeeded status', async function run() {
    const retrievePaymentIntentMock = vi.fn(async () => ({
      paymentIntent: { status: 'succeeded' },
    }))
    const stripe = { retrievePaymentIntent: retrievePaymentIntentMock }
    useStripeMock.mockReturnValue(stripe)
    useElementsMock.mockReturnValue({})
    PaymentElementMock.mockImplementation(function MockPaymentElement(props: {
      onReady?: () => void
    }) {
      React.useEffect(function notifyReady() {
        props.onReady?.()
      }, [])
      return <div data-testid="payment-element">Payment Element</div>
    })
    getStripeLoaderMock.mockReturnValue(Promise.resolve(stripe))

    const originalLocation = window.location
    const fakeLocation = {
      ...originalLocation,
      search:
        '?payment_intent=pi_123&payment_intent_client_secret=pi_secret',
    }
    Object.defineProperty(window, 'location', {
      value: fakeLocation,
      writable: true,
      configurable: true,
    })

    const onConfirmed = vi.fn()
    try {
      render(
        <BillingCheckout
          clientSecret="pi_secret"
          packageName="5 Credits"
          packageAmountLabel="$25.00"
          onCancel={vi.fn()}
          onConfirmed={onConfirmed}
        />,
        { wrapper: createWrapper(createTestQueryClient()) },
      )

      await waitFor(function waitForConfirmed() {
        expect(onConfirmed).toHaveBeenCalledTimes(1)
      })

      // The official Stripe API is used to verify the intent, not redirect_status.
      expect(retrievePaymentIntentMock).toHaveBeenCalledWith('pi_secret')
      // Success transitions to pending fulfillment (webhook grants credits).
      expect(screen.getByText(/credits are being applied/i)).toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    }
  })

  it('does not confirm when a matching URL secret resolves to a canceled intent', async function run() {
    const retrievePaymentIntentMock = vi.fn(async () => ({
      paymentIntent: { status: 'canceled' },
    }))
    const stripe = { retrievePaymentIntent: retrievePaymentIntentMock }
    useStripeMock.mockReturnValue(stripe)
    useElementsMock.mockReturnValue({})
    PaymentElementMock.mockImplementation(function MockPaymentElement(props: {
      onReady?: () => void
    }) {
      React.useEffect(function notifyReady() {
        props.onReady?.()
      }, [])
      return <div data-testid="payment-element">Payment Element</div>
    })
    getStripeLoaderMock.mockReturnValue(Promise.resolve(stripe))

    const originalLocation = window.location
    const fakeLocation = {
      ...originalLocation,
      search:
        '?payment_intent=pi_123&payment_intent_client_secret=pi_secret',
    }
    Object.defineProperty(window, 'location', {
      value: fakeLocation,
      writable: true,
      configurable: true,
    })

    const onConfirmed = vi.fn()
    try {
      render(
        <BillingCheckout
          clientSecret="pi_secret"
          packageName="5 Credits"
          packageAmountLabel="$25.00"
          onCancel={vi.fn()}
          onConfirmed={onConfirmed}
        />,
        { wrapper: createWrapper(createTestQueryClient()) },
      )

      await waitFor(function waitForFailure() {
        expect(screen.getByText(/couldn't process your payment/i)).toBeInTheDocument()
      })

      // A matching URL client secret only proves identity — it does NOT prove
      // success. Never notify the parent or show pending for a non-successful
      // intent.
      expect(retrievePaymentIntentMock).toHaveBeenCalledWith('pi_secret')
      expect(onConfirmed).not.toHaveBeenCalled()
      expect(screen.queryByText(/credits are being applied/i)).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    }
  })

  it('shows failure without retry for a canceled intent return', async function run() {
    const retrievePaymentIntentMock = vi.fn(async () => ({
      paymentIntent: { status: 'canceled' },
    }))
    const stripe = { retrievePaymentIntent: retrievePaymentIntentMock }
    useStripeMock.mockReturnValue(stripe)
    useElementsMock.mockReturnValue({})
    PaymentElementMock.mockImplementation(function MockPaymentElement(props: {
      onReady?: () => void
    }) {
      React.useEffect(function notifyReady() {
        props.onReady?.()
      }, [])
      return <div data-testid="payment-element">Payment Element</div>
    })
    getStripeLoaderMock.mockReturnValue(Promise.resolve(stripe))

    const originalLocation = window.location
    const fakeLocation = {
      ...originalLocation,
      search:
        '?payment_intent=pi_123&payment_intent_client_secret=pi_secret',
    }
    Object.defineProperty(window, 'location', {
      value: fakeLocation,
      writable: true,
      configurable: true,
    })

    const onCancel = vi.fn()
    try {
      render(
        <BillingCheckout
          clientSecret="pi_secret"
          packageName="5 Credits"
          packageAmountLabel="$25.00"
          onCancel={onCancel}
          onConfirmed={vi.fn()}
        />,
        { wrapper: createWrapper(createTestQueryClient()) },
      )

      await waitFor(function waitForFailure() {
        expect(screen.getByText(/couldn't process your payment/i)).toBeInTheDocument()
      })

      // Canceled intents cannot be reconfirmed — no retry affordance.
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
      // User can still cancel to pick another package.
      screen.getByRole('button', { name: /cancel purchase/i }).click()
      expect(onCancel).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    }
  })

  it('shows Cancel purchase and invokes onCancel on setup error', function run() {
    getStripeLoaderMock.mockReturnValue(null)
    const onCancel = vi.fn()

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="5 Credits"
        packageAmountLabel="$25.00"
        onCancel={onCancel}
        onConfirmed={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
    screen.getByRole('button', { name: /cancel purchase/i }).click()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('displays the selected package summary', async function run() {
    useStripeMock.mockReturnValue(null)
    useElementsMock.mockReturnValue(null)
    getStripeLoaderMock.mockReturnValue(Promise.resolve(null))

    render(
      <BillingCheckout
        clientSecret="pi_secret"
        packageName="10 Credits"
        packageAmountLabel="$45.00"
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
      { wrapper: createWrapper(createTestQueryClient()) },
    )

    expect(screen.getByText('10 Credits')).toBeInTheDocument()
    expect(screen.getByText('$45.00')).toBeInTheDocument()
  })
})

describe('isStripeReturn', function stripeReturnDetectionSuite() {
  it('detects a genuine Stripe return matching the active client secret', function run() {
    expect(
      isStripeReturn(
        '?payment_intent=pi_123&payment_intent_client_secret=pi_secret',
        'pi_secret',
      ),
    ).toBe(true)
  })

  it('returns false without a returned client secret', function run() {
    expect(isStripeReturn('?payment_intent=pi_123', 'pi_secret')).toBe(false)
    expect(isStripeReturn('?foo=bar', 'pi_secret')).toBe(false)
    expect(isStripeReturn('', 'pi_secret')).toBe(false)
  })

  it('rejects a returned secret that does not match the active intent', function run() {
    expect(
      isStripeReturn(
        '?payment_intent=pi_123&payment_intent_client_secret=attacker_secret',
        'pi_secret',
      ),
    ).toBe(false)
  })
})
