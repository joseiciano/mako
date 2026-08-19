import type { InterviewType, InterviewMode } from '@mako/shared'
import { isUuid } from '../../../lib/validation'

export const supportedInterviewTypes: InterviewType[] = ['system_design']
export const supportedModes: InterviewMode[] = ['ai_led', 'peer_to_peer']
export const SCHEDULE_DRAFT_STORAGE_KEY = 'mako:schedule-flow:draft:v1'
export const SCHEDULE_DRAFT_V2_STORAGE_KEY = 'mako:schedule-flow:draft:v2'
export const PENDING_CREATE_GUARD_KEY = 'mako:schedule-flow:pending-create:v1'

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

export type ScheduleDraftV2Branch =
  | 'pre_branch'
  | 'ai_direct'
  | 'standard_p2p'
  | 'verified_interviewer'

export type ScheduleDraftPreBranchEnvelope = {
  version: 'v2'
  branch: 'pre_branch'
  draft: {
    step: ScheduleStep
    interviewType: InterviewType | null
    mode: null
    scheduledAt: null
    maxMatches: null
    slots: []
  }
}

export type ScheduleDraftAiDirectEnvelope = {
  version: 'v2'
  branch: 'ai_direct'
  draft: {
    step: ScheduleStep
    interviewType: InterviewType | null
    mode: 'ai_led'
    scheduledAt: 'now' | string | null
    maxMatches: null
    slots: []
  }
}

export type ScheduleDraftStandardP2pEnvelope = {
  version: 'v2'
  branch: 'standard_p2p'
  draft: {
    step: ScheduleStep
    interviewType: InterviewType | null
    mode: 'peer_to_peer'
    scheduledAt: null
    maxMatches: number | null
    slots: FlowSlot[]
  }
}

export type ScheduleDraftVerifiedInterviewerEnvelope = {
  version: 'v2'
  branch: 'verified_interviewer'
  slotId: string
  idempotencyKey: string
  startedAt: string
}

export type ScheduleDraftV2Envelope =
  | ScheduleDraftPreBranchEnvelope
  | ScheduleDraftAiDirectEnvelope
  | ScheduleDraftStandardP2pEnvelope
  | ScheduleDraftVerifiedInterviewerEnvelope

/**
 * The submission branches exposed by `/interviews/new`: the three selectable
 * branches (`ai_direct`, `standard_p2p`, `verified_interviewer`) plus the
 * `pre_branch` pre-submission state shown before a branch is chosen. Mirrors
 * the v2 draft envelope `branch` discriminator exactly.
 */
export type ScheduleSubmissionBranch = ScheduleDraftV2Branch

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

function parseDraftInterviewType(value: unknown): InterviewType | null {
  if (value === null) return null
  return typeof value === 'string' ? (value as InterviewType) : null
}

function parseDraftMode(value: unknown): InterviewMode | null {
  if (value === null) return null
  return typeof value === 'string' ? (value as InterviewMode) : null
}

function parseDraftScheduledAt(value: unknown): 'now' | string | null {
  if (value === null) return null
  return typeof value === 'string' ? value : null
}

