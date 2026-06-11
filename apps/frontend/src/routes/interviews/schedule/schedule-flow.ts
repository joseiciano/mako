import type { InterviewType, InterviewMode } from '@mako/shared'

export type ScheduleStep =
  | 'type'
  | 'mode'
  | 'timing'
  | 'availability'
  | 'confirm'

export type FlowSlot = {
  startTime: string
  endTime: string
}

export type ScheduleState = {
  step: ScheduleStep
  interviewType: InterviewType | null
  mode: InterviewMode | null
  scheduledAt: 'now' | string | null
  maxMatches: number | null
  slots: FlowSlot[]
  validationError: string | null
}

export const initialScheduleState: ScheduleState = {
  step: 'type',
  interviewType: null,
  mode: null,
  scheduledAt: null,
  maxMatches: null,
  slots: [],
  validationError: null,
}

export type ScheduleAction =
  | { type: 'SET_TYPE'; payload: InterviewType }
  | { type: 'SET_MODE'; payload: InterviewMode }
  | { type: 'SET_SCHEDULED_AT'; payload: 'now' | string }
  | { type: 'SET_MAX_MATCHES'; payload: number }
  | { type: 'SET_SLOTS'; payload: FlowSlot[] }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'GO_TO_STEP'; payload: ScheduleStep }
  | { type: 'SET_VALIDATION_ERROR'; payload: string | null }
  | { type: 'RESET' }

function toIsoString(value: string): string | null {
  const parsed = new Date(value)

  if (value === '' || Number.isNaN(parsed.valueOf())) {
    return null
  }

  return parsed.toISOString()
}

export function scheduleReducer(
  state: ScheduleState,
  action: ScheduleAction,
): ScheduleState {
  switch (action.type) {
    case 'SET_TYPE': {
      return {
        ...state,
        interviewType: action.payload,
        validationError: null,
      }
    }
    case 'SET_MODE': {
      const nextMode = action.payload
      const resets: Partial<ScheduleState> =
        nextMode === 'ai_led'
          ? { maxMatches: null, slots: [] }
          : { scheduledAt: null }
      return {
        ...state,
        mode: nextMode,
        ...resets,
        validationError: null,
      }
    }
    case 'SET_SCHEDULED_AT': {
      return {
        ...state,
        scheduledAt: action.payload,
        validationError: null,
      }
    }
    case 'SET_MAX_MATCHES': {
      return {
        ...state,
        maxMatches: action.payload,
        validationError: null,
      }
    }
    case 'SET_SLOTS': {
      return {
        ...state,
        slots: action.payload,
        validationError: null,
      }
    }
    case 'NEXT': {
      const nextStep = getNextStep(state)
      if (nextStep === null) return state
      return { ...state, step: nextStep, validationError: null }
    }
    case 'BACK': {
      const prevStep = getPreviousStep(state)
      if (prevStep === null) return state
      return { ...state, step: prevStep, validationError: null }
    }
    case 'GO_TO_STEP': {
      return { ...state, step: action.payload, validationError: null }
    }
    case 'SET_VALIDATION_ERROR': {
      return { ...state, validationError: action.payload }
    }
    case 'RESET': {
      return initialScheduleState
    }
    default: {
      return state
    }
  }
}

export function getNextStep(state: ScheduleState): ScheduleStep | null {
  switch (state.step) {
    case 'type':
      return state.interviewType !== null ? 'mode' : null
    case 'mode':
      return state.mode !== null
        ? state.mode === 'ai_led'
          ? 'timing'
          : 'availability'
        : null
    case 'timing':
      return isTimingComplete(state) ? 'confirm' : null
    case 'availability':
      return isAvailabilityComplete(state) ? 'confirm' : null
    case 'confirm':
      return null
    default:
      return null
  }
}

export function getPreviousStep(state: ScheduleState): ScheduleStep | null {
  switch (state.step) {
    case 'type':
      return null
    case 'mode':
      return 'type'
    case 'timing':
      return 'mode'
    case 'availability':
      return 'mode'
    case 'confirm':
      return state.mode === 'ai_led' ? 'timing' : 'availability'
    default:
      return null
  }
}

