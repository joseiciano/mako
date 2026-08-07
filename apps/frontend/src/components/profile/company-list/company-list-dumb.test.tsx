// @vitest-environment jsdom

import type { EmploymentRecordCompatibilityResponse } from '@mako/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompanyListDumb, formatDateRange } from './company-list-dumb'
import type { CompanyListDumbProps } from './types'

afterEach(function cleanupAfterTest() {
  cleanup()
})

function createCompany(
  overrides: Partial<EmploymentRecordCompatibilityResponse> = {},
): EmploymentRecordCompatibilityResponse {
  return {
    id: 'company-id',
    userId: 'user-id',
    company: 'mako',
    role: 'Software Engineer',
    start: '2022-01-15',
    end: '2024-03-01',
    isComplete: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    joined: '2022-01-15T00:00:00.000Z',
    ...overrides,
  }
}

function createProps(
  overrides: Partial<CompanyListDumbProps> = {},
): CompanyListDumbProps {
  return {
    companies: [],
    isLoading: false,
    isError: false,
    errorMessage: null,
    isAddModalOpen: false,
    isEditModalOpen: false,
    companyName: '',
    role: '',
    startDate: '',
    endDate: '',
    isCurrentRole: false,
    isSubmitting: false,
    isDeleting: false,
    submitErrorMessage: null,
    deleteErrorMessage: null,
    deleteTarget: null,
    onCompanyNameChange: vi.fn(),
    onRoleChange: vi.fn(),
    onStartDateChange: vi.fn(),
    onEndDateChange: vi.fn(),
    onCurrentRoleChange: vi.fn(),
    onOpenAddModal: vi.fn(),
    onCloseAddModal: vi.fn(),
    onOpenEditModal: vi.fn(),
    onCloseEditModal: vi.fn(),
    onSubmitAddCompany: vi.fn(),
    onSubmitEditCompany: vi.fn(),
    onRequestDelete: vi.fn(),
    onConfirmDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    ...overrides,
  }
}

describe('CompanyListDumb', function companyListDumbSuite() {
  it('renders a complete record with company, role, and date range', function shouldRenderCompleteRecord() {
    render(
      <CompanyListDumb
        {...createProps({
          companies: [createCompany()],
        })}
      />,
    )

    expect(screen.getByText('mako')).toBeTruthy()
    expect(screen.getByText('Software Engineer')).toBeTruthy()
    expect(screen.getByText('2022-01-15 — 2024-03-01')).toBeTruthy()
  })

  it('renders an incomplete record with Needs details', function shouldRenderNeedsDetails() {
    render(
      <CompanyListDumb
        {...createProps({
          companies: [
            createCompany({
              role: null,
              isComplete: false,
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText('Needs details')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit mako' })).toBeTruthy()
  })

  it('renders Present for a current role', function shouldRenderPresentForCurrentRole() {
    render(
      <CompanyListDumb
        {...createProps({
          companies: [
            createCompany({
              end: null,
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText('2022-01-15 — Present')).toBeTruthy()
  })

  it('renders the end date for a past role', function shouldRenderPastRole() {
    render(
      <CompanyListDumb
        {...createProps({
          companies: [createCompany()],
        })}
      />,
    )

    expect(screen.getByText('2022-01-15 — 2024-03-01')).toBeTruthy()
  })

  it('renders the loading state', function shouldRenderLoadingState() {
    render(
      <CompanyListDumb
        {...createProps({
          isLoading: true,
        })}
      />,
    )

    expect(screen.getByText('Loading company history...')).toBeTruthy()
  })

  it('renders the empty state', function shouldRenderEmptyState() {
    render(<CompanyListDumb {...createProps()} />)

    expect(screen.getByText('No company history yet. Add your first company.')).toBeTruthy()
  })

  it('renders the error state', function shouldRenderErrorState() {
    render(
      <CompanyListDumb
        {...createProps({
          isError: true,
          errorMessage: 'Failed to load',
        })}
      />,
    )

    expect(screen.getByText('Failed to load')).toBeTruthy()
  })

  it('renders add modal form fields', function shouldRenderAddModalFields() {
    render(
      <CompanyListDumb
        {...createProps({
          isAddModalOpen: true,
        })}
      />,
    )

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Company')).toBeTruthy()
    expect(screen.getByLabelText('Role')).toBeTruthy()
    expect(screen.getByLabelText('Start Date')).toBeTruthy()
    expect(screen.getByLabelText('End Date')).toBeTruthy()
    expect(screen.getByLabelText('Current role')).toBeTruthy()
  })

  it('pre-fills the edit modal with the selected company', function shouldPreFillEditModal() {
    render(
      <CompanyListDumb
        {...createProps({
          isEditModalOpen: true,
          companyName: 'mako',
          role: 'Software Engineer',
          startDate: '2022-01-15',
          endDate: '2024-03-01',
          isCurrentRole: false,
        })}
      />,
    )

    expect(screen.getByLabelText('Company')).toHaveValue('mako')
    expect(screen.getByLabelText('Role')).toHaveValue('Software Engineer')
    expect(screen.getByLabelText('Start Date')).toHaveValue('2022-01-15')
    expect(screen.getByLabelText('End Date')).toHaveValue('2024-03-01')
  })

  it('shows field-level errors for empty required values', function shouldShowRequiredFieldErrors() {
    render(
      <CompanyListDumb
        {...createProps({
          isAddModalOpen: true,
        })}
      />,
    )

    expect(screen.getByText('Company is required')).toBeTruthy()
    expect(screen.getByText('Role is required')).toBeTruthy()
    expect(screen.getByText('Start date is required')).toBeTruthy()
  })

  it('shows an end-before-start error', function shouldShowEndBeforeStartError() {
    render(
      <CompanyListDumb
        {...createProps({
          isAddModalOpen: true,
          isCurrentRole: false,
          startDate: '2024-03-01',
          endDate: '2022-01-15',
        })}
      />,
    )

    expect(screen.getByText('End date must not be before start date')).toBeTruthy()
  })

  it('renders the delete confirmation dialog naming the company', function shouldRenderDeleteConfirmation() {
    render(
      <CompanyListDumb
        {...createProps({
          companies: [createCompany()],
          deleteTarget: createCompany(),
        })}
      />,
    )

    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(
      screen.getByText('Delete mako?'),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Deleting this profile record does not alter previously submitted applications or automatically revoke interviewer eligibility.',
      ),
    ).toBeTruthy()
  })

  it('calls onRequestDelete when a delete action is clicked', function shouldRequestDelete() {
    const onRequestDelete = vi.fn()

    render(
      <CompanyListDumb
        {...createProps({
          companies: [createCompany()],
          onRequestDelete,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete mako' }))
    expect(onRequestDelete).toHaveBeenCalledTimes(1)
  })

  it('calls onOpenAddModal when the Add Company button is clicked', function shouldOpenAddModal() {
    const onOpenAddModal = vi.fn()

    render(
      <CompanyListDumb
        {...createProps({
          onOpenAddModal,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Company' }))
    expect(onOpenAddModal).toHaveBeenCalledTimes(1)
  })
})

describe('formatDateRange', function formatDateRangeSuite() {
  it('formats a past role with an end date', function shouldFormatPastRange() {
    expect(formatDateRange('2022-01-15', '2024-03-01')).toBe(
      '2022-01-15 — 2024-03-01',
    )
  })

  it('formats a current role with Present', function shouldFormatCurrentRange() {
    expect(formatDateRange('2022-01-15', null)).toBe('2022-01-15 — Present')
  })
})
