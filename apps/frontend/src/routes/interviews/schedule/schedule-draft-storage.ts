import {
  SCHEDULE_DRAFT_STORAGE_KEY,
  SCHEDULE_DRAFT_V2_STORAGE_KEY,
  buildScheduleDraftV2,
  migrateScheduleDraftV1ToV2,
  parseScheduleDraftV2,
  scheduleDraftV2ToState,
  shouldPersistScheduleDraft,
  type ScheduleDraftV2Envelope,
  type ScheduleState,
} from './schedule-flow'

function hasWindowStorage(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Reads and validates the durable v2 draft from `localStorage`. Invalid v2
 * values are removed so a corrupted key cannot block the v1 fallback.
 */
export function readScheduleDraftV2(): ScheduleDraftV2Envelope | null {
  if (!hasWindowStorage()) return null

  const serialized = window.localStorage.getItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)
  if (serialized === null) return null

  const parsed = parseScheduleDraftV2(serialized)
  if (parsed === null) {
    window.localStorage.removeItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)
  }

  return parsed
}

/**
 * Writes a v2 envelope to `localStorage`. Propagates storage failures so
 * callers can abort (e.g. a claim request is only sent after the durable
 * claim write succeeds).
 */
export function writeScheduleDraftV2(envelope: ScheduleDraftV2Envelope): void {
  if (!hasWindowStorage()) return

  window.localStorage.setItem(SCHEDULE_DRAFT_V2_STORAGE_KEY, JSON.stringify(envelope))
}

/**
 * Restores the schedule state using the v1 -> v2 migration order:
 * 1. Read the v2 `localStorage` key first; a valid v2 value wins.
 * 2. Fall back to the v1 `sessionStorage` key, validate it, migrate it into
 *    the v2 `localStorage` key (write-before-delete), then remove the v1 key.
 * 3. On an interrupted migration (v2 write failed), leave v1 intact so the
 *    next restore can retry the read-v1 -> write-v2 -> remove-v1 sequence.
 */
export function restoreScheduleDraftWithMigration(): ScheduleState | null {
  if (!hasWindowStorage()) return null

  const v2 = readScheduleDraftV2()
  if (v2 !== null) {
    return scheduleDraftV2ToState(v2)
  }

  const serializedV1 = window.sessionStorage.getItem(SCHEDULE_DRAFT_STORAGE_KEY)
  if (serializedV1 === null) return null

  const migrated = migrateScheduleDraftV1ToV2(serializedV1)
  if (migrated === null) {
    window.sessionStorage.removeItem(SCHEDULE_DRAFT_STORAGE_KEY)
    return null
  }

  try {
    writeScheduleDraftV2(migrated)
  } catch {
    // Interrupted migration: keep v1 intact for a retry on the next restore.
    return scheduleDraftV2ToState(migrated)
  }

  window.sessionStorage.removeItem(SCHEDULE_DRAFT_STORAGE_KEY)
  return scheduleDraftV2ToState(migrated)
}

/**
 * Clears draft storage. Draft branches are removed from `localStorage` along
 * with any leftover v1 `sessionStorage` residue, but an in-flight
 * `verified_interviewer` claim is never wiped by the AI/P2P schedule surface.
 */
export function clearScheduleDraftStorage(): void {
  if (!hasWindowStorage()) return

  const current = readScheduleDraftV2()
  if (current !== null && current.branch === 'verified_interviewer') return

  window.localStorage.removeItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)
  window.sessionStorage.removeItem(SCHEDULE_DRAFT_STORAGE_KEY)
}

/**
 * Persists a draft as a v2 `localStorage` envelope. Always writes v2 first
 * and only removes any v1 residue after a successful v2 write
 * (write-before-delete).
 */
export function persistScheduleDraft(state: ScheduleState): void {
  if (!hasWindowStorage()) return

  if (!shouldPersistScheduleDraft(state)) {
    clearScheduleDraftStorage()
    return
  }

  writeScheduleDraftV2(buildScheduleDraftV2(state))
  window.sessionStorage.removeItem(SCHEDULE_DRAFT_STORAGE_KEY)
}

/**
 * Durably persists a verified-interviewer claim `{ slotId, idempotencyKey,
 * startedAt }` under the v2 `localStorage` key. This is a synchronous write
 * that must succeed before a claim request is issued; storage failures are
 * propagated so the caller can abort the request.
 */
export function persistVerifiedInterviewerClaim(claim: {
  slotId: string
  idempotencyKey: string
  startedAt: string
}): void {
  if (!hasWindowStorage()) return

  const envelope: ScheduleDraftV2Envelope = {
    version: 'v2',
    branch: 'verified_interviewer',
    slotId: claim.slotId,
    idempotencyKey: claim.idempotencyKey,
    startedAt: claim.startedAt,
  }

  writeScheduleDraftV2(envelope)
}

/**
 * Removes an in-flight verified-interviewer claim from the v2 `localStorage`
 * key. Unlike `clearScheduleDraftStorage` (which deliberately preserves a
 * `verified_interviewer` claim so the AI/P2P surface never wipes it), this is
 * the explicit terminal-cleanup path used by the premium claim lifecycle after
 * a success or a terminal conflict. Storage failures are propagated.
 */
export function clearVerifiedInterviewerClaim(): void {
  if (!hasWindowStorage()) return

  const current = readScheduleDraftV2()
  if (current === null || current.branch !== 'verified_interviewer') return

  window.localStorage.removeItem(SCHEDULE_DRAFT_V2_STORAGE_KEY)
}
