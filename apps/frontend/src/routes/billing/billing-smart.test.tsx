import { render, screen, act } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingSmart } from './billing-smart'

const { useAccountMock, useCreditPackagesMock, useCreatePaymentIntentMock } =
  vi.hoisted(function createMocks() {
    return {
      useAccountMock: vi.fn(),
      useCreditPackagesMock: vi.fn(),
      useCreatePaymentIntentMock: vi.fn(),
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

describe('billing-smart query state orchestration', function billingSmartSuite() {
  beforeEach(function resetMocks() {
    useAccountMock.mockReset()
    useCreditPackagesMock.mockReset()
    useCreatePaymentIntentMock.mockReset()

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

  it('stores client secret and reports success after create-intent', function run() {
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

    expect(screen.getByText(/payment intent created/i)).toBeInTheDocument()
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

    const firstRadio = screen.getByRole('radio', { name: /select 5 credits/i })
    firstRadio.click()
    screen.getByRole('button', { name: /start purchase/i }).click()

    act(function triggerSuccess() {
      capturedOnSuccess({ client_secret: 'pi_secret' })
    })

    expect(screen.getByText(/payment intent created/i)).toBeInTheDocument()

    const secondRadio = screen.getByRole('radio', { name: /select 10 credits/i })
    act(function reSelect() {
      secondRadio.click()
    })

    expect(screen.queryByText(/payment intent created/i)).not.toBeInTheDocument()
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
