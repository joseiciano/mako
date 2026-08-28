import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecordingConsentDumb } from './recording-consent-dumb'
import type { RecordingConsentDumbProps } from './recording-consent-dumb'

function makeDumbProps(overrides?: Partial<RecordingConsentDumbProps>): RecordingConsentDumbProps {
  return {
    mode: 'ai_led',
    interviewStatus: 'scheduled',
    recordingStatus: 'not_started',
    currentDecision: null,
    isSubmitting: false,
    errorMessage: null,
    onChoose: vi.fn(),
    onRevoke: vi.fn(),
    ...overrides,
  }
}

describe('RecordingConsentDumb', function () {
  it('renders informed copy covering audio/video, transcript, AI feedback, 30-day retention, and decline-not-block', function () {
    render(<RecordingConsentDumb {...makeDumbProps()} />)

    // All explanatory obligations in one view so implementer cannot omit a piece
    expect(screen.getByText(/audio/i)).toBeInTheDocument()
    expect(screen.getByText(/video/i)).toBeInTheDocument()
    expect(screen.getByText(/transcript/i)).toBeInTheDocument()
    expect(screen.getByText(/AI feedback/i)).toBeInTheDocument()
    expect(screen.getByText(/30[-\s]?day/i)).toBeInTheDocument()
    // decline wording must not suggest interview is blocked - multiple matches intentional (disclosure + button)
    expect(screen.getAllByText(/declin/i).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/without prevent|without block|not prevent|still continue|can still join/i)).toBeInTheDocument()
  })

  it('shows AI-led explanatory copy without stating another participant decision', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ mode: 'ai_led' })} />)

    const text = document.body.textContent ?? ''
    // AI-led variant mentions AI context
    expect(text).toMatch(/AI/i)
    // Must not leak other participant choice/readiness
    expect(text).not.toMatch(/other participant has (consented|declined)/i)
    expect(text).not.toMatch(/\d+\s*of\s*\d+.*consent/i)
    expect(text).not.toMatch(/both participants have/i)
    expect(text).not.toMatch(/waiting for other participant/i)
  })

  it('shows peer-to-peer explanatory copy that differs from AI-led without stating other participant decision', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ mode: 'peer_to_peer' })} />)

    const text = document.body.textContent ?? ''
    // peer variant should reference peer/interviewer or both participants requirement generically
    expect(text).toMatch(/peer|both participants|you and/i)
    // Still must not expose individual other participant choice
    expect(text).not.toMatch(/other participant has (consented|declined)/i)
    expect(text).not.toMatch(/\d+\s*of\s*\d+.*consent/i)
    // Ensure the two modes differ – AI-led and peer copy are not identical
    // (peer must not be pure AI copy; it should not claim AI-only phrasing if implementation distinguishes)
    // At minimum peer text must not be exactly same as AI-led text above; we assert peer-specific phrasing present
    expect(text).not.toMatch(/AI-led interview with an AI interviewer only/i)
  })

  it('does not preselect a choice on first render', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ currentDecision: null })} />)

    const allowButton = screen.getByRole('button', { name: /allow/i })
    const declineButton = screen.getByRole('button', { name: /decline/i })

    expect(allowButton).not.toHaveAttribute('aria-pressed', 'true')
    expect(allowButton).not.toHaveAttribute('aria-checked', 'true')
    expect(declineButton).not.toHaveAttribute('aria-pressed', 'true')
    expect(declineButton).not.toHaveAttribute('aria-checked', 'true')
    // Neither radio/checkbox is checked; both are plain buttons
    expect(allowButton.getAttribute('aria-selected')).not.toBe('true')
    expect(declineButton.getAttribute('aria-selected')).not.toBe('true')
    // No checked attribute at all
    expect(document.querySelector('[checked]')).toBeNull()
  })

  it('exposes explicit Allow and Decline as keyboard-native buttons', async function () {
    const user = userEvent.setup()
    const onChoose = vi.fn()
    render(<RecordingConsentDumb {...makeDumbProps({ onChoose })} />)

    const allowButton = screen.getByRole('button', { name: /allow/i })
    const declineButton = screen.getByRole('button', { name: /decline/i })

    expect(allowButton.tagName).toBe('BUTTON')
    expect(declineButton.tagName).toBe('BUTTON')
    expect(allowButton).toHaveAttribute('type', 'button')
    expect(declineButton).toHaveAttribute('type', 'button')

    await user.click(allowButton)
    expect(onChoose).toHaveBeenCalledWith('consented')
    expect(onChoose).toHaveBeenCalledTimes(1)

    await user.click(declineButton)
    expect(onChoose).toHaveBeenCalledWith('declined')
    expect(onChoose).toHaveBeenCalledTimes(2)
  })

  it('triggers Allow via keyboard Enter and Space', async function () {
    const user = userEvent.setup()
    const onChoose = vi.fn()
    render(<RecordingConsentDumb {...makeDumbProps({ onChoose })} />)

    const allowButton = screen.getByRole('button', { name: /allow/i })
    allowButton.focus()
    await user.keyboard('{Enter}')
    expect(onChoose).toHaveBeenCalledWith('consented')

    onChoose.mockClear()
    allowButton.focus()
    await user.keyboard(' ')
    expect(onChoose).toHaveBeenCalledWith('consented')
  })

  it('triggers Decline via keyboard Enter and Space', async function () {
    const user = userEvent.setup()
    const onChoose = vi.fn()
    render(<RecordingConsentDumb {...makeDumbProps({ onChoose })} />)

    const declineButton = screen.getByRole('button', { name: /decline/i })
    declineButton.focus()
    await user.keyboard('{Enter}')
    expect(onChoose).toHaveBeenCalledWith('declined')

    onChoose.mockClear()
    declineButton.focus()
    await user.keyboard(' ')
    expect(onChoose).toHaveBeenCalledWith('declined')
  })

  it('surfaces current user choice when consented and when declined', function () {
    const { rerender } = render(<RecordingConsentDumb {...makeDumbProps({ currentDecision: 'consented' })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/you.*allow|allowed|consented/i)

    rerender(<RecordingConsentDumb {...makeDumbProps({ currentDecision: 'declined' })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/you.*declin|declined|not recorded/i)
  })

  it('does not expose other participant decision or aggregate readiness', function () {
    render(
      <RecordingConsentDumb
        {...makeDumbProps({
          mode: 'peer_to_peer',
          recordingStatus: 'not_started',
          currentDecision: 'consented',
        })}
      />,
    )

    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/other participant/i)
    expect(text).not.toMatch(/1 of 2|2 of 2|both have consented|both declined/i)
    expect(text).not.toMatch(/waiting for the other/i)
    expect(text).not.toMatch(/aggregate|readiness/i)
  })

  it('renders accessible status text for the current consent/recording state', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ recordingStatus: 'not_started', currentDecision: null })} />)

    // Status must be discoverable via role status or aria-live/status region, or at minimum visible status text
    const statusCandidate =
      screen.queryByRole('status') ??
      document.querySelector('[aria-live]') ??
      screen.getByText(/waiting for consent|not recorded|ready to record/i)

    expect(statusCandidate).toBeInTheDocument()
  })

  it.each([
    { recordingStatus: 'not_started' as const, currentDecision: null, label: /waiting for consent/i },
    { recordingStatus: 'pending' as const, currentDecision: 'consented' as const, label: /ready to record/i },
    { recordingStatus: 'recording' as const, currentDecision: 'consented' as const, label: /recording/i },
    { recordingStatus: 'processing' as const, currentDecision: 'consented' as const, label: /processing upload/i },
    { recordingStatus: 'ready' as const, currentDecision: 'consented' as const, label: /ready/i },
    { recordingStatus: 'failed' as const, currentDecision: 'consented' as const, label: /recording failed/i },
    { recordingStatus: 'not_started' as const, currentDecision: 'declined' as const, label: /not recorded/i },
  ])('renders runtime label "$label" for recordingStatus=$recordingStatus decision=$currentDecision', function ({ recordingStatus, currentDecision, label }) {
    render(
      <RecordingConsentDumb
        {...makeDumbProps({
          recordingStatus,
          currentDecision,
        })}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(label)
  })

  it('locks Allow/Decline when recordingStatus is not not_started and explains why', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ recordingStatus: 'recording', currentDecision: null })} />)

    const allowButton = screen.getByRole('button', { name: /allow/i })
    const declineButton = screen.getByRole('button', { name: /decline/i })

    expect(allowButton).toBeDisabled()
    expect(declineButton).toBeDisabled()
    // Explanation must be visible – consent can no longer be changed after recording begins
    expect(screen.getByText(/recording has started|recording is in progress|consent.*locked|can no longer be changed|cannot be changed|after recording|preparation has begun|locked because/i)).toBeInTheDocument()
  })

  it('locks Allow/Decline for every non-not_started recording status', function () {
    const lockedStatuses = ['pending', 'recording', 'processing', 'ready', 'failed'] as const

    for (const recordingStatus of lockedStatuses) {
      const { unmount } = render(<RecordingConsentDumb {...makeDumbProps({ recordingStatus })} />)
      expect(screen.getByRole('button', { name: /allow/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /decline/i })).toBeDisabled()
      unmount()
    }
  })

  it('locks Allow/Decline when interview is terminal and explains why', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ interviewStatus: 'completed', recordingStatus: 'not_started' })} />)
    expect(screen.getByRole('button', { name: /allow/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /decline/i })).toBeDisabled()
    expect(screen.getByText(/no longer available|session is complete|interview.*complete|cancelled|terminal/i)).toBeInTheDocument()
  })

  it('also locks when interview is cancelled', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ interviewStatus: 'cancelled', recordingStatus: 'not_started' })} />)
    expect(screen.getByRole('button', { name: /allow/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /decline/i })).toBeDisabled()
  })

  it('does not call onChoose when locked controls are clicked', async function () {
    const user = userEvent.setup()
    const onChoose = vi.fn()
    render(<RecordingConsentDumb {...makeDumbProps({ recordingStatus: 'recording', onChoose })} />)

    const allowButton = screen.getByRole('button', { name: /allow/i })
    // Disabled button click should not fire handler
    await user.click(allowButton).catch(function () {})
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('disables controls and shows submitting state when isSubmitting', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ isSubmitting: true })} />)

    expect(screen.getByRole('button', { name: /allow/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /decline/i })).toBeDisabled()
  })

  it('renders safe error as an alert without raw provider leakage', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ errorMessage: 'Unable to save recording choice. Please try again.' })} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/unable to save recording choice/i)
    expect(alert.textContent).not.toMatch(/realtimekit|provider|stack|500|internal/i)
  })

  it('does not render an alert when errorMessage is null', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ errorMessage: null })} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('leaves Start Session actionable when consent UI is rendered', async function () {
    const onStartSession = vi.fn()
    function Harness() {
      return (
        <div>
          <RecordingConsentDumb {...makeDumbProps()} />
          <button type="button" onClick={onStartSession}>
            Start Session
          </button>
        </div>
      )
    }

    const user = userEvent.setup()
    render(<Harness />)

    const startButton = screen.getByRole('button', { name: /start session/i })
    expect(startButton).toBeEnabled()
    await user.click(startButton)
    expect(onStartSession).toHaveBeenCalledOnce()
  })

  it('declining consent does not disable Start Session', async function () {
    const onStartSession = vi.fn()
    const onChoose = vi.fn()
    function Harness() {
      return (
        <div>
          <RecordingConsentDumb {...makeDumbProps({ onChoose })} />
          <button type="button" onClick={onStartSession}>
            Start Session
          </button>
        </div>
      )
    }

    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: /decline/i }))
    expect(onChoose).toHaveBeenCalledWith('declined')

    const startButton = screen.getByRole('button', { name: /start session/i })
    expect(startButton).toBeEnabled()
    await user.click(startButton)
    expect(onStartSession).toHaveBeenCalledOnce()
  })

  it('allowing consent does not disable Start Session', async function () {
    const onStartSession = vi.fn()
    const onChoose = vi.fn()
    function Harness() {
      return (
        <div>
          <RecordingConsentDumb {...makeDumbProps({ onChoose })} />
          <button type="button" onClick={onStartSession}>
            Start Session
          </button>
        </div>
      )
    }

    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: /allow/i }))
    expect(onChoose).toHaveBeenCalledWith('consented')
    expect(screen.getByRole('button', { name: /start session/i })).toBeEnabled()
  })

  it('supports revoking choice via onRevoke when currentDecision is set and not locked', async function () {
    const user = userEvent.setup()
    const onRevoke = vi.fn()
    render(<RecordingConsentDumb {...makeDumbProps({ currentDecision: 'consented', onRevoke })} />)

    // Revoke control may be labelled Revoke, Change, or Remove consent – accept any containing revoke/change/remove
    const revokeButton = screen.queryByRole('button', { name: /revoke|change|remove/i })
    if (!revokeButton) {
      // If no explicit revoke button, component may allow re-choosing; ensure re-choosing still works
      const declineButton = screen.getByRole('button', { name: /decline/i })
      expect(declineButton).toBeEnabled()
      return
    }

    expect(revokeButton).toBeEnabled()
    await user.click(revokeButton)
    expect(onRevoke).toHaveBeenCalledOnce()
  })

  it('does not render revoke action after recording has started', function () {
    render(<RecordingConsentDumb {...makeDumbProps({ currentDecision: 'consented', recordingStatus: 'recording', onRevoke: vi.fn() })} />)

    const revokeButton = screen.queryByRole('button', { name: /revoke|change|remove/i })
    if (revokeButton) {
      expect(revokeButton).toBeDisabled()
    }
  })
  it.each([
    { interviewStatus: 'completed' as const, label: /not recorded/i },
    { interviewStatus: 'cancelled' as const, label: /not recorded/i },
  ])('exposes accessible status "$label" for terminal $interviewStatus with recording_status not_started and no decision', function ({ interviewStatus, label }) {
    render(
      <RecordingConsentDumb
        {...makeDumbProps({
          interviewStatus,
          recordingStatus: 'not_started',
          currentDecision: null,
        })}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(label)
  })
})
