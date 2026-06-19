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
  normalizeRestoredScheduleState,
  restoreScheduleDraft,
  serializeScheduleDraft,
  shouldPersistScheduleDraft,
  type ScheduleState,
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
})
