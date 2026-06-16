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
const mockAvailabilityMutate = vi.fn()
let mockAvailabilityIsPending = false
let mockAvailabilityError: Error | null = null

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

vi.mock('#/hooks/use-submit-availability', () => ({
  useSubmitAvailability: () => ({
    mutate: mockAvailabilityMutate,
    get isPending() {
      return mockAvailabilityIsPending
    },
    get error() {
      return mockAvailabilityError
    },
  }),
}))


describe('ScheduleSmart', function scheduleSmartSuite() {
  beforeEach(function () {
    mockNavigate.mockClear()
    mockCreateMutate.mockClear()
    mockAvailabilityMutate.mockClear()
    mockCreateIsPending = false
    mockCreateError = null
    mockAvailabilityIsPending = false
    mockAvailabilityError = null
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
    expect(payload).not.toHaveProperty('tier')
    expect(payload).not.toHaveProperty('interviewer_id')
    expect(mockAvailabilityMutate).not.toHaveBeenCalled()

    const onSuccess = mockCreateMutate.mock.calls[0]![1].onSuccess
    await onSuccess()
    await waitFor(function () {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/interviews' })
    })

    cleanup()
  })

  it('allows step progression through p2p flow and submits availability contract', async function testP2pFlow() {
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

    expect(mockCreateMutate).not.toHaveBeenCalled()
    expect(mockAvailabilityMutate).toHaveBeenCalledTimes(1)
    const payload = mockAvailabilityMutate.mock.calls[0]![0]
    expect(payload).toEqual({
      interview_type: 'system_design',
      max_matches: 2,
      slots: [
        {
          start_time: new Date('2026-06-10T10:00').toISOString(),
          end_time: new Date('2026-06-10T11:00').toISOString(),
        },
      ],
    })
    expect(payload).not.toHaveProperty('tier')
    expect(payload).not.toHaveProperty('interviewer_id')

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

    cleanup()
  })

  it('does not surface mutation errors before a branch submit is tracked', function testUntrackedMutationError() {
    mockCreateError = new Error('Insufficient credits')
    render(<ScheduleSmart />)
    expect(screen.queryByRole('alert')).toBeNull()
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

  it('disables submit and back while mutation is in-flight', async function testDisabledInFlight() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Start now'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    mockCreateIsPending = true

    // Trigger re-render by clicking confirm
    const confirmButton = screen.getByRole('button', { name: /confirm & schedule/i })
    await user.click(confirmButton)

    expect(screen.getByRole('button', { name: /submitting/i })).toHaveProperty(
      'disabled',
      true,
    )
    expect(screen.getByRole('button', { name: 'Back' })).toHaveProperty(
      'disabled',
      true,
    )

    cleanup()
  })

  it('prevents duplicate dispatch on double click', async function testDuplicatePrevention() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Start now'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Simulate double click by calling confirm twice rapidly
    const confirmButton = screen.getByRole('button', { name: /confirm & schedule/i })
    await user.click(confirmButton)
    await user.click(confirmButton)

    expect(mockCreateMutate).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('preserves state after server failure so user can retry', async function testRetryPreservesState() {
    const user = userEvent.setup()
    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Start now'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Confirm Your Interview')).toBeDefined()

    // Simulate failure by calling onSettled without onSuccess
    mockCreateMutate.mockImplementationOnce(function (_payload, options) {
      if (options?.onSettled) {
        options.onSettled()
      }
    })

    await user.click(screen.getByRole('button', { name: /confirm & schedule/i }))

    // State should be preserved - still on confirm step
    expect(screen.getByText('Confirm Your Interview')).toBeDefined()
    expect(screen.getByText('System Design')).toBeDefined()

    cleanup()
  })

  it('shows async matcher success copy after p2p availability is accepted', async function testP2pAcceptedCopy() {
    const user = userEvent.setup()
    mockAvailabilityMutate.mockImplementationOnce(function (_payload, options) {
      if (options?.onSuccess) {
        options.onSuccess()
      }
      if (options?.onSettled) {
        options.onSettled()
      }
    })

    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Peer-to-Peer'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    const maxMatchesInput = screen.getByLabelText(/maximum matches/i)
    await user.clear(maxMatchesInput)
    await user.type(maxMatchesInput, '2')
    await user.click(screen.getByRole('button', { name: /add slot/i }))
    fireEvent.change(screen.getByLabelText(/slot 1 start time/i), {
      target: { value: '2026-06-10T10:00' },
    })
    fireEvent.change(screen.getByLabelText(/slot 1 end time/i), {
      target: { value: '2026-06-10T11:00' },
    })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: /confirm & schedule/i }))

    expect(screen.getByText(/availability submitted/i)).toBeDefined()
    expect(screen.getByText(/interview will appear after matcher success/i)).toBeDefined()
    expect(mockNavigate).not.toHaveBeenCalled()

    cleanup()
  })

  it('clears p2p accepted copy when user edits scheduling state', async function testP2pAcceptedCopyClearsOnEdit() {
    const user = userEvent.setup()
    mockAvailabilityMutate.mockImplementationOnce(function (_payload, options) {
      if (options?.onSuccess) {
        options.onSuccess()
      }
      if (options?.onSettled) {
        options.onSettled()
      }
    })

    render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Peer-to-Peer'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    const maxMatchesInput = screen.getByLabelText(/maximum matches/i)
    await user.clear(maxMatchesInput)
    await user.type(maxMatchesInput, '2')
    await user.click(screen.getByRole('button', { name: /add slot/i }))
    fireEvent.change(screen.getByLabelText(/slot 1 start time/i), {
      target: { value: '2026-06-10T10:00' },
    })
    fireEvent.change(screen.getByLabelText(/slot 1 end time/i), {
      target: { value: '2026-06-10T11:00' },
    })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: /confirm & schedule/i }))

    expect(screen.getByText(/availability submitted/i)).toBeDefined()
    await user.click(screen.getAllByText('Edit')[1]!)

    expect(screen.queryByText(/availability submitted/i)).toBeNull()

    cleanup()
  })

  it('shows AI-specific retry action after create failure', async function testAiRetryAction() {
    const user = userEvent.setup()
    mockCreateMutate.mockImplementationOnce(function (_payload, options) {
      if (options?.onSettled) {
        options.onSettled()
      }
    })
    const { rerender } = render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Start now'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: /confirm & schedule/i }))

    mockCreateError = new Error('Insufficient credits')
    rerender(<ScheduleSmart />)

    await user.click(screen.getByRole('button', { name: /retry scheduling/i }))

    expect(mockCreateMutate).toHaveBeenCalledTimes(2)
    expect(mockAvailabilityMutate).not.toHaveBeenCalled()

    cleanup()
  })

  it('clears stale AI retry state when user changes branch after failure', async function testRetryClearsOnModeChange() {
    const user = userEvent.setup()
    mockCreateMutate.mockImplementationOnce(function (_payload, options) {
      if (options?.onSettled) {
        options.onSettled()
      }
    })
    const { rerender } = render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('AI-Led'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Start now'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: /confirm & schedule/i }))

    mockCreateError = new Error('Insufficient credits')
    rerender(<ScheduleSmart />)
    expect(screen.getByRole('button', { name: /retry scheduling/i })).toBeDefined()

    await user.click(screen.getAllByText('Edit')[1]!)
    await user.click(screen.getByText('Peer-to-Peer'))

    expect(screen.queryByRole('button', { name: /retry scheduling/i })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()

    cleanup()
  })

  it('shows p2p-specific retry action after availability failure', async function testP2pRetryAction() {
    const user = userEvent.setup()
    mockAvailabilityMutate.mockImplementationOnce(function (_payload, options) {
      if (options?.onSettled) {
        options.onSettled()
      }
    })
    const { rerender } = render(<ScheduleSmart />)

    await user.click(screen.getByText('System Design'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText('Peer-to-Peer'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    const maxMatchesInput = screen.getByLabelText(/maximum matches/i)
    await user.clear(maxMatchesInput)
    await user.type(maxMatchesInput, '2')
    await user.click(screen.getByRole('button', { name: /add slot/i }))
    fireEvent.change(screen.getByLabelText(/slot 1 start time/i), {
      target: { value: '2026-06-10T10:00' },
    })
    fireEvent.change(screen.getByLabelText(/slot 1 end time/i), {
      target: { value: '2026-06-10T11:00' },
    })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: /confirm & schedule/i }))

    mockAvailabilityError = new Error('Matcher queue unavailable')
    rerender(<ScheduleSmart />)

    await user.click(screen.getByRole('button', { name: /retry submitting availability/i }))

    expect(mockAvailabilityMutate).toHaveBeenCalledTimes(2)
    expect(mockCreateMutate).not.toHaveBeenCalled()

    cleanup()
  })
})
