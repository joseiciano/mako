import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingSmart } from './billing-smart'

const { useAccountMock } = vi.hoisted(function createMocks() {
  return {
    useAccountMock: vi.fn(),
  }
})

vi.mock('#/hooks/use-account', function mockUseAccountModule() {
  return {
    useAccount: useAccountMock,
  }
})

describe('billing-smart query state orchestration', function billingSmartSuite() {
  beforeEach(function resetMocks() {
    useAccountMock.mockReset()
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
