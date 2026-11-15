import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { EmploymentRecordCompatibilityResponse } from '@mako/shared'
import { ApplicationFormDumb } from './application-form-dumb'

vi.mock('@tanstack/react-router', function mockRouter() {
  return {
    Link: function Link(props: { to: string; children: ReactNode }) {
      return <a href={props.to}>{props.children}</a>
    },
  }
})

function record(
  id: string,
  company: string,
  overrides: Partial<EmploymentRecordCompatibilityResponse> = {},
): EmploymentRecordCompatibilityResponse {
  return {
    id,
    userId: '99999999-9999-4999-8999-999999999999',
    company,
    role: 'Engineer',
    start: '2020-01-01',
    end: null,
    isComplete: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    joined: '2020-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const complete = record('11111111-1111-4111-8111-111111111111', 'Acme')
const incomplete = record('22222222-2222-4222-8222-222222222222', 'Globex', {
  role: null,
  isComplete: false,
})

function renderForm(overrides: Partial<Parameters<typeof ApplicationFormDumb>[0]> = {}) {
  const props = {
    records: [complete, incomplete],
    selectedIds: [] as string[],
    email: 'me@example.com',
    isSubmitting: false,
    errors: {},
    errorFocusKey: 0,
    onToggleRecord: vi.fn(),
    onEmailChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
  const view = render(<ApplicationFormDumb {...props} />)
  return { ...view, props }
}

describe('ApplicationFormDumb', function suite() {
  it('renders complete records as labelled checkboxes and incomplete ones as unavailable', function run() {
    renderForm()
    expect(screen.getByRole('checkbox', { name: /Acme/ })).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByText(/Needs details/)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Complete this record/ })
    expect(link.getAttribute('href')).toBe('/settings/profile')
  })

  it('renders a grouped selection with a count', function run() {
    renderForm({ selectedIds: [complete.id] })
    expect(screen.getByRole('group', { name: /1 selected/ })).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: /Acme/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('shows empty state linking to settings', function run() {
    renderForm({ records: [] })
    expect(screen.getByRole('link', { name: /employment history in settings/ }).getAttribute('href')).toBe(
      '/settings/profile',
    )
    expect(screen.getByText(/will not change when you edit your profile/)).toBeTruthy()
  })

  it('calls handlers for toggle, email change and submit', function run() {
    const { props } = renderForm()
    fireEvent.click(screen.getByRole('checkbox', { name: /Acme/ }))
    expect(props.onToggleRecord).toHaveBeenCalledWith(complete.id)
    fireEvent.change(screen.getByLabelText('Contact email'), { target: { value: 'x@y.co' } })
    expect(props.onEmailChange).toHaveBeenCalledWith('x@y.co')
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('disables submit while submitting and keeps selection visible', function run() {
    const { props } = renderForm({ isSubmitting: true, selectedIds: [complete.id] })
    const button = screen.getByRole('button', { name: 'Submitting...' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Acme/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('group', { name: /1 selected/ })).toBeTruthy()
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('associates validation errors with their controls', function run() {
    renderForm({ errors: { selection: 'Pick one.', email: 'Bad email.' } })
    const group = screen.getByRole('group')
    expect(group.getAttribute('aria-describedby')).toBe('application-selection-error')
    const email = screen.getByLabelText('Contact email')
    expect(email.getAttribute('aria-describedby')).toBe('application-email-error')
    expect(email.getAttribute('aria-invalid')).toBe('true')
  })

  it('moves focus to the first erroring control after a failed submit', function run() {
    const { rerender, props } = renderForm()
    rerender(
      <ApplicationFormDumb
        {...props}
        errors={{ selection: 'Pick one.', email: 'Bad email.' }}
        errorFocusKey={1}
      />,
    )
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /Acme/ }))

    rerender(<ApplicationFormDumb {...props} errors={{ email: 'Bad email.' }} errorFocusKey={2} />)
    expect(document.activeElement).toBe(screen.getByLabelText('Contact email'))

    rerender(<ApplicationFormDumb {...props} errors={{ submit: 'Server down.' }} errorFocusKey={3} />)
    expect(document.activeElement).toBe(screen.getByText('Server down.'))
  })

  it('offers a retry label after a submission error', function run() {
    renderForm({ errors: { submit: 'Server down.' } })
    expect(screen.getByRole('alert').textContent).toBe('Server down.')
    expect(screen.getByRole('button', { name: 'Retry submission' })).toBeTruthy()
  })

  it('renders no verified badges', function run() {
    renderForm()
    expect(screen.queryByText(/verified/i, { selector: 'span' })).toBeNull()
  })
})
