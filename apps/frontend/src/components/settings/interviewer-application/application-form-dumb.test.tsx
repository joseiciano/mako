import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { EmploymentRecordCompatibilityResponse } from '@mako/shared'
import { ApplicationFormDumb, type ApplicationFormDumbProps } from './application-form-dumb'

vi.mock('@tanstack/react-router', function mockRouter() {
  return {
    Link: function Link(props: { to: string; children: ReactNode }) {
      return <a href={props.to}>{props.children}</a>
    },
  }
})

function makeRecord(
  overrides: Partial<EmploymentRecordCompatibilityResponse>,
): EmploymentRecordCompatibilityResponse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: '99999999-9999-4999-8999-999999999999',
    company: 'acme',
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

function renderForm(overrides: Partial<ApplicationFormDumbProps> = {}) {
  const props: ApplicationFormDumbProps = {
    records: [makeRecord({})],
    isLoadingRecords: false,
    recordsError: null,
    onRetryRecords: vi.fn(),
    selectedIds: [],
    email: 'me@example.com',
    emailError: null,
    selectionError: null,
    submitError: null,
    isSubmitting: false,
    isReapplication: false,
    focusErrorToken: 0,
    onToggleRecord: vi.fn(),
    onEmailChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
  const view = render(<ApplicationFormDumb {...props} />)
  return { props, ...view }
}

describe('ApplicationFormDumb', function suite() {
  it('renders complete records as checkboxes and incomplete as unavailable with a settings link', function run() {
    renderForm({
      records: [
        makeRecord({}),
        makeRecord({
          id: '22222222-2222-4222-8222-222222222222',
          company: 'globex',
          role: null,
          isComplete: false,
        }),
      ],
    })

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes).toHaveLength(2)
    expect(boxes[0].disabled).toBe(false)
    expect(boxes[1].disabled).toBe(true)
    expect(screen.getByText('Needs details')).toBeTruthy()
    expect(
      screen.getByText('Complete this record in settings').closest('a')?.getAttribute('href'),
    ).toBe('/settings/profile')
    expect(screen.getByText('2020-01-01 — Present')).toBeTruthy()
  })

  it('shows an empty-history state linking to settings and the immutability explanation', function run() {
    renderForm({ records: [] })

    expect(
      screen.getByText('Add employment history in settings').closest('a')?.getAttribute('href'),
    ).toBe('/settings/profile')
    expect(screen.getByText(/will not change if you edit your profile later/)).toBeTruthy()
  })

  it('has no per-record verification badges', function run() {
    renderForm()

    expect(screen.queryByText(/^verified$/i)).toBeNull()
  })

  it('calls onToggleRecord and onEmailChange', function run() {
    const { props } = renderForm()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(props.onToggleRecord).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')

    fireEvent.change(screen.getByLabelText('Contact email'), { target: { value: 'x@y.com' } })
    expect(props.onEmailChange).toHaveBeenCalledWith('x@y.com')
  })

  it('submits via the form and not while submitting', function run() {
    const first = renderForm()
    fireEvent.submit(screen.getByRole('button', { name: 'Submit application' }).closest('form')!)
    expect(first.props.onSubmit).toHaveBeenCalledTimes(1)
    first.unmount()

    const second = renderForm({ isSubmitting: true })
    const button = screen.getByRole('button', { name: 'Submitting...' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.submit(button.closest('form')!)
    expect(second.props.onSubmit).not.toHaveBeenCalled()
  })

  it('keeps selected checkboxes in the accessibility tree while submitting', function run() {
    renderForm({ isSubmitting: true, selectedIds: ['11111111-1111-4111-8111-111111111111'] })

    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(box.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('associates validation messages with controls', function run() {
    renderForm({ emailError: 'Bad email', selectionError: 'Pick one' })

    const email = screen.getByLabelText('Contact email')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe('interviewer-email-error')
    expect(screen.getByRole('group').getAttribute('aria-describedby')).toBe(
      'interviewer-selection-error',
    )
    expect(screen.getByText('Bad email')).toBeTruthy()
    expect(screen.getByText('Pick one')).toBeTruthy()
  })

  it('moves focus to the first actionable error when the token changes', function run() {
    const { rerender, props } = renderForm()

    rerender(
      <ApplicationFormDumb {...props} focusErrorToken={1} selectionError="Pick one" />,
    )
    expect(document.activeElement).toBe(screen.getByText('Pick one'))

    rerender(
      <ApplicationFormDumb
        {...props}
        focusErrorToken={2}
        emailError="Bad email"
        selectionError="Pick one"
      />,
    )
    expect(document.activeElement).toBe(screen.getByLabelText('Contact email'))

    rerender(
      <ApplicationFormDumb {...props} focusErrorToken={3} submitError="Server exploded" />,
    )
    expect(document.activeElement?.textContent).toContain('Server exploded')
  })

  it('renders loading and records-error states with retry', function run() {
    const loading = renderForm({ isLoadingRecords: true, records: [] })
    expect(screen.getByText('Loading employment history...')).toBeTruthy()
    loading.unmount()

    const errored = renderForm({ recordsError: 'Failed to fetch companies', records: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(errored.props.onRetryRecords).toHaveBeenCalled()
  })

  it('labels the reapplication state', function run() {
    renderForm({ isReapplication: true })
    expect(screen.getByText('Reapply as a verified interviewer')).toBeTruthy()
  })
})
