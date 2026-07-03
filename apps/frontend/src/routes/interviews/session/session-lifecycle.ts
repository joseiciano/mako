import type { InterviewDetail } from '@mako/shared'

export type LifecycleControls = {
  canStart: boolean
  canEnd: boolean
  isTerminal: boolean
  terminalMessage: string | null
  helperMessage: string | null
}

export type SessionTimerState = {
  kind: 'not-started' | 'running' | 'expired' | 'completed' | 'cancelled' | 'unavailable'
  label: string
  remainingLabel: string | null
  isWarning: boolean
}

export function deriveLifecycleControls(
  interview: InterviewDetail | null,
  participantJoined: boolean,
): LifecycleControls {
  const status = interview?.status ?? null

  const canStart = participantJoined && status === 'scheduled'
  const canEnd = status === 'ongoing'
  const isTerminal = status === 'completed' || status === 'cancelled'

  let terminalMessage: string | null = null
  if (status === 'completed') {
    terminalMessage = 'This session is complete. Lifecycle actions are no longer available.'
  } else if (status === 'cancelled') {
    terminalMessage = 'This interview was cancelled. Lifecycle actions are unavailable.'
  }

  let helperMessage: string | null = null
  if (status === 'scheduled' && !participantJoined) {
    helperMessage = 'Join the interview environment before starting the session.'
  }

  return {
    canStart,
    canEnd,
    isTerminal,
    terminalMessage,
    helperMessage,
  }
}

export function deriveSessionTimer(
  interview: InterviewDetail | null,
  nowMs: number,
): SessionTimerState {
  if (!interview || interview.status === 'scheduled') {
    return {
      kind: 'not-started',
      label: 'Not started',
      remainingLabel: null,
      isWarning: false,
    }
  }

  if (interview.status === 'completed') {
    return {
      kind: 'completed',
      label: 'Completed',
      remainingLabel: null,
      isWarning: false,
    }
  }

  if (interview.status === 'cancelled') {
    return {
      kind: 'cancelled',
      label: 'Cancelled',
      remainingLabel: null,
      isWarning: false,
    }
  }

  if (interview.status === 'ongoing') {
    const expiresAtMs = interview.expires_at ? Date.parse(interview.expires_at) : Number.NaN
    const warningAtMs = interview.warning_at ? Date.parse(interview.warning_at) : Number.NaN

    if (Number.isNaN(expiresAtMs) || Number.isNaN(warningAtMs)) {
      return {
        kind: 'unavailable',
        label: 'Timer unavailable.',
        remainingLabel: null,
        isWarning: false,
      }
    }

    if (nowMs >= expiresAtMs) {
      return {
        kind: 'expired',
        label: 'Session time has expired.',
        remainingLabel: '0:00',
        isWarning: true,
      }
    }

    const remaining = expiresAtMs - nowMs
    const isWarning = nowMs >= warningAtMs

    return {
      kind: 'running',
      label: isWarning ? 'Ending soon' : 'In progress',
      remainingLabel: formatDuration(remaining),
      isWarning,
    }
  }

  return {
    kind: 'unavailable',
    label: 'Timer unavailable.',
    remainingLabel: null,
    isWarning: false,
  }
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
