import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PublishFormDumb } from './publish-form-dumb'

describe('PublishFormDumb', function suite() {
  it('renders the form with start time input and publish button', function run() {
    render(
      <PublishFormDumb
        isLoading={false}
        error={null}
        leadTimeMinutes={60}
        horizonDays={90}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Start Time')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish Slot' })).toBeTruthy()
  })

  it('disables publish button when loading', function run() {
    render(
      <PublishFormDumb
        isLoading={true}
        error={null}
        leadTimeMinutes={60}
        horizonDays={90}
        onSubmit={vi.fn()}
      />,
    )
    const button = screen.getByRole('button')
    expect(button).toHaveProperty('disabled', true)
    expect(button.textContent).toContain('Publishing...')
  })

  it('disables publish button when startTime is empty', function run() {
    render(
      <PublishFormDumb
        isLoading={false}
        error={null}
        leadTimeMinutes={60}
        horizonDays={90}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByRole('button')).toHaveProperty('disabled', true)
  })

  it('displays error message when error is set', function run() {
    render(
      <PublishFormDumb
        isLoading={false}
        error="Time conflict detected"
        leadTimeMinutes={60}
        horizonDays={90}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Time conflict detected')
  })

  it('displays policy help text with lead time and horizon', function run() {
    render(
      <PublishFormDumb
        isLoading={false}
        error={null}
        leadTimeMinutes={60}
        horizonDays={90}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByText(/at least 60 minutes from now/)).toBeTruthy()
    expect(screen.getByText(/within 90 days/)).toBeTruthy()
  })

  it('does not render an interview type selector', function run() {
    render(
      <PublishFormDumb
        isLoading={false}
        error={null}
        leadTimeMinutes={60}
        horizonDays={90}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/interview type/i)).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('calls onSubmit with startTime when form is submitted', async function run() {
    const onSubmit = vi.fn()
    render(
      <PublishFormDumb
        isLoading={false}
        error={null}
        leadTimeMinutes={60}
        horizonDays={90}
        onSubmit={onSubmit}
      />,
    )
    const input = screen.getByLabelText('Start Time') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-08-08T10:00' } })
    const form = screen.getByRole('button', { name: 'Publish Slot' }).closest('form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(onSubmit).toHaveBeenCalledWith('2026-08-08T10:00')
  })

  it('focuses error alert when error appears after submit', async function run() {
    const { rerender } = render(
      <PublishFormDumb
        isLoading={false}
        error={null}
        leadTimeMinutes={60}
        horizonDays={90}
        onSubmit={vi.fn()}
      />,
    )
    rerender(
      <PublishFormDumb
        isLoading={false}
        error="Time conflict detected"
        leadTimeMinutes={60}
        horizonDays={90}
        onSubmit={vi.fn()}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveFocus()
  })
})