export function isTimingComplete(state: ScheduleState): boolean {
  if (state.scheduledAt === null) return false
  if (state.scheduledAt === 'now') return true
  const parsed = new Date(state.scheduledAt)
  return state.scheduledAt !== '' && !Number.isNaN(parsed.valueOf())
}

export function isAvailabilityComplete(state: ScheduleState): boolean {
  if (state.maxMatches === null || state.maxMatches <= 0) return false
  if (state.slots.length === 0) return false
  return state.slots.every(function slotIsValid(slot) {
    if (slot.startTime === '' || slot.endTime === '') return false
    const start = new Date(slot.startTime)
    const end = new Date(slot.endTime)
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
      return false
    }
    const diffMs = end.getTime() - start.getTime()
    return diffMs === 60 * 60 * 1000
  })
}

export function isStepComplete(
  state: ScheduleState,
  step: ScheduleStep,
): boolean {
  switch (step) {
    case 'type':
      return state.interviewType !== null
    case 'mode':
      return state.mode !== null
    case 'timing':
      return isTimingComplete(state)
    case 'availability':
      return isAvailabilityComplete(state)
    case 'confirm':
      return state.mode === 'ai_led'
        ? isTimingComplete(state)
        : isAvailabilityComplete(state)
    default:
      return false
  }
}

export function canAdvance(state: ScheduleState): boolean {
  return getNextStep(state) !== null
}

export function canGoBack(state: ScheduleState): boolean {
  return getPreviousStep(state) !== null
}

export function buildAiPayload(
  state: ScheduleState,
): { type: InterviewType; mode: 'ai_led'; scheduled_at: 'now' | string } | null {
  if (state.interviewType === null || state.mode !== 'ai_led') return null
  if (!isTimingComplete(state)) return null

  const scheduledAtValue =
    state.scheduledAt === 'now' ? 'now' : toIsoString(state.scheduledAt ?? '')

  if (scheduledAtValue === null) {
    return null
  }

  return {
    type: state.interviewType,
    mode: 'ai_led',
    scheduled_at: scheduledAtValue,
  }
}

export function buildP2pPayload(
  state: ScheduleState,
):
  | {
      interview_type: InterviewType
      max_matches: number
      slots: Array<{ start_time: string; end_time: string }>
    }
  | null {
  if (state.interviewType === null || state.mode !== 'peer_to_peer') return null
  if (!isAvailabilityComplete(state)) return null

  const normalizedSlots = state.slots.map(function mapSlot(slot) {
    const startTime = toIsoString(slot.startTime)
    const endTime = toIsoString(slot.endTime)

    if (startTime === null || endTime === null) {
      return null
    }

    return {
      start_time: startTime,
      end_time: endTime,
    }
  })

  const invalidSlotExists = normalizedSlots.some(function isInvalidSlot(slot) {
    return slot === null
  })

  if (invalidSlotExists) {
    return null
  }

  const validSlots = normalizedSlots.filter(function isValidSlot(
    slot,
  ): slot is { start_time: string; end_time: string } {
    return slot !== null
  })

  return {
    interview_type: state.interviewType,
    max_matches: state.maxMatches!,
    slots: validSlots,
  }
}

export function getStepLabel(step: ScheduleStep): string {
  switch (step) {
    case 'type':
      return 'Type'
    case 'mode':
      return 'Mode'
    case 'timing':
      return 'Timing'
    case 'availability':
      return 'Availability'
    case 'confirm':
      return 'Confirm'
    default:
      return ''
  }
}

export function getVisibleSteps(state: ScheduleState): ScheduleStep[] {
  const base: ScheduleStep[] = ['type', 'mode']
  if (state.mode === 'ai_led') {
    base.push('timing')
  } else if (state.mode === 'peer_to_peer') {
    base.push('availability')
  }
  base.push('confirm')
  return base
}