function parseDraftMaxMatches(value: unknown): number | null {
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

  if (value.maxMatches !== null && typeof value.maxMatches !== 'number') return null
  const maxMatches = parseDraftMaxMatches(value.maxMatches)

  return {
    step: value.step,
    interviewType: parseDraftInterviewType(value.interviewType),
    mode: parseDraftMode(value.mode),
    scheduledAt: parseDraftScheduledAt(value.scheduledAt),
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

// ---------------------------------------------------------------------------
// v2 draft envelopes (mako:schedule-flow:draft:v2 in localStorage)
// ---------------------------------------------------------------------------

type V2DraftFields = {
  step: ScheduleStep
  interviewType: InterviewType | null
  mode: InterviewMode | null
  scheduledAt: 'now' | string | null
  maxMatches: number | null
  slots: FlowSlot[]
}

const ISO_8601_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/

/**
 * Strict ISO-8601 timestamp check. The value must match the extended ISO-8601
 * datetime representation (`YYYY-MM-DDTHH:mm` with optional seconds,
 * fractional seconds, and `Z`/`±HH:mm` offset) and be a real date per the spec
 * grammar. Strings a generic `Date` parse happens to accept, such as
 * `"June 10, 2026"` or date-only `"2026-06-10"`, are rejected.
 */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  if (!ISO_8601_TIMESTAMP_PATTERN.test(value)) return false
  return !Number.isNaN(new Date(value).valueOf())
}

function parseV2DraftFields(value: unknown): V2DraftFields | null {
  if (!isRecord(value)) return null

  const step = value.step
  if (!isSupportedStep(step)) return null

  const slots = Array.isArray(value.slots) ? value.slots : null
  if (slots === null || !slots.every(isFlowSlot)) return null

  if (value.interviewType !== null && typeof value.interviewType !== 'string') {
    return null
  }
  if (value.mode !== null && typeof value.mode !== 'string') return null
  if (value.scheduledAt !== null && typeof value.scheduledAt !== 'string') {
    return null
  }
  if (value.maxMatches !== null && typeof value.maxMatches !== 'number') {
    return null
  }

  return {
    step,
    interviewType:
      typeof value.interviewType === 'string'
        ? (value.interviewType as InterviewType)
        : null,
    mode: typeof value.mode === 'string' ? (value.mode as InterviewMode) : null,
    scheduledAt:
      typeof value.scheduledAt === 'string' ? value.scheduledAt : null,
    maxMatches: typeof value.maxMatches === 'number' ? value.maxMatches : null,
    slots,
  }
}

function parseScheduleDraftV2Envelope(value: unknown): ScheduleDraftV2Envelope | null {
  if (!isRecord(value)) return null
  if (value.version !== 'v2') return null

  if (value.branch === 'verified_interviewer') {
    const slotId = value.slotId
    const idempotencyKey = value.idempotencyKey
    const startedAt = value.startedAt
    if (!isUuid(slotId) || !isUuid(idempotencyKey)) return null
    if (!isIsoDate(startedAt)) return null

    return {
      version: 'v2',
      branch: 'verified_interviewer',
      slotId,
      idempotencyKey,
      startedAt,
    }
  }

  const fields = parseV2DraftFields(value.draft)
  if (fields === null) return null

  let envelope: ScheduleDraftV2Envelope | null = null

  if (value.branch === 'pre_branch') {
    if (
      fields.mode !== null ||
      fields.scheduledAt !== null ||
      fields.maxMatches !== null ||
      fields.slots.length !== 0
    ) {
      return null
    }

    envelope = {
      version: 'v2',
      branch: 'pre_branch',
      draft: {
        step: fields.step,
        interviewType: fields.interviewType,
        mode: null,
        scheduledAt: null,
        maxMatches: null,
        slots: [],
      },
    }
  } else if (value.branch === 'ai_direct') {
    if (fields.mode !== 'ai_led') return null
    if (fields.maxMatches !== null || fields.slots.length !== 0) return null
    // scheduledAt may be null for an incomplete AI Direct draft (time not yet
    // selected); the literal 'now' is allowed; any other value must be a
    // strict ISO-8601 timestamp.
    if (
      fields.scheduledAt !== null &&
      fields.scheduledAt !== 'now' &&
      !isIsoDate(fields.scheduledAt)
    ) {
      return null
    }

    envelope = {
      version: 'v2',
      branch: 'ai_direct',
      draft: {
        step: fields.step,
        interviewType: fields.interviewType,
        mode: 'ai_led',
        scheduledAt: fields.scheduledAt,
        maxMatches: null,
        slots: [],
      },
    }
  } else if (value.branch === 'standard_p2p') {
    if (fields.mode !== 'peer_to_peer') return null
    if (fields.scheduledAt !== null) return null
    if (
      fields.maxMatches !== null &&
      (!Number.isInteger(fields.maxMatches) || fields.maxMatches <= 0)
    ) {
      return null
    }
    // standard_p2p slots use the exact v1 `isValidSlot` semantics: any
    // Date-parseable 60-minute window, including non-ISO strings such as
    // "June 10, 2026 10:00". This lets valid normalized v1 P2P drafts migrate
    // losslessly instead of being rejected for not matching strict ISO-8601.
    if (!fields.slots.every(isValidSlot)) return null

    envelope = {
      version: 'v2',
      branch: 'standard_p2p',
      draft: {
        step: fields.step,
        interviewType: fields.interviewType,
        mode: 'peer_to_peer',
        scheduledAt: null,
        maxMatches: fields.maxMatches,
        slots: fields.slots,
      },
    }
  } else {
    return null
  }

  // Reject any envelope whose restore would alter a persisted normalized
  // value (e.g. an unsupported interview type reset to null, a cross-branch
  // step clamped by `normalizeRestoredScheduleState`, or a confirm step whose
  // branch data is not complete). A losslessly restorable envelope round-trips
  // back to the identical envelope.
  const restored = scheduleDraftV2ToState(envelope)
  if (restored === null) return null
  if (JSON.stringify(buildScheduleDraftV2(restored)) !== JSON.stringify(envelope)) {
    return null
  }

  return envelope
}

/**
 * Parses and strictly validates a serialized v2 draft envelope. Rejects
 * malformed JSON, wrong versions, missing/unknown branches, and envelopes
 * that do not match the exact normalized shape for their branch.
 */
export function parseScheduleDraftV2(serialized: string): ScheduleDraftV2Envelope | null {
  try {
    const parsed: unknown = JSON.parse(serialized)
    return parseScheduleDraftV2Envelope(parsed)
  } catch {
    return null
  }
}

/**
 * Builds the exact v2 envelope for a schedule state. The state is normalized
 * first (mirroring the v1 normalize/restore contract), so any valid
 * normalized/restorable v1 state maps losslessly to its v2 branch:
 * `ai_led` -> `ai_direct`, `peer_to_peer` -> `standard_p2p`, and a no-mode
 * state -> `pre_branch`.
 */
export function buildScheduleDraftV2(state: ScheduleState): ScheduleDraftV2Envelope {
  const normalized = normalizeRestoredScheduleState(state)

  if (normalized.mode === 'ai_led') {
    const envelope: ScheduleDraftAiDirectEnvelope = {
      version: 'v2',
      branch: 'ai_direct',
      draft: {
        step: normalized.step,
        interviewType: normalized.interviewType,
        mode: 'ai_led',
        scheduledAt: normalized.scheduledAt,
        maxMatches: null,
        slots: [],
      },
    }
    return envelope
  }

  if (normalized.mode === 'peer_to_peer') {
    const envelope: ScheduleDraftStandardP2pEnvelope = {
      version: 'v2',
      branch: 'standard_p2p',
      draft: {
        step: normalized.step,
        interviewType: normalized.interviewType,
        mode: 'peer_to_peer',
        scheduledAt: null,
        maxMatches: normalized.maxMatches,
        slots: normalized.slots,
      },
    }
    return envelope
  }

  const envelope: ScheduleDraftPreBranchEnvelope = {
    version: 'v2',
    branch: 'pre_branch',
    draft: {
      step: normalized.step,
      interviewType: normalized.interviewType,
      mode: null,
      scheduledAt: null,
      maxMatches: null,
      slots: [],
    },
  }
  return envelope
}

/**
 * Migrates a serialized v1 draft envelope to its unchanged v2 branch. Complete
 * AI/P2P drafts map to `ai_direct`/`standard_p2p`; incomplete drafts (no
 * submission branch selected) map to `pre_branch`. Malformed/unknown v1
 * envelopes are rejected (null). A v1 P2P draft is never reinterpreted as
 * `verified_interviewer`.
 */
export function migrateScheduleDraftV1ToV2(
  serializedV1: string,
): ScheduleDraftV2Envelope | null {
  const restored = restoreScheduleDraft(serializedV1)
  if (restored === null) return null

  return buildScheduleDraftV2(restored)
}

/**
 * Converts a validated v2 envelope back to schedule state. Draft branches are
 * restored through the v1 normalize/restore contract (lossless for the valid
 * normalized shapes). The `verified_interviewer` branch has no schedule state
 * and returns null; it is handled by the premium claim flow instead.
 */
export function scheduleDraftV2ToState(
  envelope: ScheduleDraftV2Envelope,
): ScheduleState | null {
  if (envelope.branch === 'verified_interviewer') return null

  return normalizeRestoredScheduleState({
    ...initialScheduleState,
    ...envelope.draft,
  })
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

export type CreateFailureKind =
  | 'client_rejection'
  | 'retryable_transport'
  | 'ambiguous_transport'

const RETRYABLE_TRANSPORT_STATUSES = new Set([408, 429])

/**
 * Classifies an interview-create failure so the UI can decide whether retry
 * is safe, whether a definitive rejection occurred, or whether the outcome is
 * ambiguous (server may have committed before failing) and a pending-create
 * guard is required.
 *
 * - 4xx client statuses (e.g. 400, 402 quota, 409, 422) are definitive
 *   rejections: no retry, no success claim.
 * - 408/429 are known transient transport rejections: safe to retry.
 * - 5xx or a missing status (network failure) are ambiguous: the create may
 *   have been processed server-side, so a pending-create guard is required.
 */
export function classifyCreateFailure(error: Error | null): CreateFailureKind | null {
  if (error === null) return null

  const status = (error as { status?: number }).status

  if (status !== undefined && status >= 400 && status < 500) {
    return RETRYABLE_TRANSPORT_STATUSES.has(status)
      ? 'retryable_transport'
      : 'client_rejection'
  }

  return 'ambiguous_transport'
}

export function getRetryLabel(
  validationError: string | null,
  mutationError: string | null,
  lastSubmissionBranch: SubmissionBranch | null,
  isRetryable = true,
): string | null {
  if (validationError !== null || mutationError === null) return null
  if (!isRetryable) return null

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
      return 'Branch'
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

/**
 * Derives the submission branch for a schedule state. `ai_led` and
 * `peer_to_peer` map to their v2 submission branches; a no-mode state is
 * still in the pre-submission `pre_branch`. A `verified_interviewer` branch
 * has no schedule state and is tracked by the scheduler surface instead.
 */
export function getSubmissionBranch(
  state: ScheduleState,
): ScheduleSubmissionBranch {
  if (state.mode === 'ai_led') return 'ai_direct'
  if (state.mode === 'peer_to_peer') return 'standard_p2p'
  return 'pre_branch'
}

export function getSubmissionBranchLabel(
  branch: ScheduleSubmissionBranch,
): string {
  switch (branch) {
    case 'pre_branch':
      return 'Not selected'
    case 'ai_direct':
      return 'AI Direct'
    case 'standard_p2p':
      return 'Standard P2P Availability'
    case 'verified_interviewer':
      return 'Verified Interviewer'
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
