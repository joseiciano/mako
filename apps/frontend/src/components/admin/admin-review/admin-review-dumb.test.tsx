import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminReviewDetailDumb, type AdminReviewDetailDumbProps } from './admin-review-detail-dumb'
import { AdminReviewListDumb, type AdminReviewListDumbProps } from './admin-review-list-dumb'

const application = {
  applicationId: '11111111-1111-4111-8111-111111111111',
  applicant: {
    userId: '33333333-3333-4333-8333-333333333333',
    name: 'Alice',
    email: 'alice@example.com',
    isAccountDeleted: false,
  },
  employmentHistory: [
    {
      sourceCompanyId: null,
      company: 'acme',
      role: 'Engineer',
      start: '2020-01-01',
      end: null,
    },
  ],
  status: 'pending' as const,
  reviewedBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  reviewedAt: null,
}

function listProps(overrides: Partial<AdminReviewListDumbProps> = {}): AdminReviewListDumbProps {
  return {
    status: 'pending',
    onStatusChange: vi.fn(),
    applications: [],
    isLoading: false,
    errorMessage: null,
    onRetry: vi.fn(),
    selectedApplicationId: null,
    onSelect: vi.fn(),
    offset: 0,
    hasMore: false,
    onPreviousPage: vi.fn(),
    onNextPage: vi.fn(),
    ...overrides,
  }
}

function detailProps(
  overrides: Partial<AdminReviewDetailDumbProps> = {},
): AdminReviewDetailDumbProps {
  return {
    hasSelection: true,
    application,
    isLoading: false,
    errorMessage: null,
    onRetry: vi.fn(),
    pendingDecision: null,
    isSubmitting: false,
    submitErrorMessage: null,
    onRequestDecision: vi.fn(),
    onCancelDecision: vi.fn(),
    onConfirmDecision: vi.fn(),
    ...overrides,
  }
}

describe('AdminReviewListDumb', function suite() {
  it('offers exactly pending, approved and rejected filters', function run() {
    render(<AdminReviewListDumb {...listProps()} />)

    const options = screen.getAllByRole('option').map(function text(option) {
      return option.textContent
    })
    expect(options).toEqual(['pending', 'approved', 'rejected'])
  })

  it('renders loading, empty and error states', function run() {
    const { rerender } = render(<AdminReviewListDumb {...listProps({ isLoading: true })} />)
    expect(screen.getByText('Loading applications...')).toBeInTheDocument()

    rerender(<AdminReviewListDumb {...listProps()} />)
    expect(screen.getByText('No pending applications.')).toBeInTheDocument()

    const onRetry = vi.fn()
    rerender(<AdminReviewListDumb {...listProps({ errorMessage: 'Nope', onRetry })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('calls onSelect for a clicked summary and flags deleted accounts', function run() {
    const onSelect = vi.fn()
    const summary = {
      applicationId: application.applicationId,
      applicant: { ...application.applicant, isAccountDeleted: true },
      status: 'pending' as const,
      createdAt: application.createdAt,
      reviewedAt: null,
    }
    render(<AdminReviewListDumb {...listProps({ applications: [summary], onSelect })} />)

    expect(screen.getByText(/account deleted/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Alice'))
    expect(onSelect).toHaveBeenCalledWith(application.applicationId)
  })
})

describe('AdminReviewDetailDumb', function suite() {
  it('renders placeholder, loading and error states', function run() {
    const { rerender } = render(<AdminReviewDetailDumb {...detailProps({ hasSelection: false })} />)
    expect(screen.getByText('Select an application to review.')).toBeInTheDocument()

    rerender(<AdminReviewDetailDumb {...detailProps({ isLoading: true })} />)
    expect(screen.getByText('Loading application...')).toBeInTheDocument()

    rerender(<AdminReviewDetailDumb {...detailProps({ application: null, errorMessage: 'Bad' })} />)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders employment history and requests decisions', function run() {
    const onRequestDecision = vi.fn()
    render(<AdminReviewDetailDumb {...detailProps({ onRequestDecision })} />)

    expect(screen.getByText(/Engineer at acme/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(onRequestDecision).toHaveBeenCalledWith('rejected')
  })

  it('shows a confirmation with in-flight disabled state', function run() {
    render(
      <AdminReviewDetailDumb {...detailProps({ pendingDecision: 'rejected', isSubmitting: true })} />,
    )

    expect(screen.getByText(/Are you sure you want to reject/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('disables approve but not reject for deleted applicants', function run() {
    render(
      <AdminReviewDetailDumb
        {...detailProps({
          application: { ...application, applicant: { ...application.applicant, isAccountDeleted: true } },
        })}
      />,
    )

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
  })

  it('hides decision actions for already decided applications', function run() {
    render(
      <AdminReviewDetailDumb {...detailProps({ application: { ...application, status: 'approved' } })} />,
    )

    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })
})
