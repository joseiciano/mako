// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompanyListDumb, formatJoinedDate } from './company-list-dumb'

afterEach(function cleanupAfterTest() {
  cleanup()
})

describe('CompanyListDumb', function companyListDumbSuite() {
  it('renders company list', function shouldRenderCompanyList() {
    render(
      <CompanyListDumb
        companies={[
          {
            id: 'company-id',
            userId: 'user-id',
            company: 'mako',
            joined: '2024-01-15T12:00:00.000Z',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ]}
        companyName=""
        errorMessage={null}
        isAddModalOpen={false}
        isError={false}
        isLoading={false}
        isSubmitting={false}
        joinedDate=""
        onCloseAddModal={vi.fn()}
        onCompanyNameChange={vi.fn()}
        onJoinedDateChange={vi.fn()}
        onOpenAddModal={vi.fn()}
        onSubmitAddCompany={vi.fn()}
        submitErrorMessage={null}
      />,
    )

    expect(screen.getByText('mako')).toBeTruthy()
    expect(screen.getByText('Joined Jan 2024')).toBeTruthy()
  })

  it('calls onOpenAddModal when button is clicked', function shouldOpenModal() {
    const onOpenAddModal = vi.fn()

    render(
      <CompanyListDumb
        companies={[]}
        companyName=""
        errorMessage={null}
        isAddModalOpen={false}
        isError={false}
        isLoading={false}
        isSubmitting={false}
        joinedDate=""
        onCloseAddModal={vi.fn()}
        onCompanyNameChange={vi.fn()}
        onJoinedDateChange={vi.fn()}
        onOpenAddModal={onOpenAddModal}
        onSubmitAddCompany={vi.fn()}
        submitErrorMessage={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Company' }))
    expect(onOpenAddModal).toHaveBeenCalledTimes(1)
  })
})

describe('formatJoinedDate', function formatJoinedDateSuite() {
  it('formats valid date strings', function shouldFormatValidDate() {
    expect(formatJoinedDate('2023-09-15T00:00:00.000Z')).toBe('Sep 2023')
  })

  it('handles invalid dates', function shouldHandleInvalidDate() {
    expect(formatJoinedDate('bad-date')).toBe('Unknown date')
  })
})
