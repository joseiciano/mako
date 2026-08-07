import { render, screen } from '@testing-library/react'
import type { CreditTransaction } from '@mako/shared'
import { describe, expect, it, vi } from 'vitest'
import { BillingDumb } from './billing-dumb'

describe('billing-dumb rendering', function billingDumbSuite() {
  it('renders loading state with accessible status', function run() {
    render(<BillingDumb state="loading" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading billing data...')
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  })

  it('renders error state with alert and retry button', function run() {
    const onRetry = vi.fn()
    render(
      <BillingDumb
        state="error"
        errorMessage="Something went wrong"
        onRetry={onRetry}
        isRetrying={false}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    const retryButton = screen.getByRole('button', { name: /retry/i })
    expect(retryButton).toBeInTheDocument()
    expect(retryButton).not.toBeDisabled()
  })

  it('disables retry button and shows retrying text while isRetrying', function run() {
    render(
      <BillingDumb
        state="error"
        errorMessage="Something went wrong"
        onRetry={vi.fn()}
        isRetrying={true}
      />,
    )

    const retryButton = screen.getByRole('button', { name: /retrying/i })
    expect(retryButton).toBeDisabled()
  })

  it('renders fallback error without retry when onRetry is omitted', function run() {
    render(<BillingDumb state="error" errorMessage="Fallback error" />)

    expect(screen.getByRole('alert')).toHaveTextContent('Fallback error')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders populated balance summary cards', function run() {
    render(
      <BillingDumb
        state="populated"
        account={{
          id: 'u1',
          email: 'a@b.com',
          displayName: 'User',
          credits: 42,
          freeStandardInterviews: 3,
          freeAiInterviews: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
        }}
      />,
    )

    expect(screen.getByText('Credits')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Free Standard Interviews')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Free AI Interviews')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('includes backend-resolved copy for AI interview usage', function run() {
    render(
      <BillingDumb
        state="populated"
        account={{
          id: 'u1',
          email: 'a@b.com',
          displayName: 'User',
          credits: 10,
          freeStandardInterviews: 1,
          freeAiInterviews: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
        }}
      />,
    )

    expect(
      screen.getByText(/free AI interviews are consumed before paid credits/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/resolved server-side according to account policy/i),
    ).toBeInTheDocument()
  })

  it('does not render subscription or plan management copy', function run() {
    render(
      <BillingDumb
        state="populated"
        account={{
          id: 'u1',
          email: 'a@b.com',
          displayName: 'User',
          credits: 10,
          freeStandardInterviews: 1,
          freeAiInterviews: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
        }}
      />,
    )

    expect(screen.queryByText(/subscription/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/plan management/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/choose tier/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/select tier/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/override/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/invoices/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/saved payment methods/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/refunds/i)).not.toBeInTheDocument()
  })

  it('does not render Stripe Elements or purchase controls when no packages', function run() {
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
      />,
    )

    expect(screen.queryByText(/stripe/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /purchase/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buy/i })).not.toBeInTheDocument()
  })

  it('renders packages loading state without blocking balance summary', function run() {
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        packagesLoading={true}
      />,
    )

    expect(screen.getByText('Credits')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading credit packages...')
  })

  it('renders package error state with retry for packages only', function run() {
    const onRetryPackages = vi.fn()
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        packagesError="Payments are unavailable"
        onRetryPackages={onRetryPackages}
        isRetryingPackages={false}
      />,
    )

    expect(screen.getByText('Credits')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Payments are unavailable')
    const retryButton = screen.getByRole('button', { name: /retry packages/i })
    expect(retryButton).toBeInTheDocument()
    expect(retryButton).not.toBeDisabled()
  })

  it('renders each package with amount and credits', function run() {
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        packages={packagesFixture()}
      />,
    )

    expect(screen.getByText('5 Credits')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument()
    expect(screen.getByText('10 Credits')).toBeInTheDocument()
    expect(screen.getByText('$45.00')).toBeInTheDocument()
  })

  it('selects a package via single-select radio semantics', function run() {
    const onSelectPackage = vi.fn()
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        packages={packagesFixture()}
        onSelectPackage={onSelectPackage}
      />,
    )

    const firstRadio = screen.getByRole('radio', { name: /select 5 credits/i })
    firstRadio.click()

    expect(onSelectPackage).toHaveBeenCalledWith('credits_5')
  })

  it('disables purchase until a package is selected', function run() {
    const onPurchase = vi.fn()
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        packages={packagesFixture()}
        onPurchase={onPurchase}
      />,
    )

    const purchaseButton = screen.getByRole('button', { name: /start purchase/i })
    expect(purchaseButton).toBeDisabled()

    purchaseButton.click()
    expect(onPurchase).not.toHaveBeenCalled()
  })

  it('shows selected state and enables purchase when a package is selected', function run() {
    const onPurchase = vi.fn()
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        packages={packagesFixture()}
        selectedPackageId="credits_10"
        onPurchase={onPurchase}
        onSelectPackage={vi.fn()}
      />,
    )

    const selectedRadio = screen.getByRole('radio', { name: /select 10 credits/i })
    expect(selectedRadio).toBeChecked()

    const purchaseButton = screen.getByRole('button', { name: /start purchase/i })
    expect(purchaseButton).not.toBeDisabled()

    purchaseButton.click()
    expect(onPurchase).toHaveBeenCalled()
  })

  it('disables purchase while create-intent is in flight', function run() {
    const onPurchase = vi.fn()
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        packages={packagesFixture()}
        selectedPackageId="credits_5"
        isPurchasing={true}
        onPurchase={onPurchase}
      />,
    )

    const purchaseButton = screen.getByRole('button', { name: /starting purchase/i })
    expect(purchaseButton).toBeDisabled()

    purchaseButton.click()
    expect(onPurchase).not.toHaveBeenCalled()
  })

  it('surfaces purchase error messaging', function run() {
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        packages={packagesFixture()}
        selectedPackageId="credits_5"
        purchaseError="Unable to start your purchase."
        onPurchase={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to start your purchase.')
  })

  it('locks package selection and hides purchase controls during active checkout', function run() {
    const checkoutRender = vi.fn(function renderCheckout() {
      return <div data-testid="active-checkout">Checkout</div>
    })
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        packages={packagesFixture()}
        selectedPackageId="credits_5"
        onSelectPackage={vi.fn()}
        onPurchase={vi.fn()}
        renderCheckout={checkoutRender}
      />,
    )

    // All radios disabled and labelled as locked.
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    for (const radio of radios) {
      expect(radio).toBeDisabled()
    }
    expect(screen.getAllByText('Locked during checkout')).toHaveLength(2)

    // No Start purchase control during checkout.
    expect(
      screen.queryByRole('button', { name: /start purchase/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /starting purchase/i }),
    ).not.toBeInTheDocument()

    // Package cards carry the exact locked-presentation class (cursor-default).
    const labels = screen.getAllByRole('radio').map(function labelFor(radio) {
      return radio.closest('label')
    })
    for (const label of labels) {
      expect(label).toHaveClass('cursor-default')
    }

    // The checkout itself renders in place of the purchase controls.
    expect(screen.getByTestId('active-checkout')).toBeInTheDocument()
  })

  it('shows transaction history loading state without hiding balance summary', function run() {
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        transactionsLoading={true}
      />,
    )

    expect(screen.getByText('Credits')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading transaction history...')
  })

  it('shows transaction history error state with retry for history only', function run() {
    const onRetryTransactions = vi.fn()
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        transactionsError="History is unavailable"
        onRetryTransactions={onRetryTransactions}
        isRetryingTransactions={false}
      />,
    )

    expect(screen.getByText('Credits')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('History is unavailable')
    const retryButton = screen.getByRole('button', { name: /retry history/i })
    expect(retryButton).toBeInTheDocument()
    expect(retryButton).not.toBeDisabled()
  })

  it('disables history retry button while refetching', function run() {
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        transactionsError="History is unavailable"
        onRetryTransactions={vi.fn()}
        isRetryingTransactions={true}
      />,
    )

    const retryButton = screen.getByRole('button', { name: /retrying/i })
    expect(retryButton).toBeDisabled()
  })

  it('renders empty history state for users without credit purchases', function run() {
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        transactions={[]}
        transactionsTotal={0}
      />,
    )

    expect(screen.getByRole('heading', { name: /transaction history/i })).toBeInTheDocument()
    expect(
      screen.getByText(/no credit purchases yet/i),
    ).toBeInTheDocument()
  })

  it('renders transaction rows with amount, credits granted, status, and creation time', function run() {
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        transactions={transactionsFixture()}
        transactionsTotal={2}
      />,
    )

    expect(screen.getByText('$15.00')).toBeInTheDocument()
    expect(screen.getByText('$10.00')).toBeInTheDocument()
    expect(screen.getByText('150 credits')).toBeInTheDocument()
    expect(screen.getByText('100 credits')).toBeInTheDocument()
    expect(screen.getByText('Succeeded')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    // Creation times rendered from created_at in a stable UTC format.
    expect(screen.getByText('Jun 24, 2026')).toBeInTheDocument()
    expect(screen.getByText('Jun 22, 2026')).toBeInTheDocument()
    // Total shown alongside the history heading.
    expect(screen.getByText('2 total')).toBeInTheDocument()
  })

  it('does not render internal Stripe control-flow fields from transaction mock data', function run() {
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        transactions={
          // Unsafe mock: simulates an unsanitized backend payload that leaks an
          // internal Stripe identifier. The shared schema strips these fields,
          // but the dumb component must ALSO never render them defensively.
          [
            {
              id: '33333333-3333-4333-8333-333333333333',
              stripe_payment_intent_id: 'pi_333_secret',
              amount: 1500,
              credits_granted: 150,
              status: 'succeeded',
              created_at: '2026-06-24T12:00:00.000Z',
            } as CreditTransaction,
          ]
        }
        transactionsTotal={1}
      />,
    )

    expect(screen.getByText('$15.00')).toBeInTheDocument()
    expect(screen.queryByText(/pi_333_secret/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/stripe_payment_intent_id/i)).not.toBeInTheDocument()
  })

  it('does not render checkout or package controls from transaction data', function run() {
    render(
      <BillingDumb
        state="populated"
        account={accountFixture()}
        transactions={transactionsFixture()}
        transactionsTotal={2}
      />,
    )

    // A history-only render must never surface payment intent fields or controls.
    expect(screen.queryByText(/payment intent/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/client_secret/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pi_/i)).not.toBeInTheDocument()
  })
})

function transactionsFixture() {
  return [
    {
      id: '33333333-3333-4333-8333-333333333333',
      amount: 1500,
      credits_granted: 150,
      status: 'succeeded',
      created_at: '2026-06-24T12:00:00.000Z',
    },
    {
      id: '11111111-1111-4111-8111-111111111111',
      amount: 1000,
      credits_granted: 100,
      status: 'pending',
      created_at: '2026-06-22T12:00:00.000Z',
    },
  ]
}

function accountFixture() {
  return {
    id: 'u1',
    email: 'a@b.com',
    displayName: 'User',
    credits: 10,
    freeStandardInterviews: 1,
    freeAiInterviews: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
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
