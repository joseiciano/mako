import { describe, expect, it } from 'vitest'
import {
  initialScheduleState,
  scheduleReducer,
  isTimingComplete,
  isAvailabilityComplete,
  isStepComplete,
  buildAiPayload,
  buildP2pPayload,
  getVisibleSteps,
  isSupportedInterviewType,
  isSupportedMode,
  getFieldErrors,
  hasFieldErrors,
  getRetryLabel,
  classifyCreateFailure,
  normalizeRestoredScheduleState,
  restoreScheduleDraft,
  serializeScheduleDraft,
  shouldPersistScheduleDraft,
  buildScheduleDraftV2,
  parseScheduleDraftV2,
  migrateScheduleDraftV1ToV2,
  scheduleDraftV2ToState,
  getSubmissionBranch,
  getSubmissionBranchLabel,
  type ScheduleState,
  type ScheduleDraftV2Envelope,
} from './schedule-flow'
import type { InterviewMode } from '@mako/shared'

describe('schedule-flow', function scheduleFlowSuite() {
  describe('scheduleReducer', function reducerSuite() {
    it('sets interview type', function () {
      const next = scheduleReducer(initialScheduleState, {
        type: 'SET_TYPE',
        payload: 'system_design',
      })
      expect(next.interviewType).toBe('system_design')
      expect(next.step).toBe('type')
    })

    it('sets mode and resets downstream state for ai_led', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        maxMatches: 3,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      }
      const next = scheduleReducer(state, {
        type: 'SET_MODE',
        payload: 'ai_led',
      })
      expect(next.mode).toBe('ai_led')
      expect(next.maxMatches).toBeNull()
      expect(next.slots).toEqual([])
    })

    it('sets mode and resets downstream state for peer_to_peer', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'now',
      }
      const next = scheduleReducer(state, {
        type: 'SET_MODE',
        payload: 'peer_to_peer',
      })
      expect(next.mode).toBe('peer_to_peer')
      expect(next.scheduledAt).toBeNull()
    })

    it('advances from type to mode when type is set', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
      }
      const next = scheduleReducer(state, { type: 'NEXT' })
      expect(next.step).toBe('mode')
    })

    it('blocks advance from type when type is null', function () {
      const next = scheduleReducer(initialScheduleState, { type: 'NEXT' })
      expect(next.step).toBe('type')
    })

    it('advances from mode to timing for ai_led', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        step: 'mode',
      }
      const next = scheduleReducer(state, { type: 'NEXT' })
      expect(next.step).toBe('timing')
    })

    it('advances from mode to availability for peer_to_peer', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        step: 'mode',
      }
      const next = scheduleReducer(state, { type: 'NEXT' })
      expect(next.step).toBe('availability')
    })

    it('blocks advance from mode when mode is null', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
      }
      const next = scheduleReducer(state, { type: 'NEXT' })
      expect(next.step).toBe('mode')
    })

    it('advances from timing to confirm when complete', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        step: 'timing',
        scheduledAt: 'now',
      }
      const next = scheduleReducer(state, { type: 'NEXT' })
      expect(next.step).toBe('confirm')
    })

    it('blocks advance from timing when incomplete', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        step: 'timing',
        scheduledAt: null,
      }
      const next = scheduleReducer(state, { type: 'NEXT' })
      expect(next.step).toBe('timing')
    })

    it('advances from availability to confirm when complete', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        step: 'availability',
        maxMatches: 2,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      }
      const next = scheduleReducer(state, { type: 'NEXT' })
      expect(next.step).toBe('confirm')
    })

    it('blocks advance from availability when incomplete', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        step: 'availability',
        maxMatches: null,
        slots: [],
      }
      const next = scheduleReducer(state, { type: 'NEXT' })
      expect(next.step).toBe('availability')
    })

    it('blocks advance from confirm', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        step: 'confirm',
      }
      const next = scheduleReducer(state, { type: 'NEXT' })
      expect(next.step).toBe('confirm')
    })

    it('goes back from mode to type', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        step: 'mode',
      }
      const next = scheduleReducer(state, { type: 'BACK' })
      expect(next.step).toBe('type')
      expect(next.interviewType).toBe('system_design')
    })

    it('goes back from timing to mode', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        step: 'timing',
        scheduledAt: 'now',
      }
      const next = scheduleReducer(state, { type: 'BACK' })
      expect(next.step).toBe('mode')
      expect(next.scheduledAt).toBe('now')
    })

    it('goes back from availability to mode', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        step: 'availability',
        maxMatches: 2,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      }
      const next = scheduleReducer(state, { type: 'BACK' })
      expect(next.step).toBe('mode')
      expect(next.maxMatches).toBe(2)
      expect(next.slots).toHaveLength(1)
    })

    it('goes back from confirm to timing for ai_led', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        step: 'confirm',
        scheduledAt: 'now',
      }
      const next = scheduleReducer(state, { type: 'BACK' })
      expect(next.step).toBe('timing')
    })

    it('goes back from confirm to availability for peer_to_peer', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        step: 'confirm',
        maxMatches: 2,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      }
      const next = scheduleReducer(state, { type: 'BACK' })
      expect(next.step).toBe('availability')
    })

    it('blocks back from type', function () {
      const next = scheduleReducer(initialScheduleState, { type: 'BACK' })
      expect(next.step).toBe('type')
    })

    it('navigates to a specific step via GO_TO_STEP', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        step: 'confirm',
      }
      const next = scheduleReducer(state, {
        type: 'GO_TO_STEP',
        payload: 'type',
      })
      expect(next.step).toBe('type')
    })

    it('resets to initial state', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        step: 'confirm',
        scheduledAt: 'now',
      }
      const next = scheduleReducer(state, { type: 'RESET' })
      expect(next).toEqual(initialScheduleState)
    })

    it('clears validation error on state change', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        validationError: 'Bad input',
      }
      const next = scheduleReducer(state, {
        type: 'SET_TYPE',
        payload: 'system_design',
      })
      expect(next.validationError).toBeNull()
    })

    it('clears field errors on state change', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        fieldErrors: { interviewType: 'Bad type' },
      }
      const next = scheduleReducer(state, {
        type: 'SET_TYPE',
        payload: 'system_design',
      })
      expect(next.fieldErrors).toBeNull()
    })

    it('sets field errors via SET_FIELD_ERRORS', function () {
      const next = scheduleReducer(initialScheduleState, {
        type: 'SET_FIELD_ERRORS',
        payload: { maxMatches: 'Too low' },
      })
      expect(next.fieldErrors).toEqual({ maxMatches: 'Too low' })
    })
  })

  describe('isTimingComplete', function timingSuite() {
    it('returns true for now', function () {
      expect(
        isTimingComplete({ ...initialScheduleState, scheduledAt: 'now' }),
      ).toBe(true)
    })

    it('returns true for valid ISO datetime', function () {
      expect(
        isTimingComplete({
          ...initialScheduleState,
          scheduledAt: '2026-06-10T10:00:00.000Z',
        }),
      ).toBe(true)
    })

    it('returns false for null', function () {
      expect(
        isTimingComplete({ ...initialScheduleState, scheduledAt: null }),
      ).toBe(false)
    })

    it('returns false for empty string', function () {
      expect(
        isTimingComplete({ ...initialScheduleState, scheduledAt: '' }),
      ).toBe(false)
    })

    it('returns false for invalid datetime', function () {
      expect(
        isTimingComplete({
          ...initialScheduleState,
          scheduledAt: 'not-a-date',
        }),
      ).toBe(false)
    })
  })

  describe('isAvailabilityComplete', function availabilitySuite() {
    it('returns true with valid maxMatches and 60-minute slots', function () {
      expect(
        isAvailabilityComplete({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          maxMatches: 2,
          slots: [
            { startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' },
          ],
        }),
      ).toBe(true)
    })

    it('returns false when maxMatches is null', function () {
      expect(
        isAvailabilityComplete({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          maxMatches: null,
          slots: [
            { startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' },
          ],
        }),
      ).toBe(false)
    })

    it('returns false when maxMatches is zero', function () {
      expect(
        isAvailabilityComplete({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          maxMatches: 0,
          slots: [
            { startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' },
          ],
        }),
      ).toBe(false)
    })

    it('returns false when slots is empty', function () {
      expect(
        isAvailabilityComplete({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          maxMatches: 2,
          slots: [],
        }),
      ).toBe(false)
    })

    it('returns false when a slot is not exactly 60 minutes', function () {
      expect(
        isAvailabilityComplete({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          maxMatches: 2,
          slots: [
            { startTime: '2026-06-10T10:00', endTime: '2026-06-10T10:30' },
          ],
        }),
      ).toBe(false)
    })

    it('returns false when a slot has empty time', function () {
      expect(
        isAvailabilityComplete({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          maxMatches: 2,
          slots: [{ startTime: '', endTime: '' }],
        }),
      ).toBe(false)
    })

    it('returns false when maxMatches is fractional', function () {
      expect(
        isAvailabilityComplete({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          maxMatches: 1.5,
          slots: [
            { startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' },
          ],
        }),
      ).toBe(false)
    })

    it('returns false when interview type is unsupported by current scheduling UI', function () {
      expect(
        isAvailabilityComplete({
          ...initialScheduleState,
          interviewType: 'coding',
          mode: 'peer_to_peer',
          maxMatches: 1,
          slots: [
            { startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' },
          ],
        }),
      ).toBe(false)
    })
  })

  describe('isStepComplete', function stepCompleteSuite() {
    it('type is complete when set', function () {
      expect(
        isStepComplete(
          { ...initialScheduleState, interviewType: 'system_design' },
          'type',
        ),
      ).toBe(true)
    })

    it('mode is complete when set', function () {
      expect(
        isStepComplete(
          { ...initialScheduleState, mode: 'ai_led' },
          'mode',
        ),
      ).toBe(true)
    })

    it('confirm is complete for ai_led when timing complete', function () {
      expect(
        isStepComplete(
          {
            ...initialScheduleState,
            mode: 'ai_led',
            scheduledAt: 'now',
          },
          'confirm',
        ),
      ).toBe(true)
    })

    it('confirm is complete for p2p when availability complete', function () {
      expect(
        isStepComplete(
          {
            ...initialScheduleState,
            interviewType: 'system_design',
            mode: 'peer_to_peer',
            maxMatches: 2,
            slots: [
              {
                startTime: '2026-06-10T10:00',
                endTime: '2026-06-10T11:00',
              },
            ],
          },
          'confirm',
        ),
      ).toBe(true)
    })
  })

  describe('buildAiPayload', function aiPayloadSuite() {
    it('builds payload for now', function () {
      const payload = buildAiPayload({
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'now',
      })
      expect(payload).toEqual({
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      })
    })

    it('builds payload for scheduled datetime', function () {
      const payload = buildAiPayload({
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: '2026-06-10T10:00:00.000Z',
      })
      expect(payload).toEqual({
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: '2026-06-10T10:00:00.000Z',
      })
    })

    it('returns null when mode is not ai_led', function () {
      expect(
        buildAiPayload({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'peer_to_peer',
        }),
      ).toBeNull()
    })

    it('returns null when timing incomplete', function () {
      expect(
        buildAiPayload({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'ai_led',
          scheduledAt: null,
        }),
      ).toBeNull()
    })

    it('returns null when interview type is unsupported by current scheduling UI', function () {
      expect(
        buildAiPayload({
          ...initialScheduleState,
          interviewType: 'coding',
          mode: 'ai_led',
          scheduledAt: 'now',
        }),
      ).toBeNull()
    })

    it('contains only allowed keys', function () {
      const payload = buildAiPayload({
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'now',
      })
      expect(payload).not.toBeNull()
      expect(Object.keys(payload!).sort()).toEqual(['mode', 'scheduled_at', 'type'])
    })
  })

  describe('buildP2pPayload', function p2pPayloadSuite() {
    it('builds payload when complete', function () {
      const payload = buildP2pPayload({
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        maxMatches: 2,
        slots: [
          { startTime: '2026-06-10T10:00:00.000Z', endTime: '2026-06-10T11:00:00.000Z' },
        ],
      })
      expect(payload).toEqual({
        interview_type: 'system_design',
        max_matches: 2,
        slots: [
          {
            start_time: '2026-06-10T10:00:00.000Z',
            end_time: '2026-06-10T11:00:00.000Z',
          },
        ],
      })
    })

    it('returns null when mode is not peer_to_peer', function () {
      expect(
        buildP2pPayload({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'ai_led',
        }),
      ).toBeNull()
    })

    it('returns null when availability incomplete', function () {
      expect(
        buildP2pPayload({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          maxMatches: null,
          slots: [],
        }),
      ).toBeNull()
    })

    it('returns null when maxMatches is fractional', function () {
      expect(
        buildP2pPayload({
          ...initialScheduleState,
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          maxMatches: 1.5,
          slots: [
            { startTime: '2026-06-10T10:00:00.000Z', endTime: '2026-06-10T11:00:00.000Z' },
          ],
        }),
      ).toBeNull()
    })

    it('returns null when interview type is unsupported by current scheduling UI', function () {
      expect(
        buildP2pPayload({
          ...initialScheduleState,
          interviewType: 'coding',
          mode: 'peer_to_peer',
          maxMatches: 1,
          slots: [
            { startTime: '2026-06-10T10:00:00.000Z', endTime: '2026-06-10T11:00:00.000Z' },
          ],
        }),
      ).toBeNull()
    })

    it('contains only allowed keys', function () {
      const payload = buildP2pPayload({
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        maxMatches: 2,
        slots: [
          { startTime: '2026-06-10T10:00:00.000Z', endTime: '2026-06-10T11:00:00.000Z' },
        ],
      })
      expect(payload).not.toBeNull()
      expect(Object.keys(payload!).sort()).toEqual(['interview_type', 'max_matches', 'slots'])
    })

    it('normalizes non-ISO slot times to ISO', function () {
      const payload = buildP2pPayload({
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        maxMatches: 1,
        slots: [
          { startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' },
        ],
      })
      expect(payload).not.toBeNull()
      expect(payload!.slots[0]!.start_time).toBe(new Date('2026-06-10T10:00').toISOString())
      expect(payload!.slots[0]!.end_time).toBe(new Date('2026-06-10T11:00').toISOString())
    })
  })

  describe('getVisibleSteps', function visibleStepsSuite() {
    it('shows type and mode before mode is selected', function () {
      expect(getVisibleSteps(initialScheduleState)).toEqual([
        'type',
        'mode',
        'confirm',
      ])
    })

    it('shows ai branch when ai_led selected', function () {
      expect(
        getVisibleSteps({
          ...initialScheduleState,
          mode: 'ai_led',
        }),
      ).toEqual(['type', 'mode', 'timing', 'confirm'])
    })

    it('shows p2p branch when peer_to_peer selected', function () {
      expect(
        getVisibleSteps({
          ...initialScheduleState,
          mode: 'peer_to_peer',
        }),
      ).toEqual(['type', 'mode', 'availability', 'confirm'])
    })
  })

  describe('getSubmissionBranch', function submissionBranchSuite() {
    it('maps ai_led to ai_direct', function () {
      expect(
        getSubmissionBranch({ ...initialScheduleState, mode: 'ai_led' }),
      ).toBe('ai_direct')
    })

    it('maps peer_to_peer to standard_p2p', function () {
      expect(
        getSubmissionBranch({ ...initialScheduleState, mode: 'peer_to_peer' }),
      ).toBe('standard_p2p')
    })

    it('returns pre_branch for the no-mode pre-submission state', function () {
      expect(getSubmissionBranch(initialScheduleState)).toBe('pre_branch')
    })
  })

  describe('getSubmissionBranchLabel', function submissionBranchLabelSuite() {
    it('renders the exact branch labels for the three submission branches', function () {
      expect(getSubmissionBranchLabel('ai_direct')).toBe('AI Direct')
      expect(getSubmissionBranchLabel('standard_p2p')).toBe(
        'Standard P2P Availability',
      )
      expect(getSubmissionBranchLabel('verified_interviewer')).toBe(
        'Verified Interviewer',
      )
    })
  })

  describe('branch switch resets invalid downstream state', function branchResetSuite() {
    it('switching from p2p to ai_led clears availability state', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        step: 'availability',
        maxMatches: 2,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      }
      const next = scheduleReducer(state, {
        type: 'SET_MODE',
        payload: 'ai_led',
      })
      expect(next.mode).toBe('ai_led')
      expect(next.maxMatches).toBeNull()
      expect(next.slots).toEqual([])
      expect(next.interviewType).toBe('system_design')
    })

    it('switching from ai_led to p2p clears timing state', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        interviewType: 'system_design',
        mode: 'ai_led',
        step: 'timing',
        scheduledAt: 'now',
      }
      const next = scheduleReducer(state, {
        type: 'SET_MODE',
        payload: 'peer_to_peer',
      })
      expect(next.mode).toBe('peer_to_peer')
      expect(next.scheduledAt).toBeNull()
      expect(next.interviewType).toBe('system_design')
    })
  })

  describe('isSupportedInterviewType', function supportedTypeSuite() {
    it('returns true for system_design', function () {
      expect(isSupportedInterviewType('system_design')).toBe(true)
    })

    it('returns false for coding', function () {
      expect(isSupportedInterviewType('coding')).toBe(false)
    })

    it('returns false for behavioral', function () {
      expect(isSupportedInterviewType('behavioral')).toBe(false)
    })
  })

  describe('isSupportedMode', function supportedModeSuite() {
    it('returns true for ai_led', function () {
      expect(isSupportedMode('ai_led')).toBe(true)
    })

    it('returns true for peer_to_peer', function () {
      expect(isSupportedMode('peer_to_peer')).toBe(true)
    })
  })

  describe('getFieldErrors', function fieldErrorsSuite() {
    it('returns empty object for valid initial state', function () {
      expect(getFieldErrors(initialScheduleState)).toEqual({})
    })

    it('flags unsupported interview type', function () {
      const errors = getFieldErrors({
        ...initialScheduleState,
        interviewType: 'coding',
      })
      expect(errors.interviewType).toBeDefined()
    })

    it('flags unsupported mode', function () {
      const errors = getFieldErrors({
        ...initialScheduleState,
        mode: 'unsupported_mode' as InterviewMode,
      })
      expect(errors.mode).toBeDefined()
    })

    it('flags invalid scheduledAt for ai_led', function () {
      const errors = getFieldErrors({
        ...initialScheduleState,
        mode: 'ai_led',
        scheduledAt: 'not-a-date',
      })
      expect(errors.scheduledAt).toBeDefined()
    })

    it('flags non-positive maxMatches for p2p', function () {
      const errors = getFieldErrors({
        ...initialScheduleState,
        mode: 'peer_to_peer',
        maxMatches: 0,
      })
      expect(errors.maxMatches).toBeDefined()
    })

    it('flags invalid slot duration for p2p', function () {
      const errors = getFieldErrors({
        ...initialScheduleState,
        mode: 'peer_to_peer',
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T10:30' }],
      })
      expect(errors.slots).toBeDefined()
    })
  })

  describe('hasFieldErrors', function hasErrorsSuite() {
    it('returns false for empty errors', function () {
      expect(hasFieldErrors({})).toBe(false)
    })

    it('returns true when errors exist', function () {
      expect(hasFieldErrors({ maxMatches: 'Too low' })).toBe(true)
    })
  })

  describe('getRetryLabel', function retryLabelSuite() {
    it('returns p2p retry copy after availability mutation failures', function () {
      expect(getRetryLabel(null, 'Matcher queue unavailable', 'peer_to_peer')).toBe(
        'Retry submitting availability',
      )
    })

    it('returns ai retry copy after create mutation failures', function () {
      expect(getRetryLabel(null, 'Insufficient credits', 'ai_led')).toBe('Retry scheduling')
    })

    it('hides retry copy when validation errors are present', function () {
      expect(getRetryLabel('Please select a valid date and time.', 'Server failed', 'ai_led')).toBeNull()
    })

    it('hides retry copy when no mutation error exists', function () {
      expect(getRetryLabel(null, null, 'peer_to_peer')).toBeNull()
    })

    it('hides retry copy when the failure is not retryable', function () {
      expect(getRetryLabel(null, 'Insufficient credits', 'ai_led', false)).toBeNull()
    })
  })

  describe('classifyCreateFailure', function createFailureSuite() {
    it('classifies non-retryable 4xx as client_rejection', function () {
      expect(
        classifyCreateFailure(
          Object.assign(new Error('Insufficient credits'), { status: 402 }),
        ),
      ).toBe('client_rejection')
      expect(
        classifyCreateFailure(
          Object.assign(new Error('Bad request'), { status: 400 }),
        ),
      ).toBe('client_rejection')
    })

    it('classifies 408 and 429 as retryable_transport', function () {
      expect(
        classifyCreateFailure(Object.assign(new Error('x'), { status: 429 })),
      ).toBe('retryable_transport')
      expect(
        classifyCreateFailure(Object.assign(new Error('x'), { status: 408 })),
      ).toBe('retryable_transport')
    })

    it('classifies server 5xx as ambiguous_transport', function () {
      expect(
        classifyCreateFailure(Object.assign(new Error('x'), { status: 500 })),
      ).toBe('ambiguous_transport')
      expect(
        classifyCreateFailure(Object.assign(new Error('x'), { status: 503 })),
      ).toBe('ambiguous_transport')
    })

    it('classifies missing status as ambiguous_transport', function () {
      expect(classifyCreateFailure(new Error('Network failure'))).toBe(
        'ambiguous_transport',
      )
    })

    it('returns null when there is no error', function () {
      expect(classifyCreateFailure(null)).toBeNull()
    })
  })

  describe('schedule draft restore helpers', function draftRestoreSuite() {
    it('serializes only draft-safe scheduling fields', function () {
      const serialized = serializeScheduleDraft({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'now',
        validationError: 'Do not persist me',
        fieldErrors: { scheduledAt: 'Do not persist me' },
      })

      const parsed = JSON.parse(serialized)
      expect(parsed).toEqual({
        version: 1,
        draft: {
          step: 'confirm',
          interviewType: 'system_design',
          mode: 'ai_led',
          scheduledAt: 'now',
          maxMatches: null,
          slots: [],
        },
      })
    })

    it('restores valid ai draft state', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'now',
      }

      expect(restoreScheduleDraft(serializeScheduleDraft(state))).toEqual(state)
    })

    it('restores valid p2p draft state', function () {
      const state: ScheduleState = {
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        maxMatches: 2,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      }

      expect(restoreScheduleDraft(serializeScheduleDraft(state))).toEqual(state)
    })

    it('rejects malformed and unsupported draft envelopes', function () {
      expect(restoreScheduleDraft(null)).toBeNull()
      expect(restoreScheduleDraft('{not-json')).toBeNull()
      expect(restoreScheduleDraft(JSON.stringify({ version: 99, draft: {} }))).toBeNull()
    })

    it('clears p2p-only fields from restored ai drafts', function () {
      const next = normalizeRestoredScheduleState({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'now',
        maxMatches: 3,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      })

      expect(next.maxMatches).toBeNull()
      expect(next.slots).toEqual([])
      expect(next.step).toBe('confirm')
    })

    it('clears ai-only fields from restored p2p drafts', function () {
      const next = normalizeRestoredScheduleState({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        scheduledAt: 'now',
        maxMatches: 2,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      })

      expect(next.scheduledAt).toBeNull()
      expect(next.step).toBe('confirm')
    })

    it('downgrades confirm when restored ai timing is invalid', function () {
      const next = normalizeRestoredScheduleState({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'not-a-date',
      })

      expect(next.scheduledAt).toBeNull()
      expect(next.step).toBe('timing')
    })

    it('downgrades confirm when restored p2p availability is invalid', function () {
      const next = normalizeRestoredScheduleState({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        maxMatches: 0,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T10:30' }],
      })

      expect(next.maxMatches).toBeNull()
      expect(next.slots).toEqual([])
      expect(next.step).toBe('availability')
    })

    it('reports whether draft contains meaningful progress', function () {
      expect(shouldPersistScheduleDraft(initialScheduleState)).toBe(false)
      expect(
        shouldPersistScheduleDraft({
          ...initialScheduleState,
          interviewType: 'system_design',
        }),
      ).toBe(true)
    })
  })

  describe('buildScheduleDraftV2', function buildV2Suite() {
    it('builds an exact ai_direct envelope from a complete ai draft', function () {
      const envelope = buildScheduleDraftV2({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'now',
      })

      expect(envelope).toEqual({
        version: 'v2',
        branch: 'ai_direct',
        draft: {
          step: 'confirm',
          interviewType: 'system_design',
          mode: 'ai_led',
          scheduledAt: 'now',
          maxMatches: null,
          slots: [],
        },
      })
    })

    it('preserves ISO scheduledAt in ai_direct and clears p2p-only fields', function () {
      const envelope = buildScheduleDraftV2({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: '2026-06-10T10:00:00.000Z',
        maxMatches: 3,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      })

      expect(envelope).toEqual({
        version: 'v2',
        branch: 'ai_direct',
        draft: {
          step: 'confirm',
          interviewType: 'system_design',
          mode: 'ai_led',
          scheduledAt: '2026-06-10T10:00:00.000Z',
          maxMatches: null,
          slots: [],
        },
      })
    })

    it('builds an exact standard_p2p envelope carrying slots losslessly', function () {
      const envelope = buildScheduleDraftV2({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        scheduledAt: 'now',
        maxMatches: 2,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      })

      expect(envelope).toEqual({
        version: 'v2',
        branch: 'standard_p2p',
        draft: {
          step: 'confirm',
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          scheduledAt: null,
          maxMatches: 2,
          slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
        },
      })
    })

    it('carries incomplete p2p availability (empty slots, null maxMatches) through standard_p2p', function () {
      const envelope = buildScheduleDraftV2({
        ...initialScheduleState,
        step: 'availability',
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        scheduledAt: 'now',
        maxMatches: null,
        slots: [],
      })

      expect(envelope).toEqual({
        version: 'v2',
        branch: 'standard_p2p',
        draft: {
          step: 'availability',
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          scheduledAt: null,
          maxMatches: null,
          slots: [],
        },
      })
    })

    it('builds an exact pre_branch envelope for an incomplete no-mode draft', function () {
      const envelope = buildScheduleDraftV2({
        ...initialScheduleState,
        step: 'mode',
        interviewType: 'system_design',
      })

      expect(envelope).toEqual({
        version: 'v2',
        branch: 'pre_branch',
        draft: {
          step: 'mode',
          interviewType: 'system_design',
          mode: null,
          scheduledAt: null,
          maxMatches: null,
          slots: [],
        },
      })
    })

    it('builds a pre_branch envelope for the pristine initial state', function () {
      const envelope = buildScheduleDraftV2(initialScheduleState)

      expect(envelope).toEqual({
        version: 'v2',
        branch: 'pre_branch',
        draft: {
          step: 'type',
          interviewType: null,
          mode: null,
          scheduledAt: null,
          maxMatches: null,
          slots: [],
        },
      })
    })

    it('normalizes an invalid ai scheduledAt to null before tagging ai_direct', function () {
      const envelope = buildScheduleDraftV2({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'not-a-date',
      })

      expect(envelope.branch).toBe('ai_direct')
      if (envelope.branch === 'ai_direct') {
        expect(envelope.draft.scheduledAt).toBeNull()
        expect(envelope.draft.step).toBe('timing')
      }
    })
  })

  describe('parseScheduleDraftV2', function parseV2Suite() {
    it('accepts each exact v2 envelope shape', function () {
      const preBranch = parseScheduleDraftV2(
        JSON.stringify({
          version: 'v2',
          branch: 'pre_branch',
          draft: {
            step: 'type',
            interviewType: null,
            mode: null,
            scheduledAt: null,
            maxMatches: null,
            slots: [],
          },
        }),
      )
      expect(preBranch).toEqual({
        version: 'v2',
        branch: 'pre_branch',
        draft: {
          step: 'type',
          interviewType: null,
          mode: null,
          scheduledAt: null,
          maxMatches: null,
          slots: [],
        },
      })

      const aiDirect = parseScheduleDraftV2(
        JSON.stringify({
          version: 'v2',
          branch: 'ai_direct',
          draft: {
            step: 'confirm',
            interviewType: 'system_design',
            mode: 'ai_led',
            scheduledAt: 'now',
            maxMatches: null,
            slots: [],
          },
        }),
      )
      expect(aiDirect).toEqual({
        version: 'v2',
        branch: 'ai_direct',
        draft: {
          step: 'confirm',
          interviewType: 'system_design',
          mode: 'ai_led',
          scheduledAt: 'now',
          maxMatches: null,
          slots: [],
        },
      })

      const standardP2p = parseScheduleDraftV2(
        JSON.stringify({
          version: 'v2',
          branch: 'standard_p2p',
          draft: {
            step: 'availability',
            interviewType: 'system_design',
            mode: 'peer_to_peer',
            scheduledAt: null,
            maxMatches: null,
            slots: [],
          },
        }),
      )
      expect(standardP2p).toEqual({
        version: 'v2',
        branch: 'standard_p2p',
        draft: {
          step: 'availability',
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          scheduledAt: null,
          maxMatches: null,
          slots: [],
        },
      })

      const verified = parseScheduleDraftV2(
        JSON.stringify({
          version: 'v2',
          branch: 'verified_interviewer',
          slotId: '0c7e9f0e-0e9a-4c8e-9b6d-9f7a2e1c8d4a',
          idempotencyKey: 'f1d2c3b4-5a6e-4f8b-9c0d-1e2f3a4b5c6d',
          startedAt: '2026-06-10T10:00:00.000Z',
        }),
      )
      expect(verified).toEqual({
        version: 'v2',
        branch: 'verified_interviewer',
        slotId: '0c7e9f0e-0e9a-4c8e-9b6d-9f7a2e1c8d4a',
        idempotencyKey: 'f1d2c3b4-5a6e-4f8b-9c0d-1e2f3a4b5c6d',
        startedAt: '2026-06-10T10:00:00.000Z',
      })
    })

    it('rejects malformed json, wrong version, missing branch, and unknown branches', function () {
      expect(parseScheduleDraftV2('{not-json')).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 2,
            branch: 'ai_direct',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'ai_led',
              scheduledAt: 'now',
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'ai_led',
              scheduledAt: 'now',
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'unknown_branch',
            draft: {},
          }),
        ),
      ).toBeNull()
    })

    it('rejects ai_direct envelopes that are not the exact ai normalized shape', function () {
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'ai_direct',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: 2,
              slots: [{ startTime: 'x', endTime: 'y' }],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'ai_direct',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'ai_led',
              scheduledAt: '2026-06-10T10:00',
              maxMatches: 3,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'ai_direct',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'ai_led',
              scheduledAt: '',
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'ai_direct',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'ai_led',
              scheduledAt: 'not-a-date',
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
    })

    it('accepts incomplete ai_direct envelopes whose scheduledAt is null', function () {
      const envelope = parseScheduleDraftV2(
        JSON.stringify({
          version: 'v2',
          branch: 'ai_direct',
          draft: {
            step: 'timing',
            interviewType: 'system_design',
            mode: 'ai_led',
            scheduledAt: null,
            maxMatches: null,
            slots: [],
          },
        }),
      )

      expect(envelope).toEqual({
        version: 'v2',
        branch: 'ai_direct',
        draft: {
          step: 'timing',
          interviewType: 'system_design',
          mode: 'ai_led',
          scheduledAt: null,
          maxMatches: null,
          slots: [],
        },
      })
    })

    it('rejects standard_p2p envelopes with non-null scheduledAt or invalid maxMatches', function () {
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: 'now',
              maxMatches: 2,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: 0,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: 1.5,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
    })

    it('rejects standard_p2p envelopes with slots that are not ISO-8601 60-minute windows', function () {
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'availability',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: 2,
              slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T10:30' }],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'availability',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: 2,
              slots: [{ startTime: 'not-a-date', endTime: '2026-06-10T11:00' }],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'availability',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: 2,
              slots: [{ startTime: '', endTime: '' }],
            },
          }),
        ),
      ).toBeNull()
    })

    it('rejects pre_branch envelopes that carry any mode/submission state', function () {
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'pre_branch',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'ai_led',
              scheduledAt: null,
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'pre_branch',
            draft: {
              step: 'type',
              interviewType: null,
              mode: null,
              scheduledAt: null,
              maxMatches: null,
              slots: [{ startTime: 'x', endTime: 'y' }],
            },
          }),
        ),
      ).toBeNull()
    })

    it('rejects verified_interviewer envelopes missing fields or with malformed values', function () {
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'verified_interviewer',
            slotId: 'not-a-uuid',
            idempotencyKey: 'f1d2c3b4-5a6e-4f8b-9c0d-1e2f3a4b5c6d',
            startedAt: '2026-06-10T10:00:00.000Z',
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'verified_interviewer',
            slotId: '0c7e9f0e-0e9a-4c8e-9b6d-9f7a2e1c8d4a',
            startedAt: '2026-06-10T10:00:00.000Z',
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'verified_interviewer',
            slotId: '0c7e9f0e-0e9a-4c8e-9b6d-9f7a2e1c8d4a',
            idempotencyKey: 'f1d2c3b4-5a6e-4f8b-9c0d-1e2f3a4b5c6d',
            startedAt: 'not-a-date',
          }),
        ),
      ).toBeNull()
    })

    it('rejects unsupported interview types that the normalized flow would reset', function () {
      // 'coding' is a valid enum value but is not supported by this flow, which
      // normalizes it back to the untouched initial state on restore.
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'ai_direct',
            draft: {
              step: 'confirm',
              interviewType: 'coding',
              mode: 'ai_led',
              scheduledAt: 'now',
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'availability',
              interviewType: 'coding',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: 2,
              slots: [
                { startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' },
              ],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'pre_branch',
            draft: {
              step: 'mode',
              interviewType: 'coding',
              mode: null,
              scheduledAt: null,
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
    })

    it('rejects branch-inappropriate steps instead of clamping them on restore', function () {
      // 'availability' is not in the ai_led step order; restore clamps it to
      // the ai max step, so the persisted draft would not survive losslessly.
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'ai_direct',
            draft: {
              step: 'availability',
              interviewType: 'system_design',
              mode: 'ai_led',
              scheduledAt: 'now',
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      // 'timing' is not in the peer_to_peer step order; restore clamps it.
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'timing',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: 2,
              slots: [
                { startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' },
              ],
            },
          }),
        ),
      ).toBeNull()
      // pre_branch has no mode yet; only the pre-mode steps are restorable.
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'pre_branch',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: null,
              scheduledAt: null,
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
    })

    it('rejects parseable non-ISO-8601 timestamps in scheduledAt, startedAt, and slots', function () {
      // 'June 10, 2026' is parseable by Date but is not ISO-8601.
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'ai_direct',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'ai_led',
              scheduledAt: 'June 10, 2026',
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      // A date-only string is not a full ISO-8601 timestamp (no time component).
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'ai_direct',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'ai_led',
              scheduledAt: '2026-06-10',
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'verified_interviewer',
            slotId: '0c7e9f0e-0e9a-4c8e-9b6d-9f7a2e1c8d4a',
            idempotencyKey: 'f1d2c3b4-5a6e-4f8b-9c0d-1e2f3a4b5c6d',
            startedAt: 'June 10, 2026',
          }),
        ),
      ).toBeNull()
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'availability',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: 2,
              slots: [
                { startTime: 'June 10, 2026 10:00', endTime: '2026-06-10T11:00' },
              ],
            },
          }),
        ),
      ).toBeNull()
    })

    it('rejects envelopes whose restore would alter persisted normalized values', function () {
      // A confirm-step ai_direct draft with no scheduledAt is not timing
      // complete; restore clamps the step to 'timing'.
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'ai_direct',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'ai_led',
              scheduledAt: null,
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      // A confirm-step standard_p2p draft with no availability is not complete;
      // restore clamps the step to 'availability'.
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
      // A complete standard_p2p draft at 'confirm' restores losslessly and is
      // preserved (guard against over-rejection).
      expect(
        parseScheduleDraftV2(
          JSON.stringify({
            version: 'v2',
            branch: 'standard_p2p',
            draft: {
              step: 'confirm',
              interviewType: 'system_design',
              mode: 'peer_to_peer',
              scheduledAt: null,
              maxMatches: 2,
              slots: [
                { startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' },
              ],
            },
          }),
        ),
      ).not.toBeNull()
    })
  })

  describe('migrateScheduleDraftV1ToV2', function migrateV1Suite() {
    const aiDraft: ScheduleState = {
      ...initialScheduleState,
      step: 'confirm',
      interviewType: 'system_design',
      mode: 'ai_led',
      scheduledAt: 'now',
      validationError: null,
      fieldErrors: null,
    }

    const p2pDraft: ScheduleState = {
      ...initialScheduleState,
      step: 'confirm',
      interviewType: 'system_design',
      mode: 'peer_to_peer',
      scheduledAt: null,
      maxMatches: 2,
      slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      validationError: null,
      fieldErrors: null,
    }

    it('maps a complete v1 ai draft to its unchanged ai_direct branch', function () {
      const migrated = migrateScheduleDraftV1ToV2(serializeScheduleDraft(aiDraft))

      expect(migrated).toEqual({
        version: 'v2',
        branch: 'ai_direct',
        draft: {
          step: 'confirm',
          interviewType: 'system_design',
          mode: 'ai_led',
          scheduledAt: 'now',
          maxMatches: null,
          slots: [],
        },
      })
    })

    it('maps a complete v1 p2p draft to its unchanged standard_p2p branch losslessly', function () {
      const migrated = migrateScheduleDraftV1ToV2(serializeScheduleDraft(p2pDraft))

      expect(migrated).toEqual({
        version: 'v2',
        branch: 'standard_p2p',
        draft: {
          step: 'confirm',
          interviewType: 'system_design',
          mode: 'peer_to_peer',
          scheduledAt: null,
          maxMatches: 2,
          slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
        },
      })
    })

    it('maps an incomplete v1 draft with no submission branch to pre_branch', function () {
      const incomplete: ScheduleState = {
        ...initialScheduleState,
        step: 'mode',
        interviewType: 'system_design',
        validationError: null,
        fieldErrors: null,
      }

      const migrated = migrateScheduleDraftV1ToV2(serializeScheduleDraft(incomplete))

      expect(migrated).toEqual({
        version: 'v2',
        branch: 'pre_branch',
        draft: {
          step: 'mode',
          interviewType: 'system_design',
          mode: null,
          scheduledAt: null,
          maxMatches: null,
          slots: [],
        },
      })
    })

    it('rejects malformed and unknown v1 envelopes', function () {
      expect(migrateScheduleDraftV1ToV2('{not-json')).toBeNull()
      expect(
        migrateScheduleDraftV1ToV2(
          JSON.stringify({ version: 99, draft: {} }),
        ),
      ).toBeNull()
      expect(
        migrateScheduleDraftV1ToV2(
          JSON.stringify({
            version: 1,
            draft: {
              step: 'not-a-step',
              interviewType: 'system_design',
              mode: null,
              scheduledAt: null,
              maxMatches: null,
              slots: [],
            },
          }),
        ),
      ).toBeNull()
    })

    it('never reinterprets a v1 p2p draft as verified_interviewer', function () {
      const migrated = migrateScheduleDraftV1ToV2(serializeScheduleDraft(p2pDraft))

      expect(migrated).not.toBeNull()
      expect(migrated!.branch).toBe('standard_p2p')
    })

    it('produces a migrated envelope that parses back losslessly', function () {
      const migrated = migrateScheduleDraftV1ToV2(serializeScheduleDraft(p2pDraft))
      expect(parseScheduleDraftV2(JSON.stringify(migrated))).toEqual(migrated)
    })
  })

  describe('scheduleDraftV2ToState', function v2ToStateSuite() {
    it('restores an ai_direct envelope to ai schedule state', function () {
      const envelope = buildScheduleDraftV2({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'now',
      })

      const state = scheduleDraftV2ToState(envelope)
      expect(state).toEqual({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: 'now',
      })
    })

    it('restores a standard_p2p envelope to p2p schedule state', function () {
      const envelope = buildScheduleDraftV2({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        maxMatches: 2,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      })

      const state = scheduleDraftV2ToState(envelope)
      expect(state).toEqual({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'peer_to_peer',
        maxMatches: 2,
        slots: [{ startTime: '2026-06-10T10:00', endTime: '2026-06-10T11:00' }],
      })
    })

    it('restores a pre_branch envelope to the normalized no-mode state', function () {
      const envelope = buildScheduleDraftV2({
        ...initialScheduleState,
        step: 'mode',
        interviewType: 'system_design',
      })

      const state = scheduleDraftV2ToState(envelope)
      expect(state).toEqual({
        ...initialScheduleState,
        step: 'mode',
        interviewType: 'system_design',
      })
    })

    it('returns null for a verified_interviewer envelope (no schedule state)', function () {
      const envelope: ScheduleDraftV2Envelope = {
        version: 'v2',
        branch: 'verified_interviewer',
        slotId: '0c7e9f0e-0e9a-4c8e-9b6d-9f7a2e1c8d4a',
        idempotencyKey: 'f1d2c3b4-5a6e-4f8b-9c0d-1e2f3a4b5c6d',
        startedAt: '2026-06-10T10:00:00.000Z',
      }

      expect(scheduleDraftV2ToState(envelope)).toBeNull()
    })
  })
})
