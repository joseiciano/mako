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
    successMessage: null,
    errorMessage: null,
    routingError: null,
    retryLabel: null,
    policyNote: null,
    createBlocked: false,
    createBlockedMessage: null,
    pendingCreateAlert: null,
    fieldErrors: {},
    canAdvance: false,
    canGoBack: false,
    onSetType: vi.fn(),
    onSelectBranch: vi.fn(),
    onSetScheduledAt: vi.fn(),
    onSetMaxMatches: vi.fn(),
    onSetSlots: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onGoToStep: vi.fn(),
    onConfirm: vi.fn(),
    onRetry: vi.fn(),
    onRetryRouting: vi.fn(),
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
    expect(screen.getByText('Branch')).toBeDefined()
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

  it('renders exactly the three submission branches', function testBranches() {
    renderSchedule({
      step: 'mode',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
    })
    expect(screen.getByText('AI Direct')).toBeDefined()
    expect(screen.getByText('Standard P2P Availability')).toBeDefined()
    expect(screen.getByText('Verified Interviewer')).toBeDefined()
    cleanup()
  })

  it('calls onSelectBranch when ai direct is selected', async function testSelectAiDirect() {
    const onSelectBranch = vi.fn()
    renderSchedule({
      step: 'mode',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      canAdvance: true,
      onSelectBranch,
    })
    await userEvent.click(screen.getByText('AI Direct'))
    expect(onSelectBranch).toHaveBeenCalledWith('ai_direct')
    cleanup()
  })

  it('calls onSelectBranch when standard p2p availability is selected', async function testSelectStandardP2p() {
    const onSelectBranch = vi.fn()
    renderSchedule({
      step: 'mode',
      visibleSteps: ['type', 'mode', 'availability', 'confirm'],
      interviewType: 'system_design',
      canAdvance: true,
      onSelectBranch,
    })
    await userEvent.click(screen.getByText('Standard P2P Availability'))
    expect(onSelectBranch).toHaveBeenCalledWith('standard_p2p')
    cleanup()
  })

  it('calls onSelectBranch when verified interviewer is selected', async function testSelectVerifiedInterviewer() {
    const onSelectBranch = vi.fn()
    renderSchedule({
      step: 'mode',
      visibleSteps: ['type', 'mode'],
      interviewType: 'system_design',
      canAdvance: true,
      onSelectBranch,
    })
    await userEvent.click(screen.getByText('Verified Interviewer'))
    expect(onSelectBranch).toHaveBeenCalledWith('verified_interviewer')
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

  it('renders retry action when error includes retry label', async function testRetryAction() {
    const onRetry = vi.fn()
    renderSchedule({
      errorMessage: 'Something went wrong',
      retryLabel: 'Retry scheduling',
      onRetry,
    })
    await userEvent.click(screen.getByRole('button', { name: /retry scheduling/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('surfaces success messages for accepted async submissions', function testSuccess() {
    renderSchedule({
      successMessage:
        'Availability submitted for matcher processing. Your interview will appear after matcher success.',
    })
    expect(screen.getByRole('status')).toHaveTextContent(/availability submitted/i)
    expect(screen.getByRole('status')).toHaveTextContent(/matcher success/i)
    cleanup()
  })

  it('renders account policy note for immediate AI', function testPolicyNote() {
    renderSchedule({ policyNote: 'Free AI interview quota is used first, then credits.' })
    expect(screen.getByText(/free AI interview quota is used first, then credits/i)).toBeDefined()
    cleanup()
  })

  it('renders blocked create message and disables confirm', function testCreateBlocked() {
    renderSchedule({
      step: 'confirm',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      mode: 'ai_led',
      scheduledAt: 'now',
      createBlocked: true,
      createBlockedMessage: 'You have no remaining free AI interviews or credits.',
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/no remaining free AI interviews or credits/i)
    expect(
      screen.getByRole('button', { name: /confirm & schedule/i }),
    ).toHaveProperty('disabled', true)
    cleanup()
  })

  it('renders pending-create alert with no retry action', function testPendingCreateAlert() {
    renderSchedule({
      pendingCreateAlert:
        'We could not confirm whether your interview was created. Check your Interviews to avoid duplicates.',
    })
    expect(screen.getByRole('status')).toHaveTextContent(/could not confirm/i)
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    cleanup()
  })

  it('disables confirm when create is blocked', async function testConfirmDisabledWhenBlocked() {
    const onConfirm = vi.fn()
    renderSchedule({
      step: 'confirm',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      mode: 'ai_led',
      scheduledAt: 'now',
      createBlocked: true,
      onConfirm,
    })
    await userEvent.click(
      screen.getByRole('button', { name: /confirm & schedule/i }),
    )
    expect(onConfirm).not.toHaveBeenCalled()
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

  it('shows field-level error for interview type', function testTypeFieldError() {
    renderSchedule({
      step: 'type',
      fieldErrors: { interviewType: 'Unsupported type selected' },
    })
    expect(screen.getByText('Unsupported type selected')).toBeDefined()
    cleanup()
  })

  it('shows field-level error for mode', function testModeFieldError() {
    renderSchedule({
      step: 'mode',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      fieldErrors: { mode: 'Unsupported mode selected' },
    })
    expect(screen.getByText('Unsupported mode selected')).toBeDefined()
    cleanup()
  })

  it('shows field-level error for scheduledAt', function testTimingFieldError() {
    renderSchedule({
      step: 'timing',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      mode: 'ai_led',
      scheduledAt: '',
      fieldErrors: { scheduledAt: 'Invalid date' },
    })
    expect(screen.getByText('Invalid date')).toBeDefined()
    cleanup()
  })

  it('shows field-level error for maxMatches', function testMaxMatchesFieldError() {
    renderSchedule({
      step: 'availability',
      visibleSteps: ['type', 'mode', 'availability', 'confirm'],
      interviewType: 'system_design',
      mode: 'peer_to_peer',
      fieldErrors: { maxMatches: 'Must be positive' },
    })
    expect(screen.getByText('Must be positive')).toBeDefined()
    cleanup()
  })

  it('shows field-level error for slots', function testSlotsFieldError() {
    renderSchedule({
      step: 'availability',
      visibleSteps: ['type', 'mode', 'availability', 'confirm'],
      interviewType: 'system_design',
      mode: 'peer_to_peer',
      slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T10:30' }],
      fieldErrors: { slots: 'Each slot must be 60 minutes' },
    })
    expect(screen.getByText('Each slot must be 60 minutes')).toBeDefined()
    cleanup()
  })

  it('disables type selection while submitting', function testDisabledType() {
    renderSchedule({
      step: 'type',
      isSubmitting: true,
    })
    expect(screen.getByRole('button', { name: 'System Design' })).toHaveProperty('disabled', true)
    cleanup()
  })

  it('disables mode selection while submitting', function testDisabledMode() {
    renderSchedule({
      step: 'mode',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      isSubmitting: true,
    })
    const branchButtons = screen
      .getAllByRole('button')
      .filter(function isBranchButton(b) {
        return (
          b.textContent?.includes('AI Direct') ||
          b.textContent?.includes('Standard P2P Availability') ||
          b.textContent?.includes('Verified Interviewer')
        )
      })
    expect(branchButtons).toHaveLength(3)
    expect(branchButtons[0]).toHaveProperty('disabled', true)
    expect(branchButtons[1]).toHaveProperty('disabled', true)
    expect(branchButtons[2]).toHaveProperty('disabled', true)
    cleanup()
  })

  it('disables timing inputs while submitting', function testDisabledTiming() {
    renderSchedule({
      step: 'timing',
      visibleSteps: ['type', 'mode', 'timing', 'confirm'],
      interviewType: 'system_design',
      mode: 'ai_led',
      isSubmitting: true,
    })
    expect(screen.getByRole('button', { name: 'Start now' })).toHaveProperty('disabled', true)
    cleanup()
  })

  it('disables availability inputs while submitting', function testDisabledAvailability() {
    renderSchedule({
      step: 'availability',
      visibleSteps: ['type', 'mode', 'availability', 'confirm'],
      interviewType: 'system_design',
      mode: 'peer_to_peer',
      isSubmitting: true,
    })
    expect(screen.getByLabelText(/maximum matches/i)).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /add slot/i })).toHaveProperty('disabled', true)
    cleanup()
  })
})
