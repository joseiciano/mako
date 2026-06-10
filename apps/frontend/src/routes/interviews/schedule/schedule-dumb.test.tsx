import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { ScheduleDumb } from './schedule-dumb'

describe('ScheduleDumb', function scheduleDumbSuite() {
  it('renders the schedule interview form with system design type', async function testRender() {
    render(
      <ScheduleDumb
        scheduledAt="now"
        isSubmitting={false}
        errorMessage={null}
        onScheduledAtChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Schedule Interview' }),
    ).toBeDefined()
    expect(screen.getByLabelText(/interview type/i)).toHaveProperty('value', 'system_design')
    expect(screen.getByLabelText(/when/i)).toHaveProperty('value', 'now')
    cleanup()
  })

  it('allows switching scheduled_at to a future datetime', async function testSwitch() {
    const onChange = vi.fn()

    render(
      <ScheduleDumb
        scheduledAt="now"
        isSubmitting={false}
        errorMessage={null}
        onScheduledAtChange={onChange}
        onSubmit={vi.fn()}
      />,
    )

    const select = screen.getByLabelText(/when/i)
    fireEvent.change(select, { target: { value: 'later' } })

    expect(onChange).toHaveBeenCalledWith('')
    cleanup()
  })

  it('shows datetime input when scheduled_at is later', async function testLaterInput() {
    render(
      <ScheduleDumb
        scheduledAt="2026-05-01T14:00"
        isSubmitting={false}
        errorMessage={null}
        onScheduledAtChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/date and time/i)).toBeDefined()
    cleanup()
  })

  it('calls onSubmit when form is submitted', async function testSubmit() {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(
      <ScheduleDumb
        scheduledAt="now"
        isSubmitting={false}
        errorMessage={null}
        onScheduledAtChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    const buttons = screen.getAllByRole('button', { name: /schedule interview/i })
    await user.click(buttons[0]!)

    expect(onSubmit).toHaveBeenCalled()
    cleanup()
  })

  it('disables submit button while submitting', function testDisabled() {
    render(
      <ScheduleDumb
        scheduledAt="now"
        isSubmitting={true}
        errorMessage={null}
        onScheduledAtChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const buttons = screen.getAllByRole('button', { name: /scheduling/i })
    expect(buttons[0]).toHaveProperty('disabled', true)
    cleanup()
  })

  it('surfaces backend error messages inline', function testError() {
    render(
      <ScheduleDumb
        scheduledAt="now"
        isSubmitting={false}
        errorMessage="Insufficient credits"
        onScheduledAtChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('Insufficient credits')).toBeDefined()
    cleanup()
  })

  it('communicates that tier is resolved server-side', function testTierMessage() {
    render(
      <ScheduleDumb
        scheduledAt="now"
        isSubmitting={false}
        errorMessage={null}
        onScheduledAtChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const elements = screen.getAllByText(/resolved automatically by the server/i)
    expect(elements.length).toBeGreaterThan(0)
    cleanup()
  })

  it('communicates that peer-to-peer uses availability matching', function testP2PMessage() {
    render(
      <ScheduleDumb
        scheduledAt="now"
        isSubmitting={false}
        errorMessage={null}
        onScheduledAtChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const elements = screen.getAllByText(/peer-to-peer sessions use availability matching/i)
    expect(elements.length).toBeGreaterThan(0)
    cleanup()
  })
})
