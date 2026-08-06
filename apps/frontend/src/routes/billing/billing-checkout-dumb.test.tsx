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

  it('shows Cancel purchase and invokes onCancel on setup error', function run() {
    const onCancel = vi.fn()

    render(
      <BillingCheckoutDumb
        {...baseProps}
        status="setup-error"
        onCancel={onCancel}
      />,
    )

    screen.getByRole('button', { name: /cancel purchase/i }).click()
    expect(onCancel).toHaveBeenCalledTimes(1)
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

  it('keeps the same Payment Element DOM node mounted across ready -> failed -> ready', function run() {
    const { container, rerender } = render(
      <BillingCheckoutDumb {...baseProps} status="ready" />,
    )

    const readyNode = container.querySelector('[data-testid="payment-element"]')
    expect(readyNode).not.toBeNull()

    // Transition into the failed state. The Payment Element must stay mounted
    // (real Stripe only fires onReady once on mount), so the SAME DOM node must
    // still be present — not unmounted and remounted.
    rerender(<BillingCheckoutDumb {...baseProps} status="failed" />)
    expect(container.querySelector('[data-testid="payment-element"]')).toBe(readyNode)

    // Retry returns to ready. The confirm button reappears and the element node
    // is unchanged, proving the confirm flow does not rely on a remount to work.
    rerender(<BillingCheckoutDumb {...baseProps} status="ready" />)
    expect(container.querySelector('[data-testid="payment-element"]')).toBe(readyNode)
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

  it('renders canceled failure without retry but with cancellation', function run() {
    const onRetry = vi.fn()
    const onCancel = vi.fn()

    render(
      <BillingCheckoutDumb
        {...baseProps}
        status="canceled"
        onRetry={onRetry}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't process your payment/i)
    // Canceled intents cannot be reconfirmed — no retry affordance.
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    // User can still cancel to pick another package.
    screen.getByRole('button', { name: /cancel purchase/i }).click()
    expect(onCancel).toHaveBeenCalledTimes(1)
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
