import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BillingCheckoutDumb } from './billing-checkout-dumb'

const baseProps = {
  packageName: '5 Credits',
  packageAmountLabel: '$25.00',
  isConfirmDisabled: true,
  isConfirming: false,
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
  onRefreshBalance: vi.fn(async () => {}),
  onRetry: vi.fn(),
  renderPaymentElement: () => <div data-testid="payment-element">Payment Element</div>,
}

describe('billing-checkout-dumb presentation', function billingCheckoutDumbSuite() {
  it('renders setup error when Stripe is unconfigured', function run() {
    render(
      <BillingCheckoutDumb
        {...baseProps}
        status="setup-error"
        message="Checkout unavailable"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Checkout unavailable')
  })

  it('renders loading state during checkout initialization', function run() {
    render(<BillingCheckoutDumb {...baseProps} status="initializing" />)

    expect(screen.getByRole('status')).toHaveTextContent(/preparing secure checkout/i)
  })

  it('shows confirming state and displays selected package summary', function run() {
    render(<BillingCheckoutDumb {...baseProps} status="confirming" isConfirming={true} />)

    expect(screen.getByText(/confirming your payment/i)).toBeInTheDocument()
    expect(screen.getByText('5 Credits')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument()
  })

  it('renders the Payment Element and confirm button in ready state', function run() {
    render(<BillingCheckoutDumb {...baseProps} status="ready" />)

    expect(screen.getByTestId('payment-element')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeInTheDocument()
  })

  it('disables confirm button until checkout is ready', function run() {
    render(
      <BillingCheckoutDumb
        {...baseProps}
        status="ready"
        isConfirmDisabled={true}
      />,
    )

    expect(screen.getByRole('button', { name: /confirm & pay/i })).toBeDisabled()
  })

  it('renders pending fulfillment with manual refresh affordance', function run() {
    const onRefreshBalance = vi.fn(async () => {})

    render(
      <BillingCheckoutDumb
        {...baseProps}
        status="pending-fulfillment"
        onRefreshBalance={onRefreshBalance}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/credits are being applied/i)
    const refreshButton = screen.getByRole('button', { name: /check balance now/i })
    expect(refreshButton).toBeInTheDocument()
    refreshButton.click()
    expect(onRefreshBalance).toHaveBeenCalled()
  })

  it('renders failure state with retry and cancellation affordances', function run() {
    const onRetry = vi.fn()
    const onCancel = vi.fn()

    render(
      <BillingCheckoutDumb
        {...baseProps}
        status="failed"
        onRetry={onRetry}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't process your payment/i)
    const retryButton = screen.getByRole('button', { name: /try again/i })
    retryButton.click()
    expect(onRetry).toHaveBeenCalled()

    screen.getByRole('button', { name: /cancel purchase/i }).click()
    expect(onCancel).toHaveBeenCalled()
  })

  it('focuses the status region when transitioning into failed status', function run() {
    const { rerender } = render(<BillingCheckoutDumb {...baseProps} status="ready" />)

    rerender(<BillingCheckoutDumb {...baseProps} status="failed" />)

    expect(screen.getByTestId('checkout-status-region')).toHaveFocus()
  })

  it('focuses the status region when transitioning into pending fulfillment', function run() {
    const { rerender } = render(<BillingCheckoutDumb {...baseProps} status="ready" />)

    rerender(<BillingCheckoutDumb {...baseProps} status="pending-fulfillment" />)

    expect(screen.getByTestId('checkout-status-region')).toHaveFocus()
  })

  it('does not move focus when initially rendered in a target status', function run() {
    render(<BillingCheckoutDumb {...baseProps} status="failed" />)

    expect(screen.getByTestId('checkout-status-region')).not.toHaveFocus()
  })

  it('does not move focus for a non-target status transition', function run() {
    const { rerender } = render(<BillingCheckoutDumb {...baseProps} status="initializing" />)

    rerender(<BillingCheckoutDumb {...baseProps} status="ready" />)

    expect(screen.queryByTestId('checkout-status-region')).not.toBeInTheDocument()
  })
})
