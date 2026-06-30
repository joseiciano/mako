import { render, screen } from '@testing-library/react'
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

  it('does not render Stripe Elements or purchase controls', function run() {
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

    expect(screen.queryByText(/stripe/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /purchase/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buy/i })).not.toBeInTheDocument()
  })
})
