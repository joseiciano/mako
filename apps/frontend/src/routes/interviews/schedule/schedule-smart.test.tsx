import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { ScheduleSmart } from './schedule-smart'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

const mockMutate = vi.fn()
let mockIsPending = false
let mockError: Error | null = null

vi.mock('#/hooks/use-interviews', () => ({
  useCreateInterview: () => ({
    mutate: mockMutate,
    get isPending() {
      return mockIsPending
    },
    get error() {
      return mockError
    },
  }),
}))

describe('ScheduleSmart', function scheduleSmartSuite() {
  beforeEach(function () {
    mockNavigate.mockClear()
    mockMutate.mockClear()
    mockIsPending = false
    mockError = null
  })

  it('renders the schedule form', function testRender() {
    render(<ScheduleSmart />)

    expect(
      screen.getByRole('heading', { name: 'Schedule Interview' }),
    ).toBeDefined()
    cleanup()
  })

  it('submits with "now" and navigates on success', async function testNowSuccess() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    const buttons = screen.getAllByRole('button', { name: /schedule interview/i })
    await user.click(buttons[0]!)

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const payload = mockMutate.mock.calls[0]![0]
    expect(payload).toEqual({
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    const onSuccess = mockMutate.mock.calls[0]![1].onSuccess
    await onSuccess()

    await waitFor(function () {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/interviews' })
    })

    cleanup()
  })

  it('converts datetime-local to ISO string for later scheduling', async function testLaterIso() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    const whenSelect = screen.getByLabelText(/when/i)
    fireEvent.change(whenSelect, { target: { value: 'later' } })

    const datetimeInput = screen.getByLabelText(/date and time/i)
    fireEvent.change(datetimeInput, { target: { value: '2026-05-27T14:30' } })

    const buttons = screen.getAllByRole('button', { name: /schedule interview/i })
    await user.click(buttons[0]!)

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const payload = mockMutate.mock.calls[0]![0]
    const expectedIso = new Date('2026-05-27T14:30').toISOString()
    expect(payload.scheduled_at).toBe(expectedIso)

    cleanup()
  })

  it('prevents submission and shows validation error when later is selected without a valid datetime', async function testEmptyLaterValidation() {
    render(<ScheduleSmart />)

    const whenSelect = screen.getByLabelText(/when/i)
    fireEvent.change(whenSelect, { target: { value: 'later' } })

    const form = screen.getByRole('button', { name: /schedule interview/i }).closest('form')
    fireEvent.submit(form!)

    expect(mockMutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please select a valid date and time.',
    )
    cleanup()
  })

  it('surfaces inline error when creation fails', function testInlineError() {
    mockError = new Error('Insufficient credits')

    render(<ScheduleSmart />)

    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient credits')
    cleanup()
  })
})
