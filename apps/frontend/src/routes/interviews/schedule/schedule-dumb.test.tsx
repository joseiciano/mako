import { render, screen, cleanup } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { ScheduleDumb } from './schedule-dumb'
import type { ScheduleDumbProps } from './schedule-dumb'

function renderSchedule(props: Partial<ScheduleDumbProps> = {}) {
  const defaultProps: ScheduleDumbProps = {
    step: 'type',
    visibleSteps: ['type', 'mode', 'timing', 'confirm'],
    interviewType: null,
    mode: null,
    scheduledAt: null,
    maxMatches: null,
    slots: [],
    isSubmitting: false,
    errorMessage: null,
    canAdvance: false,
    canGoBack: false,
    onSetType: vi.fn(),
    onSetMode: vi.fn(),
    onSetScheduledAt: vi.fn(),
    onSetMaxMatches: vi.fn(),
    onSetSlots: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onGoToStep: vi.fn(),
    onConfirm: vi.fn(),
    ...props,
  }
  return render(<ScheduleDumb {...defaultProps} />)
}

describe('ScheduleDumb', function scheduleDumbSuite() {
  it('renders the schedule interview form', function testRender() {
    renderSchedule()
    expect(
      screen.getByRole('heading', { name: 'Schedule Interview' }),
    ).toBeDefined()
    cleanup()
  })

  it('renders step indicator with visible steps', function testStepIndicator() {
    renderSchedule({
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      step: 'mode',
    })
    expect(screen.getByText('Type')).toBeDefined()
    expect(screen.getByText('Mode')).toBeDefined()
    expect(screen.getByText('Timing')).toBeDefined()
    expect(screen.getByText('Confirm')).toBeDefined()
    cleanup()
  })

  it('calls onSetType when type is selected', async function testSetType() {
    const onSetType = vi.fn()
    renderSchedule({ onSetType })
    await userEvent.click(screen.getByText('System Design'))
    expect(onSetType).toHaveBeenCalledWith('system_design')
    cleanup()
  })

  it('calls onSetMode when mode is selected', async function testSetMode() {
    const onSetMode = vi.fn()
    renderSchedule({
      step: 'mode',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      canAdvance: true,
      onSetMode,
    })
    await userEvent.click(screen.getByText('AI-Led'))
    expect(onSetMode).toHaveBeenCalledWith('ai_led')
    cleanup()
  })

  it('calls onSetScheduledAt when timing selected', async function testSetTiming() {
    const onSetScheduledAt = vi.fn()
    renderSchedule({
      step: 'timing',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      mode: 'ai_led',
      canAdvance: true,
      onSetScheduledAt,
    })
    await userEvent.click(screen.getByText('Start now'))
    expect(onSetScheduledAt).toHaveBeenCalledWith('now')
    cleanup()
  })

  it('shows datetime input for later timing', async function testLaterInput() {
    const onSetScheduledAt = vi.fn()
    renderSchedule({
      step: 'timing',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      mode: 'ai_led',
      scheduledAt: '',
      canAdvance: true,
      onSetScheduledAt,
    })
    await userEvent.click(screen.getByText('Schedule for later'))
    expect(onSetScheduledAt).toHaveBeenCalledWith('')
    expect(screen.getByLabelText(/date and time/i)).toBeDefined()
    cleanup()
  })

  it('calls onNext when next button clicked', async function testNext() {
    const onNext = vi.fn()
    renderSchedule({
      step: 'type',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      canAdvance: true,
      onNext,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onNext).toHaveBeenCalled()
    cleanup()
  })

  it('disables next when canAdvance is false', function testDisabledNext() {
    renderSchedule({ canAdvance: false })
    const nextButton = screen.getByRole('button', { name: 'Next' })
    expect(nextButton).toHaveProperty('disabled', true)
    cleanup()
  })

  it('calls onBack when back button clicked', async function testBack() {
    const onBack = vi.fn()
    renderSchedule({
      step: 'mode',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      canGoBack: true,
      onBack,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
    cleanup()
  })

  it('calls onConfirm when confirm button clicked', async function testConfirm() {
    const onConfirm = vi.fn()
    renderSchedule({
      step: 'confirm',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      mode: 'ai_led',
      scheduledAt: 'now',
      canGoBack: true,
      onConfirm,
    })
    await userEvent.click(
      screen.getByRole('button', { name: /confirm & schedule/i }),
    )
    expect(onConfirm).toHaveBeenCalled()
    cleanup()
  })

  it('disables buttons while submitting', function testDisabledSubmitting() {
    renderSchedule({
      step: 'confirm',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      isSubmitting: true,
      canGoBack: true,
    })
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

  it('surfaces error messages inline', function testError() {
    renderSchedule({ errorMessage: 'Something went wrong' })
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    cleanup()
  })

  it('calls onGoToStep when edit link clicked on confirm', async function testEditLink() {
    const onGoToStep = vi.fn()
    renderSchedule({
      step: 'confirm',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      mode: 'ai_led',
      scheduledAt: 'now',
      onGoToStep,
    })
    const editButtons = screen.getAllByText('Edit')
    await userEvent.click(editButtons[0]!)
    expect(onGoToStep).toHaveBeenCalledWith('type')
    cleanup()
  })

  it('renders availability step with slots', async function testAvailabilityStep() {
    const onSetSlots = vi.fn()
    renderSchedule({
      step: 'availability',
      visibleSteps: ['type', 'mode', 'availability', 'confirm'],
      interviewType: 'system_design',
      mode: 'peer_to_peer',
      maxMatches: 2,
      slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      canAdvance: true,
      onSetSlots,
    })
    expect(screen.getByLabelText(/maximum matches/i)).toHaveProperty('value', '2')
    expect(screen.getByLabelText(/slot 1 start time/i)).toHaveProperty('value', '2026-06-10T10:00')
    expect(screen.getByLabelText(/slot 1 end time/i)).toHaveProperty('value', '2026-06-10T11:00')
    cleanup()
  })

  it('allows adding and removing slots', async function testAddRemoveSlots() {
    const onSetSlots = vi.fn()
    renderSchedule({
      step: 'availability',
      visibleSteps: ['type', 'mode', 'availability', 'confirm'],
      interviewType: 'system_design',
      mode: 'peer_to_peer',
      onSetSlots,
    })
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }))
    expect(onSetSlots).toHaveBeenCalledWith([
      { startTime: '', endTime: '' },
    ])
    cleanup()
  })

  it('renders p2p confirmation with slots summary', function testP2pConfirm() {
    renderSchedule({
      step: 'confirm',
      visibleSteps: ['type', 'mode', 'availability', 'confirm'],
      interviewType: 'system_design',
      mode: 'peer_to_peer',
      maxMatches: 3,
      slots: [
        { startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' },
      ],
    })
    expect(screen.getByTestId('confirm-max-matches')).toHaveTextContent('3')
    expect(screen.getByText('2026-06-10T10:00 — 2026-06-10T11:00')).toBeDefined()
    cleanup()
  })
})
