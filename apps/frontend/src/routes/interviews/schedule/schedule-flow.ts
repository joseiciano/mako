import type { InterviewType, InterviewMode } from '@mako/shared'

export const supportedInterviewTypes: InterviewType[] = ['system_design']
export const supportedModes: InterviewMode[] = ['ai_led', 'peer_to_peer']
export const SCHEDULE_DRAFT_STORAGE_KEY = 'mako:schedule-flow:draft:v1'

const SCHEDULE_DRAFT_VERSION = 1

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

export type SubmissionBranch = 'ai_led' | 'peer_to_peer'

export type ScheduleFieldErrors = {
  interviewType?: string
  mode?: string
  scheduledAt?: string
  maxMatches?: string
  slots?: string
}

export type ScheduleState = {
  step: ScheduleStep
  interviewType: InterviewType | null
  mode: InterviewMode | null
  scheduledAt: 'now' | string | null
  maxMatches: number | null
  slots: FlowSlot[]
  validationError: string | null
  fieldErrors: ScheduleFieldErrors | null
}

export const initialScheduleState: ScheduleState = {
  step: 'type',
  interviewType: null,
  mode: null,
  scheduledAt: null,
  maxMatches: null,
  slots: [],
  validationError: null,
  fieldErrors: null,
}

type ScheduleDraftData = Pick<
  ScheduleState,
  'step' | 'interviewType' | 'mode' | 'scheduledAt' | 'maxMatches' | 'slots'
>

