import { render, screen, act } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingSmart } from './billing-smart'

const {
  useAccountMock,
  useCreditPackagesMock,
  useCreatePaymentIntentMock,
  BillingCheckoutMock,
} = vi.hoisted(function createMocks() {
  return {
    useAccountMock: vi.fn(),
    useCreditPackagesMock: vi.fn(),
    useCreatePaymentIntentMock: vi.fn(),
    BillingCheckoutMock: vi.fn(),
  }
})

vi.mock('#/hooks/use-account', function mockUseAccountModule() {
  return {
    useAccount: useAccountMock,
  }
})

vi.mock('#/hooks/use-payments', function mockUsePaymentsModule() {
  return {
    useCreditPackages: useCreditPackagesMock,
    useCreatePaymentIntent: useCreatePaymentIntentMock,
  }
})

vi.mock('./billing-checkout-smart', function mockBillingCheckoutModule() {
  return {
    BillingCheckout: BillingCheckoutMock,
  }
})

describe('billing-smart query state orchestration', function billingSmartSuite() {
  beforeEach(function resetMocks() {
    window.sessionStorage.clear()
    useAccountMock.mockReset()
    useCreditPackagesMock.mockReset()
    useCreatePaymentIntentMock.mockReset()
    BillingCheckoutMock.mockReset()
    BillingCheckoutMock.mockImplementation(function MockCheckout(props) {
      return (
        <div data-testid="billing-checkout-mock">
          <button type="button" onClick={props.onCancel}>
            Cancel purchase
          </button>
          <button type="button" onClick={props.onConfirmed}>
            Confirm payment
          </button>
          <span>Checkout for {props.packageName}</span>
        </div>
      )
    })

    mockPackageQuery({
      data: { packages: packagesFixture() },
    })
    useCreatePaymentIntentMock.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      mutate: vi.fn(),
    })
  })

  it('renders loading state while account query is pending', function run() {
    mockAccountQuery({
      isPending: true,
    })

    const html = renderToString(<BillingSmart />)

    expect(html).toContain('Loading billing data...')
  })

  it('renders populated state from successful query results', function run() {
    mockAccountQuery({
      data: createAccountFixture({
        credits: 42,
        freeStandardInterviews: 3,
        freeAiInterviews: 2,
      }),
    })

    const html = renderToString(<BillingSmart />)

    expect(html).toContain('Credits')
    expect(html).toContain('Free Standard Interviews')
    expect(html).toContain('Free AI Interviews')
    expect(html).toMatch(/Credits<\/dt>\s*<dd[^>]*>\s*42\s*<\/dd>/)
    expect(html).toMatch(/Free Standard Interviews<\/dt>\s*<dd[^>]*>\s*3\s*<\/dd>/)
    expect(html).toMatch(/Free AI Interviews<\/dt>\s*<dd[^>]*>\s*2\s*<\/dd>/)
  })

  it('renders error state when account query fails', function run() {
    mockAccountQuery({
      isError: true,
      error: new Error('Account lookup failed'),
    })

    const html = renderToString(<BillingSmart />)

    expect(html).toContain('Account lookup failed')
  })

  it('renders fallback error when query settles without data', function run() {
    mockAccountQuery({
      data: undefined,
    })

    const html = renderToString(<BillingSmart />)

    expect(html).toContain('Unable to load billing balances.')
  })

  it('passes retry callback and retrying state on error', function run() {
    const refetch = vi.fn()
    mockAccountQuery({
      isError: true,
      error: new Error('Network error'),
      refetch,
      isFetching: false,
    })

    render(<BillingSmart />)

    expect(screen.getByRole('alert')).toHaveTextContent('Network error')
    const retryButton = screen.getByRole('button', { name: /retry/i })
    expect(retryButton).toBeInTheDocument()
    expect(retryButton).not.toBeDisabled()
  })

  it('disables retry button while refetching', function run() {
    mockAccountQuery({
      isError: true,
      error: new Error('Network error'),
      refetch: vi.fn(),
      isFetching: true,
    })

    render(<BillingSmart />)

    const retryButton = screen.getByRole('button', { name: /retrying/i })
    expect(retryButton).toBeDisabled()
  })

  it('renders credit packages from the packages query', function run() {
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    expect(screen.getByText('5 Credits')).toBeInTheDocument()
    expect(screen.getByText('10 Credits')).toBeInTheDocument()
  })

  it('does not block balance summary when packages are loading', function run() {
    mockAccountQuery({ data: createAccountFixture() })
    mockPackageQuery({ isPending: true })

    render(<BillingSmart />)

    expect(screen.getByText('Credits')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading credit packages...')
  })

  it('surfaces package error independently of balance', function run() {
    mockAccountQuery({ data: createAccountFixture() })
    mockPackageQuery({
      isError: true,
      error: new Error('Payments are unavailable'),
    })

    render(<BillingSmart />)

    expect(screen.getByText('Credits')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Payments are unavailable')
  })

  it('calls create-intent with selected package_id on purchase', function run() {
    const mutate = vi.fn()
    useCreatePaymentIntentMock.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      mutate,
    })
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    const firstRadio = screen.getByRole('radio', { name: /select 5 credits/i })
    firstRadio.click()

    const purchaseButton = screen.getByRole('button', { name: /start purchase/i })
    expect(purchaseButton).not.toBeDisabled()
    purchaseButton.click()

    expect(mutate).toHaveBeenCalledWith(
      { package_id: 'credits_5' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('does not call create-intent without a selected package', function run() {
    const mutate = vi.fn()
    useCreatePaymentIntentMock.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      mutate,
    })
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    const purchaseButton = screen.getByRole('button', { name: /start purchase/i })
    expect(purchaseButton).toBeDisabled()
    purchaseButton.click()

    expect(mutate).not.toHaveBeenCalled()
  })

  it('blocks duplicate purchase while create-intent is pending', function run() {
    const mutate = vi.fn()
    useCreatePaymentIntentMock.mockReturnValue({
      isPending: true,
      isError: false,
      error: null,
      mutate,
    })
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    const purchaseButton = screen.getByRole('button', { name: /starting purchase/i })
    expect(purchaseButton).toBeDisabled()
    purchaseButton.click()

    expect(mutate).not.toHaveBeenCalled()
  })

  it('stores client secret and renders checkout after create-intent', function run() {
    let capturedOnSuccess: (result: { client_secret: string }) => void = () => {}
    useCreatePaymentIntentMock.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      mutate: vi.fn(function implement(_payload, options) {
        capturedOnSuccess = options!.onSuccess as (result: {
          client_secret: string
        }) => void
      }),
    })
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    const firstRadio = screen.getByRole('radio', { name: /select 5 credits/i })
    firstRadio.click()
    screen.getByRole('button', { name: /start purchase/i }).click()

    act(function triggerSuccess() {
      capturedOnSuccess({ client_secret: 'pi_secret' })
    })

    expect(screen.getByTestId('billing-checkout-mock')).toBeInTheDocument()
    const checkoutCallArgs = BillingCheckoutMock.mock.calls[0]?.[0]
    expect(checkoutCallArgs).toEqual(
      expect.objectContaining({
        clientSecret: 'pi_secret',
        packageName: '5 Credits',
        packageAmountLabel: '$25.00',
      }),
    )
    // Checkout locks package selection; radios become disabled.
    expect(firstRadio).toBeDisabled()
    expect(screen.queryByRole('button', { name: /start purchase/i })).not.toBeInTheDocument()
  })

  it('cancels checkout and unlocks package selection', function run() {
    let capturedOnSuccess: (result: { client_secret: string }) => void = () => {}
    useCreatePaymentIntentMock.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      mutate: vi.fn(function implement(_payload, options) {
        capturedOnSuccess = options!.onSuccess as (result: {
          client_secret: string
        }) => void
      }),
    })
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    screen.getByRole('radio', { name: /select 5 credits/i }).click()
    screen.getByRole('button', { name: /start purchase/i }).click()

    act(function triggerSuccess() {
      capturedOnSuccess({ client_secret: 'pi_secret' })
    })

    expect(screen.getByTestId('billing-checkout-mock')).toBeInTheDocument()

    act(function cancelCheckout() {
      screen.getByRole('button', { name: /cancel purchase/i }).click()
    })

    expect(screen.queryByTestId('billing-checkout-mock')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start purchase/i })).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /select 5 credits/i }),
    ).not.toBeDisabled()
  })

  it('clears the stored result when a different package is re-selected', function run() {
    let capturedOnSuccess: (result: { client_secret: string }) => void = () => {}
    useCreatePaymentIntentMock.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      mutate: vi.fn(function implement(_payload, options) {
        capturedOnSuccess = options!.onSuccess as (result: {
          client_secret: string
        }) => void
      }),
    })
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    // Select and create intent for 5 credits; checkout renders and locks selection.
    const firstRadio = screen.getByRole('radio', { name: /select 5 credits/i })
    firstRadio.click()
    screen.getByRole('button', { name: /start purchase/i }).click()

    act(function triggerSuccess() {
      capturedOnSuccess({ client_secret: 'pi_secret' })
    })

    expect(screen.getByTestId('billing-checkout-mock')).toBeInTheDocument()

    // Cancel checkout so selection unlocks, then select a different package.
    act(function cancelCheckout() {
      screen.getByRole('button', { name: /cancel purchase/i }).click()
    })

    const secondRadio = screen.getByRole('radio', { name: /select 10 credits/i })
    act(function reSelect() {
      secondRadio.click()
    })

    expect(screen.queryByTestId('billing-checkout-mock')).not.toBeInTheDocument()
    expect(BillingCheckoutMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces purchase failure messaging', function run() {
    useCreatePaymentIntentMock.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('Unable to start your purchase.'),
      mutate: vi.fn(),
    })
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to start your purchase.')
  })

  it('restores checkout from a persisted purchase draft', function run() {
    // Simulate returning from a 3DS redirect: the previous draft is in
    // sessionStorage, so the checkout should remount without re-selecting.
    window.sessionStorage.setItem(
      'mako.billing.purchase',
      JSON.stringify({ packageId: 'credits_10', clientSecret: 'pi_restored' }),
    )
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    expect(screen.getByTestId('billing-checkout-mock')).toBeInTheDocument()
    const checkoutCallArgs = BillingCheckoutMock.mock.calls[0]?.[0]
    expect(checkoutCallArgs).toEqual(
      expect.objectContaining({ clientSecret: 'pi_restored' }),
    )
    const tenCreditsRadio = screen.getByRole('radio', { name: /select 10 credits/i })
    expect(tenCreditsRadio).toBeChecked()
    expect(tenCreditsRadio).toBeDisabled() // locked during checkout
  })

  it('reads the persisted purchase draft from sessionStorage exactly once per mount', function run() {
    window.sessionStorage.setItem(
      'mako.billing.purchase',
      JSON.stringify({ packageId: 'credits_10', clientSecret: 'pi_restored' }),
    )
    mockAccountQuery({ data: createAccountFixture() })
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')

    const { rerender } = render(<BillingSmart />)
    // A query/state-driven re-render must NOT re-read the draft:
    // readPurchaseDraft() should be evaluated once on mount (lazy initializer).
    rerender(<BillingSmart />)
    rerender(<BillingSmart />)

    expect(getItemSpy).toHaveBeenCalledTimes(1)
    getItemSpy.mockRestore()
  })

  it('clears the persisted draft when checkout is cancelled', function run() {
    window.sessionStorage.setItem(
      'mako.billing.purchase',
      JSON.stringify({ packageId: 'credits_5', clientSecret: 'pi_restored' }),
    )
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    expect(screen.getByTestId('billing-checkout-mock')).toBeInTheDocument()

    act(function cancelCheckout() {
      screen.getByRole('button', { name: /cancel purchase/i }).click()
    })

    expect(window.sessionStorage.getItem('mako.billing.purchase')).toBeNull()
    expect(screen.queryByTestId('billing-checkout-mock')).not.toBeInTheDocument()
  })

  it('clears the persisted draft on payment confirmation but keeps checkout visible', function run() {
    window.sessionStorage.setItem(
      'mako.billing.purchase',
      JSON.stringify({ packageId: 'credits_5', clientSecret: 'pi_restored' }),
    )
    mockAccountQuery({ data: createAccountFixture() })

    render(<BillingSmart />)

    expect(screen.getByTestId('billing-checkout-mock')).toBeInTheDocument()

    act(function confirmPayment() {
      screen.getByRole('button', { name: /confirm payment/i }).click()
    })

    // The spent draft is dropped so a later remount never re-offers it, but the
    // in-memory checkout stays mounted to keep the pending-fulfillment UI.
    expect(window.sessionStorage.getItem('mako.billing.purchase')).toBeNull()
    expect(screen.getByTestId('billing-checkout-mock')).toBeInTheDocument()
  })
})

function mockAccountQuery(overrides: Record<string, unknown>) {
  useAccountMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    ...overrides,
  })
}

function mockPackageQuery(overrides: Record<string, unknown>) {
  useCreditPackagesMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    ...overrides,
  })
}

function createAccountFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'demo@mako.dev',
    displayName: 'Demo Candidate',
    credits: 8,
    freeStandardInterviews: 1,
    freeAiInterviews: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function packagesFixture() {
  return [
    {
      package_id: 'credits_5',
      display_name: '5 Credits',
      amount_cents: 2500,
      credits_granted: 5,
    },
    {
      package_id: 'credits_10',
      display_name: '10 Credits',
      amount_cents: 4500,
      credits_granted: 10,
    },
  ]
}
