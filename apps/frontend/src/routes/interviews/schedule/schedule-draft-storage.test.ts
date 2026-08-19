import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  SCHEDULE_DRAFT_STORAGE_KEY,
  SCHEDULE_DRAFT_V2_STORAGE_KEY,
  initialScheduleState,
  serializeScheduleDraft,
  type ScheduleState,
} from './schedule-flow'
import {
  clearScheduleDraftStorage,
  persistScheduleDraft,
  persistVerifiedInterviewerClaim,
  readScheduleDraftV2,
  restoreScheduleDraftWithMigration,
} from './schedule-draft-storage'

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

const claim = {
  slotId: '0c7e9f0e-0e9a-4c8e-9b6d-9f7a2e1c8d4a',
  idempotencyKey: 'f1d2c3b4-5a6e-4f8b-9c0d-1e2f3a4b5c6d',
  startedAt: '2026-06-10T10:00:00.000Z',
}

describe('schedule-draft-storage', function scheduleDraftStorageSuite() {
  beforeEach(function resetStorage() {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  describe('restore order and migration', function restoreSuite() {
    it('reads the v2 localStorage key first and ignores an existing v1 draft', function () {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        JSON.stringify({
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
        }),
      )
      window.sessionStorage.setItem(
        SCHEDULE_DRAFT_STORAGE_KEY,
        serializeScheduleDraft(aiDraft),
      )

      const restored = restoreScheduleDraftWithMigration()

      expect(restored).toEqual(p2pDraft)
      expect(window.sessionStorage.getItem(SCHEDULE_DRAFT_STORAGE_KEY)).not.toBeNull()
    })

    it('falls back to v1 sessionStorage, migrates it to v2 localStorage, then removes v1 (write-before-delete)', function () {
      window.sessionStorage.setItem(
        SCHEDULE_DRAFT_STORAGE_KEY,
        serializeScheduleDraft(aiDraft),
      )

      const restored = restoreScheduleDraftWithMigration()

      expect(restored).toEqual(aiDraft)

      const serializedV2 = window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)
      expect(serializedV2).not.toBeNull()
      expect(JSON.parse(serializedV2!)).toEqual({
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
      expect(window.sessionStorage.getItem(SCHEDULE_DRAFT_STORAGE_KEY)).toBeNull()
    })

    it('migrates an incomplete v1 draft to the pre_branch variant', function () {
      window.sessionStorage.setItem(
        SCHEDULE_DRAFT_STORAGE_KEY,
        serializeScheduleDraft({
          ...initialScheduleState,
          step: 'mode',
          interviewType: 'system_design',
          validationError: null,
          fieldErrors: null,
        }),
      )

      const restored = restoreScheduleDraftWithMigration()

      expect(restored).toEqual({
        ...initialScheduleState,
        step: 'mode',
        interviewType: 'system_design',
      })
      const serializedV2 = window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)
      expect(JSON.parse(serializedV2!)).toEqual({
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

    it('rejects malformed v1 drafts, removes them, and writes nothing to v2', function () {
      window.sessionStorage.setItem(SCHEDULE_DRAFT_STORAGE_KEY, '{not-json')

      const restored = restoreScheduleDraftWithMigration()

      expect(restored).toBeNull()
      expect(window.sessionStorage.getItem(SCHEDULE_DRAFT_STORAGE_KEY)).toBeNull()
      expect(window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)).toBeNull()
    })

    it('leaves v1 intact and recovers on the next restore when the v2 write fails (interrupted migration)', function () {
      window.sessionStorage.setItem(
        SCHEDULE_DRAFT_STORAGE_KEY,
        serializeScheduleDraft(p2pDraft),
      )

      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(function throwOnWrite() {
          throw new Error('storage quota exceeded')
        })

      const restored = restoreScheduleDraftWithMigration()

      // The in-memory state is still restored losslessly.
      expect(restored).toEqual(p2pDraft)
      // v1 is left intact so the next restore can retry the sequence.
      expect(window.sessionStorage.getItem(SCHEDULE_DRAFT_STORAGE_KEY)).not.toBeNull()
      expect(window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)).toBeNull()
      expect(setItemSpy).toHaveBeenCalled()

      setItemSpy.mockRestore()

      // Next restore retries read-v1 -> write-v2 -> remove-v1 successfully.
      const recovered = restoreScheduleDraftWithMigration()
      expect(recovered).toEqual(p2pDraft)
      expect(window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)).not.toBeNull()
      expect(window.sessionStorage.getItem(SCHEDULE_DRAFT_STORAGE_KEY)).toBeNull()
    })

    it('never migrates a v1 p2p draft to verified_interviewer', function () {
      window.sessionStorage.setItem(
        SCHEDULE_DRAFT_STORAGE_KEY,
        serializeScheduleDraft(p2pDraft),
      )

      restoreScheduleDraftWithMigration()

      const parsed = JSON.parse(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)!,
      ) as { branch: string }
      expect(parsed.branch).toBe('standard_p2p')
    })
  })

  describe('draft persistence helpers', function persistSuite() {
    it('persists a complete draft as a v2 localStorage envelope', function () {
      persistScheduleDraft(aiDraft)

      const serialized = window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)
      expect(serialized).not.toBeNull()
      expect(JSON.parse(serialized!)).toEqual({
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

    it('clears v2 and any leftover v1 when draft has no meaningful progress', function () {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
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
      window.sessionStorage.setItem(
        SCHEDULE_DRAFT_STORAGE_KEY,
        serializeScheduleDraft(aiDraft),
      )

      persistScheduleDraft(initialScheduleState)

      expect(window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)).toBeNull()
      expect(window.sessionStorage.getItem(SCHEDULE_DRAFT_STORAGE_KEY)).toBeNull()
    })

    it('clearing draft storage removes draft branches but never an in-flight verified claim', function () {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        JSON.stringify({
          version: 'v2',
          branch: 'pre_branch',
          draft: {
            step: 'type',
            interviewType: 'system_design',
            mode: null,
            scheduledAt: null,
            maxMatches: null,
            slots: [],
          },
        }),
      )

      clearScheduleDraftStorage()
      expect(window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)).toBeNull()

      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        JSON.stringify({ version: 'v2', branch: 'verified_interviewer', ...claim }),
      )

      clearScheduleDraftStorage()
      expect(
        window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY),
      ).not.toBeNull()
    })
  })

  describe('verified_interviewer claim persistence', function claimSuite() {
    it('persists the durable claim { slotId, idempotencyKey, startedAt } under the v2 key', function () {
      persistVerifiedInterviewerClaim(claim)

      expect(readScheduleDraftV2()).toEqual({
        version: 'v2',
        branch: 'verified_interviewer',
        ...claim,
      })
    })

    it('survives a simulated browser/tab close and reopen', function () {
      persistVerifiedInterviewerClaim(claim)

      // Simulate close/reopen: fresh reads against the same localStorage.
      const reopened = readScheduleDraftV2()
      expect(reopened).toEqual({
        version: 'v2',
        branch: 'verified_interviewer',
        ...claim,
      })

      // The AI/P2P schedule surface must not wipe or reinterpret the claim.
      clearScheduleDraftStorage()
      expect(readScheduleDraftV2()).not.toBeNull()
    })

    it('persists synchronously before any claim request is sent', function () {
      const storageWrites: string[] = []
      const originalSetItem = Storage.prototype.setItem.bind(window.localStorage)
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(function capture(key, value) {
          storageWrites.push(String(key))
          originalSetItem(String(key), String(value))
        })

      let requestSent = false
      const sendClaim = function sendClaim() {
        persistVerifiedInterviewerClaim(claim)
        requestSent = true
      }

      sendClaim()

      expect(storageWrites).toContain(SCHEDULE_DRAFT_V2_STORAGE_KEY)
      expect(requestSent).toBe(true)
      expect(readScheduleDraftV2()).toEqual({
        version: 'v2',
        branch: 'verified_interviewer',
        ...claim,
      })

      setItemSpy.mockRestore()
    })

    it('throws on a failed durable write so the claim request is not sent', function () {
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(function throwOnWrite() {
          throw new Error('storage unavailable')
        })

      expect(function writeClaim() {
        persistVerifiedInterviewerClaim(claim)
      }).toThrow('storage unavailable')
      expect(readScheduleDraftV2()).toBeNull()

      setItemSpy.mockRestore()
    })
  })

  describe('close/reopen draft recovery', function reopenSuite() {
    it('recovers a persisted v2 ai draft after a simulated reopen', function () {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
        JSON.stringify({
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
        }),
      )

      const reopened = restoreScheduleDraftWithMigration()

      expect(reopened).toEqual({
        ...initialScheduleState,
        step: 'confirm',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: '2026-06-10T10:00:00.000Z',
      })
    })

    it('recovers an incomplete ai_direct draft with scheduledAt null after a simulated reopen', function () {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
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

      const reopened = restoreScheduleDraftWithMigration()

      expect(reopened).toEqual({
        ...initialScheduleState,
        step: 'timing',
        interviewType: 'system_design',
        mode: 'ai_led',
        scheduledAt: null,
      })
      // The durable v2 envelope survives reopen rather than being discarded.
      expect(window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)).not.toBeNull()
    })

    it('removes a malformed standard_p2p v2 envelope on read instead of restoring it', function () {
      window.localStorage.setItem(
        SCHEDULE_DRAFT_V2_STORAGE_KEY,
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
      )

      expect(restoreScheduleDraftWithMigration()).toBeNull()
      expect(window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)).toBeNull()
    })
  })
})
