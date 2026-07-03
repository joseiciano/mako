import { describe, expect, it } from 'vitest'
import {
  deriveLifecycleControls,
  deriveSessionTimer,
  formatDuration,
} from './session-lifecycle'
import { makeInterview } from './test-helpers'

describe('session-lifecycle', function () {
  describe('deriveLifecycleControls', function () {
    it('allows start only when joined and scheduled', function () {
      const interview = makeInterview({ status: 'scheduled' })
      const controls = deriveLifecycleControls(interview, true)
      expect(controls.canStart).toBe(true)
      expect(controls.canEnd).toBe(false)
      expect(controls.isTerminal).toBe(false)
      expect(controls.helperMessage).toBeNull()
    })

    it('disallows start when scheduled but not joined', function () {
      const interview = makeInterview({ status: 'scheduled' })
      const controls = deriveLifecycleControls(interview, false)
      expect(controls.canStart).toBe(false)
      expect(controls.helperMessage).toBe(
        'Join the interview environment before starting the session.',
      )
    })

    it('allows end only when ongoing', function () {
      const interview = makeInterview({ status: 'ongoing' })
      const controls = deriveLifecycleControls(interview, true)
      expect(controls.canStart).toBe(false)
      expect(controls.canEnd).toBe(true)
      expect(controls.isTerminal).toBe(false)
    })

    it('marks completed as terminal', function () {
      const interview = makeInterview({ status: 'completed' })
      const controls = deriveLifecycleControls(interview, true)
      expect(controls.isTerminal).toBe(true)
      expect(controls.terminalMessage).toBe(
        'This session is complete. Lifecycle actions are no longer available.',
      )
      expect(controls.canStart).toBe(false)
      expect(controls.canEnd).toBe(false)
    })

    it('marks cancelled as terminal', function () {
      const interview = makeInterview({ status: 'cancelled' })
      const controls = deriveLifecycleControls(interview, true)
      expect(controls.isTerminal).toBe(true)
      expect(controls.terminalMessage).toBe(
        'This interview was cancelled. Lifecycle actions are unavailable.',
      )
      expect(controls.canStart).toBe(false)
      expect(controls.canEnd).toBe(false)
    })

    it('returns safe defaults when interview is null', function () {
      const controls = deriveLifecycleControls(null, false)
      expect(controls.canStart).toBe(false)
      expect(controls.canEnd).toBe(false)
      expect(controls.isTerminal).toBe(false)
      expect(controls.terminalMessage).toBeNull()
      expect(controls.helperMessage).toBeNull()
    })
  })

  describe('deriveSessionTimer', function () {
    it('returns not-started for scheduled', function () {
      const interview = makeInterview({ status: 'scheduled' })
      const timer = deriveSessionTimer(interview, Date.now())
      expect(timer.kind).toBe('not-started')
      expect(timer.remainingLabel).toBeNull()
      expect(timer.isWarning).toBe(false)
    })

    it('returns not-started for null interview', function () {
      const timer = deriveSessionTimer(null, Date.now())
      expect(timer.kind).toBe('not-started')
    })

    it('returns completed for completed status', function () {
      const interview = makeInterview({ status: 'completed' })
      const timer = deriveSessionTimer(interview, Date.now())
      expect(timer.kind).toBe('completed')
    })

    it('returns cancelled for cancelled status', function () {
      const interview = makeInterview({ status: 'cancelled' })
      const timer = deriveSessionTimer(interview, Date.now())
      expect(timer.kind).toBe('cancelled')
    })

    it('returns unavailable when expires_at is missing', function () {
      const interview = makeInterview({
        status: 'ongoing',
        expires_at: null,
        warning_at: '2026-06-20T10:00:00Z',
      })
      const timer = deriveSessionTimer(interview, Date.now())
      expect(timer.kind).toBe('unavailable')
    })

    it('returns unavailable when warning_at is missing', function () {
      const interview = makeInterview({
        status: 'ongoing',
        expires_at: '2026-06-20T10:00:00Z',
        warning_at: null,
      })
      const timer = deriveSessionTimer(interview, Date.now())
      expect(timer.kind).toBe('unavailable')
    })

    it('returns expired when now is past expires_at', function () {
      const now = Date.parse('2026-06-20T11:00:00Z')
      const interview = makeInterview({
        status: 'ongoing',
        expires_at: '2026-06-20T10:00:00Z',
        warning_at: '2026-06-20T09:00:00Z',
      })
      const timer = deriveSessionTimer(interview, now)
      expect(timer.kind).toBe('expired')
      expect(timer.label).toBe('Session time has expired.')
      expect(timer.remainingLabel).toBe('0:00')
      expect(timer.isWarning).toBe(true)
    })

    it('returns running with remaining time before expiry', function () {
      const now = Date.parse('2026-06-20T09:30:00Z')
      const interview = makeInterview({
        status: 'ongoing',
        expires_at: '2026-06-20T10:00:00Z',
        warning_at: '2026-06-20T09:45:00Z',
      })
      const timer = deriveSessionTimer(interview, now)
      expect(timer.kind).toBe('running')
      expect(timer.isWarning).toBe(false)
      expect(timer.remainingLabel).toBe('30:00')
    })

    it('returns warning when now is past warning_at', function () {
      const now = Date.parse('2026-06-20T09:50:00Z')
      const interview = makeInterview({
        status: 'ongoing',
        expires_at: '2026-06-20T10:00:00Z',
        warning_at: '2026-06-20T09:45:00Z',
      })
      const timer = deriveSessionTimer(interview, now)
      expect(timer.kind).toBe('running')
      expect(timer.isWarning).toBe(true)
      expect(timer.remainingLabel).toBe('10:00')
    })

    it('updates remaining time as now advances', function () {
      const interview = makeInterview({
        status: 'ongoing',
        expires_at: '2026-06-20T10:00:00Z',
        warning_at: '2026-06-20T09:45:00Z',
      })
      const first = deriveSessionTimer(interview, Date.parse('2026-06-20T09:30:00Z'))
      const second = deriveSessionTimer(interview, Date.parse('2026-06-20T09:35:00Z'))
      expect(first.remainingLabel).toBe('30:00')
      expect(second.remainingLabel).toBe('25:00')
    })
  })

  describe('formatDuration', function () {
    it('formats under one hour as M:SS', function () {
      expect(formatDuration(5 * 60 * 1000 + 30 * 1000)).toBe('5:30')
      expect(formatDuration(59 * 60 * 1000 + 59 * 1000)).toBe('59:59')
    })

    it('formats over one hour as H:MM:SS', function () {
      expect(formatDuration(1 * 60 * 60 * 1000 + 5 * 60 * 1000 + 30 * 1000)).toBe('1:05:30')
      expect(formatDuration(2 * 60 * 60 * 1000)).toBe('2:00:00')
    })

    it('formats zero as 0:00', function () {
      expect(formatDuration(0)).toBe('0:00')
      expect(formatDuration(-1000)).toBe('0:00')
    })
  })
})