type ScheduleDraftEnvelope = {
  version: typeof SCHEDULE_DRAFT_VERSION
  draft: ScheduleDraftData
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
  | { type: 'SET_FIELD_ERRORS'; payload: ScheduleFieldErrors | null }
  | { type: 'RESET' }

const supportedSteps: ScheduleStep[] = [
  'type',
  'mode',
  'timing',
  'availability',
  'confirm',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSupportedStep(value: unknown): value is ScheduleStep {
  return typeof value === 'string' && supportedSteps.includes(value as ScheduleStep)
}

function isDraftInterviewType(value: unknown): InterviewType | null {
  if (value === null) return null
  return typeof value === 'string' ? (value as InterviewType) : null
}

function isDraftMode(value: unknown): InterviewMode | null {
  if (value === null) return null
  return typeof value === 'string' ? (value as InterviewMode) : null
}

function isDraftScheduledAt(value: unknown): 'now' | string | null {
  if (value === null) return null
  return typeof value === 'string' ? value : null
}

function isDraftMaxMatches(value: unknown): number | null {
  if (value === null) return null
  return typeof value === 'number' ? value : null
}

function isFlowSlot(value: unknown): value is FlowSlot {
  return (
    isRecord(value) &&
    typeof value.startTime === 'string' &&
    typeof value.endTime === 'string'
  )
}

function parseDraftData(value: unknown): ScheduleDraftData | null {
  if (!isRecord(value)) return null
  if (!isSupportedStep(value.step)) return null

  const slots = Array.isArray(value.slots) ? value.slots : null
  if (slots === null || !slots.every(isFlowSlot)) return null

  const maxMatches = isDraftMaxMatches(value.maxMatches)
  if (maxMatches === null && value.maxMatches !== null) return null

  return {
    step: value.step,
    interviewType: isDraftInterviewType(value.interviewType),
    mode: isDraftMode(value.mode),
    scheduledAt: isDraftScheduledAt(value.scheduledAt),
    maxMatches,
    slots,
  }
}

function hasValidScheduledAt(value: 'now' | string | null): boolean {
  if (value === null) return false
  if (value === 'now') return true
  if (value === '') return false
  return !Number.isNaN(new Date(value).valueOf())
}

function isValidSlot(slot: FlowSlot): boolean {
  if (slot.startTime === '' || slot.endTime === '') return false
  const start = new Date(slot.startTime)
  const end = new Date(slot.endTime)
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return false
  return end.getTime() - start.getTime() === 60 * 60 * 1000
}

function clampStepForState(state: ScheduleState, requestedStep: ScheduleStep): ScheduleStep {
  if (state.interviewType === null || !isSupportedInterviewType(state.interviewType)) {
    return 'type'
  }

  if (state.mode === null || !isSupportedMode(state.mode)) {
    return requestedStep === 'type' ? 'type' : 'mode'
  }

  const orderedSteps: ScheduleStep[] =
    state.mode === 'ai_led'
      ? ['type', 'mode', 'timing', 'confirm']
      : ['type', 'mode', 'availability', 'confirm']
  const maxStep: ScheduleStep =
    state.mode === 'ai_led'
      ? isTimingComplete(state)
        ? 'confirm'
        : 'timing'
      : isAvailabilityComplete(state)
        ? 'confirm'
        : 'availability'
  const requestedIndex = orderedSteps.indexOf(requestedStep)
  const maxIndex = orderedSteps.indexOf(maxStep)

  if (requestedIndex === -1 || requestedIndex > maxIndex) {
    return maxStep
  }

  return requestedStep
}

export function normalizeRestoredScheduleState(state: ScheduleState): ScheduleState {
  const next: ScheduleState = {
    ...initialScheduleState,
    step: state.step,
    interviewType: state.interviewType,
    mode: state.mode,
    scheduledAt: state.scheduledAt,
    maxMatches: state.maxMatches,
    slots: state.slots,
  }

  if (next.interviewType === null || !isSupportedInterviewType(next.interviewType)) {
    return initialScheduleState
  }

  if (next.mode === null || !isSupportedMode(next.mode)) {
    return {
      ...initialScheduleState,
      interviewType: next.interviewType,
      step: clampStepForState({ ...next, mode: null }, next.step),
    }
  }

  if (next.mode === 'ai_led') {
    next.maxMatches = null
    next.slots = []
    if (!hasValidScheduledAt(next.scheduledAt)) {
      next.scheduledAt = null
    }
  } else {
    next.scheduledAt = null
    next.maxMatches =
      next.maxMatches !== null &&
      Number.isInteger(next.maxMatches) &&
      next.maxMatches > 0
        ? next.maxMatches
        : null
    next.slots = next.slots.filter(isValidSlot)
  }

  next.step = clampStepForState(next, next.step)
  return next
}

export function shouldPersistScheduleDraft(state: ScheduleState): boolean {
  return (
    state.interviewType !== null ||
    state.mode !== null ||
    state.scheduledAt !== null ||
    state.maxMatches !== null ||
    state.slots.length > 0 ||
    state.step !== initialScheduleState.step
  )
}

export function serializeScheduleDraft(state: ScheduleState): string {
  const normalized = normalizeRestoredScheduleState(state)
  const envelope: ScheduleDraftEnvelope = {
    version: SCHEDULE_DRAFT_VERSION,
    draft: {
      step: normalized.step,
      interviewType: normalized.interviewType,
      mode: normalized.mode,
      scheduledAt: normalized.scheduledAt,
      maxMatches: normalized.maxMatches,
      slots: normalized.slots,
    },
  }
  return JSON.stringify(envelope)
}

export function restoreScheduleDraft(serialized: string | null): ScheduleState | null {
  if (serialized === null) return null

  try {
    const parsed: unknown = JSON.parse(serialized)
    if (!isRecord(parsed) || parsed.version !== SCHEDULE_DRAFT_VERSION) return null

    const draft = parseDraftData(parsed.draft)
    if (draft === null) return null


    return normalizeRestoredScheduleState({
      ...initialScheduleState,
      ...draft,
    })
  } catch {
    return null
  }
}

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
        fieldErrors: null,
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
        fieldErrors: null,
      }
    }
    case 'SET_SCHEDULED_AT': {
      return {
        ...state,
        scheduledAt: action.payload,
        validationError: null,
        fieldErrors: null,
      }
    }
    case 'SET_MAX_MATCHES': {
      return {
        ...state,
        maxMatches: action.payload,
        validationError: null,
        fieldErrors: null,
      }
    }
    case 'SET_SLOTS': {
      return {
        ...state,
        slots: action.payload,
        validationError: null,
        fieldErrors: null,
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
    case 'SET_FIELD_ERRORS': {
      return { ...state, fieldErrors: action.payload }
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
      return state.interviewType !== null && isSupportedInterviewType(state.interviewType)
        ? 'mode'
        : null
    case 'mode':
      return state.mode !== null && isSupportedMode(state.mode)
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
  if (
    state.interviewType === null ||
    !isSupportedInterviewType(state.interviewType)
  ) {
    return false
  }
  if (state.mode !== 'peer_to_peer') return false
  if (
    state.maxMatches === null ||
    !Number.isInteger(state.maxMatches) ||
    state.maxMatches <= 0
  ) {
    return false
  }
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
      return state.interviewType !== null && isSupportedInterviewType(state.interviewType)
    case 'mode':
      return state.mode !== null && isSupportedMode(state.mode)
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

export function isSupportedInterviewType(type: InterviewType): boolean {
  return supportedInterviewTypes.includes(type)
}

export function isSupportedMode(mode: InterviewMode): boolean {
  return supportedModes.includes(mode)
}

export function getFieldErrors(state: ScheduleState): ScheduleFieldErrors {
  const errors: ScheduleFieldErrors = {}

  if (state.interviewType !== null && !isSupportedInterviewType(state.interviewType)) {
    errors.interviewType = 'Selected interview type is not supported in the current UI.'
  }

  if (state.mode !== null && !isSupportedMode(state.mode)) {
    errors.mode = 'Selected scheduling mode is not supported.'
  }

  if (state.mode === 'ai_led' && state.scheduledAt !== null && state.scheduledAt !== 'now') {
    const parsed = new Date(state.scheduledAt)
    if (state.scheduledAt === '' || Number.isNaN(parsed.valueOf())) {
      errors.scheduledAt = 'Please enter a valid date and time.'
    }
  }

  if (state.mode === 'peer_to_peer') {
    if (state.maxMatches !== null && (!Number.isInteger(state.maxMatches) || state.maxMatches <= 0)) {
      errors.maxMatches = 'Max matches must be a positive integer.'
    }

    if (state.slots.length > 0) {
      const hasInvalidSlot = state.slots.some(function slotHasError(slot) {
        if (slot.startTime === '' || slot.endTime === '') return true
        const start = new Date(slot.startTime)
        const end = new Date(slot.endTime)
        if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return true
        const diffMs = end.getTime() - start.getTime()
        return diffMs !== 60 * 60 * 1000
      })
      if (hasInvalidSlot) {
        errors.slots = 'Each slot must be exactly 60 minutes with valid start and end times.'
      }
    }
  }

  return errors
}

export function hasFieldErrors(errors: ScheduleFieldErrors): boolean {
  return Object.keys(errors).length > 0
}

export function getRetryLabel(
  validationError: string | null,
  mutationError: string | null,
  lastSubmissionBranch: SubmissionBranch | null,
): string | null {
  if (validationError !== null || mutationError === null) return null

  switch (lastSubmissionBranch) {
    case 'peer_to_peer':
      return 'Retry submitting availability'
    case 'ai_led':
      return 'Retry scheduling'
    default:
      return null
  }
}

export function buildAiPayload(
  state: ScheduleState,
): { type: InterviewType; mode: 'ai_led'; scheduled_at: 'now' | string } | null {
  if (state.interviewType === null || state.mode !== 'ai_led') return null
  if (!isSupportedInterviewType(state.interviewType)) return null
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
