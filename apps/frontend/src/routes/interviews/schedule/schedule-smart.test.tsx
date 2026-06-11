import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { ScheduleSmart } from './schedule-smart'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

const mockCreateMutate = vi.fn()
let mockCreateIsPending = false
let mockCreateError: Error | null = null

vi.mock('#/hooks/use-interviews', () => ({
  useCreateInterview: () => ({
    mutate: mockCreateMutate,
    get isPending() {
      return mockCreateIsPending
    },
    get error() {
      return mockCreateError
    },
  }),
}))

const mockSubmitMutate = vi.fn()
let mockSubmitIsPending = false
let mockSubmitError: Error | null = null

vi.mock('#/hooks/use-submit-availability', () => ({
  useSubmitAvailability: () => ({
    mutate: mockSubmitMutate,
    get isPending() {
      return mockSubmitIsPending
    },
    get error() {
      return mockSubmitError
    },
  }),
}))

describe('ScheduleSmart', function scheduleSmartSuite() {
  beforeEach(function () {
    mockNavigate.mockClear()
    mockCreateMutate.mockClear()
    mockSubmitMutate.mockClear()
    mockCreateIsPending = false
    mockCreateError = null
    mockSubmitIsPending = false
    mockSubmitError = null
  })

  it('renders the schedule form starting at type step', function testRender() {
    render(<ScheduleSmart />)
    expect(
      screen.getByRole('heading', { name: 'Schedule Interview' }),
    ).toBeDefined()
    expect(screen.getByText('Select Interview Type')).toBeDefined()
    cleanup()
  })

  it('allows step progression through ai-led flow and submits', async function testAiFlow() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.click(screen.getByText('Start now'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Confirm Your Interview')).toBeDefined()
    await user.click(screen.getByRole('button', { name: /confirm & schedule/i }))

    expect(mockCreateMutate).toHaveBeenCalledTimes(1)
    const payload = mockCreateMutate.mock.calls[0]![0]
    expect(payload).toEqual({
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    const onSuccess = mockCreateMutate.mock.calls[0]![1].onSuccess
    await onSuccess()
    await waitFor(function () {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/interviews' })
    })

    cleanup()
  })

  it('allows step progression through p2p flow and submits', async function testP2pFlow() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.click(screen.getByText('Peer-to-Peer'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    const maxMatchesInput = screen.getByLabelText(/maximum matches/i)
    await user.clear(maxMatchesInput)
    await user.type(maxMatchesInput, '2')

    await user.click(screen.getByRole('button', { name: /add slot/i }))
    const startInput = screen.getByLabelText(/slot 1 start time/i)
    fireEvent.change(startInput, { target: { value: '2026-06-10T10:00' } })
    const endInput = screen.getByLabelText(/slot 1 end time/i)
    fireEvent.change(endInput, { target: { value: '2026-06-10T11:00' } })

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Confirm Your Interview')).toBeDefined()
    await user.click(screen.getByRole('button', { name: /confirm & schedule/i }))

    expect(mockSubmitMutate).toHaveBeenCalledTimes(1)
    const payload = mockSubmitMutate.mock.calls[0]![0]
    expect(payload.interview_type).toBe('system_design')
    expect(payload.max_matches).toBe(2)
    expect(payload.slots).toHaveLength(1)
    expect(payload.slots[0]!.start_time).toBe(new Date('2026-06-10T10:00').toISOString())
    expect(payload.slots[0]!.end_time).toBe(new Date('2026-06-10T11:00').toISOString())

    const onSuccess = mockSubmitMutate.mock.calls[0]![1].onSuccess
    await onSuccess()
    await waitFor(function () {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/interviews' })
    })

    cleanup()
  })

  it('converts later ai scheduling into ISO before submit', async function testLaterAiIso() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Schedule for later'))

    fireEvent.change(screen.getByLabelText(/date and time/i), {
      target: { value: '2026-06-10T10:00' },
    })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: /confirm & schedule/i }))

    expect(mockCreateMutate).toHaveBeenCalledTimes(1)
    expect(mockCreateMutate.mock.calls[0]![0]).toEqual({
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: new Date('2026-06-10T10:00').toISOString(),
    })

    cleanup()
  })

  it('blocks progression when step is incomplete', async function testBlockedProgression() {
    render(<ScheduleSmart />)

    const nextButton = screen.getByRole('button', { name: 'Next' })
    expect(nextButton).toHaveProperty('disabled', true)

    cleanup()
  })

  it('preserves valid state when going back', async function testBackPreservesState() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.click(screen.getByText('Start now'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Start now')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('AI-Led')).toBeDefined()

    cleanup()
  })

  it('resets invalid downstream state when switching mode', async function testModeSwitchReset() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.click(screen.getByText('Start now'))

    // Go back to mode and switch to P2P
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByText('Peer-to-Peer'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Should be at availability step with empty state
    expect(screen.getByLabelText(/maximum matches/i)).toHaveProperty('value', '')

    cleanup()
  })

  it('does not mutate before confirmation', async function testNoEarlyMutation() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Start now'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(mockCreateMutate).not.toHaveBeenCalled()
    expect(mockSubmitMutate).not.toHaveBeenCalled()

    cleanup()
  })

  it('surfaces inline error when creation fails', function testInlineError() {
    mockCreateError = new Error('Insufficient credits')
    render(<ScheduleSmart />)
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient credits')
    cleanup()
  })

  it('allows editing from confirmation via edit links', async function testEditFromConfirm() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Start now'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    const editButtons = screen.getAllByText('Edit')
    await user.click(editButtons[0]!)

    expect(screen.getByText('Select Interview Type')).toBeDefined()

    cleanup()
  })
})
