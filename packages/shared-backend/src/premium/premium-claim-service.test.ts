import { describe, expect, it, vi } from 'vitest'
import type { SqlQuery } from '../index'
import { CreditRepository } from '../credit/credit-repository'
import {
  PremiumClaimRepository,
  type ClaimInterviewRow,
  type LockedUserRow,
  type PremiumClaimRow,
  type PremiumSlotRow,
} from './premium-claim-repository'
import { PremiumClaimService } from './premium-claim-service'
import {
  PremiumConflictError,
  PremiumForbiddenError,
  PremiumIdempotencyKeyConflictError,
  PremiumInsufficientCreditsError,
  PremiumInterviewerIneligibleError,
  PremiumNotFoundError,
  PremiumSchedulingConflictError,
  PremiumSelfClaimError,
  PremiumSlotAlreadyClaimedError,
  PremiumUnauthorizedError,
} from './premium-errors'

const slotId = '11111111-1111-4111-8111-111111111111'
const schedulerId = '22222222-2222-4222-8222-222222222222'
const interviewerId = '33333333-3333-4333-8333-333333333333'
const interviewId = '44444444-4444-4444-8444-444444444444'
const idempotencyKey = '66666666-6666-4666-8666-666666666666'
const fixedNow = '2026-08-07T20:00:00.000Z'

function buildSlotRow(overrides: Partial<PremiumSlotRow> = {}): PremiumSlotRow {
  return {
    id: slotId,
    interviewer_id: interviewerId,
    interview_type: 'system_design',
    start_time: '2026-08-07T22:00:00.000Z',
    end_time: '2026-08-07T23:00:00.000Z',
    status: 'available',
    created_at: '2026-08-07T18:00:00.000Z',
    updated_at: '2026-08-07T18:00:00.000Z',
    ...overrides,
  }
}

function buildClaimRow(overrides: Partial<PremiumClaimRow> = {}): PremiumClaimRow {
  return {
    idempotency_key: idempotencyKey,
    slot_id: slotId,
    scheduler_id: schedulerId,
    interview_id: interviewId,
    created_at: fixedNow,
    ...overrides,
  }
}

function buildInterviewRow(overrides: Partial<ClaimInterviewRow> = {}): ClaimInterviewRow {
  return {
    id: interviewId,
    scheduler_id: schedulerId,
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: interviewerId,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'peer_to_peer',
    booking_channel: 'verified_interviewer',
    tier: 'premium',
    status: 'scheduled',
    scheduled_at: '2026-08-07T22:00:00.000Z',
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    recording_status: 'not_started',
    transcript: null,
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: fixedNow,
    updated_at: fixedNow,
    ...overrides,
  }
}

type MockExecutorOptions = {
  existingClaim?: PremiumClaimRow | null
  existingSlotClaim?: PremiumClaimRow | null
  slotRow?: PremiumSlotRow | null
  userRows?: LockedUserRow[]
  schedulerRow?: LockedUserRow | null
  replayInterview?: ClaimInterviewRow | null
  interviewConflict?: { id: string } | null
  slotConflict?: { id: string } | null
  creditRowCount?: number
  serializationConflict?: boolean
}

function createService(options: MockExecutorOptions = {}) {
  const queries: SqlQuery[] = []
  const persistOutboxEvent = vi.fn(async () => {})

  const executor = {
    queries,
    async query<Row>(queryInput: SqlQuery): Promise<{ rows: Row[]; rowCount?: number }> {
      queries.push(queryInput)

      if (options.serializationConflict) {
        const conflictError = new Error('deadlock detected')
        ;(conflictError as { code?: string }).code = '40001'
        throw conflictError
      }

      const text = queryInput.text
      const normalized = text.trim().toUpperCase()

      if (normalized === 'BEGIN;' || normalized === 'COMMIT;' || normalized === 'ROLLBACK;') {
        return { rows: [] as Row[], rowCount: 0 }
      }

      if (text.includes('pg_advisory_xact_lock')) {
        return { rows: [] as Row[], rowCount: 0 }
      }

      if (text.includes('FROM premium_slot_claims') && text.includes('WHERE idempotency_key')) {
        if (!options.existingClaim) {
          return { rows: [] as Row[], rowCount: 0 }
        }
        return { rows: [options.existingClaim ?? buildClaimRow()] as Row[], rowCount: 1 }
      }

      if (text.includes('FROM premium_slot_claims') && text.includes('WHERE slot_id')) {
        if (!options.existingSlotClaim) {
          return { rows: [] as Row[], rowCount: 0 }
        }
        return { rows: [options.existingSlotClaim ?? buildClaimRow()] as Row[], rowCount: 1 }
      }

      if (text.includes('FROM premium_interviewer_slots') && text.includes('FOR UPDATE')) {
        if (options.slotRow === null) {
          return { rows: [] as Row[], rowCount: 0 }
        }
        return { rows: [options.slotRow ?? buildSlotRow()] as Row[], rowCount: 1 }
      }

      if (text.includes('FROM "user"') && text.includes('WHERE id = ANY')) {
        const defaultUsers: LockedUserRow[] = [
          { id: schedulerId, deleted_at: null, companies: false },
          { id: interviewerId, deleted_at: null, companies: true },
        ]
        return { rows: (options.userRows ?? defaultUsers) as Row[], rowCount: (options.userRows ?? defaultUsers).length }
      }

      if (text.includes('FROM "user"') && text.includes('WHERE id = $1') && text.includes('FOR UPDATE')) {
        if (options.schedulerRow === null) {
          return { rows: [] as Row[], rowCount: 0 }
        }
        return { rows: [options.schedulerRow ?? { id: schedulerId, deleted_at: null, companies: false }] as Row[], rowCount: 1 }
      }

      if (text.includes('FROM interviews') && text.includes('interviewer_id = $1 OR scheduler_id = $1')) {
        if (!options.interviewConflict) {
          return { rows: [] as Row[], rowCount: 0 }
        }
        return { rows: [options.interviewConflict ?? { id: 'conflict-id' }] as Row[], rowCount: 1 }
      }

      if (text.includes('FROM premium_interviewer_slots') && text.includes('interviewer_id = $1') && text.includes('start_time < $3')) {
        if (!options.slotConflict) {
          return { rows: [] as Row[], rowCount: 0 }
        }
        return { rows: [options.slotConflict ?? { id: 'slot-conflict-id' }] as Row[], rowCount: 1 }
      }

      if (text.includes('UPDATE "user"') && text.includes('credits = credits -')) {
        if (options.creditRowCount === 0) {
          return { rows: [] as Row[], rowCount: 0 }
        }
        return { rows: [{ id: schedulerId, credits: 7 }] as Row[], rowCount: options.creditRowCount ?? 1 }
      }

      if (text.includes('INSERT INTO interviews')) {
        return { rows: [buildInterviewRow()] as Row[], rowCount: 1 }
      }

      if (text.includes('UPDATE premium_interviewer_slots') && text.includes("status = 'claimed'")) {
        return { rows: [buildSlotRow({ status: 'claimed' })] as Row[], rowCount: 1 }
      }

      if (text.includes('INSERT INTO premium_slot_claims')) {
        return { rows: [buildClaimRow()] as Row[], rowCount: 1 }
      }

      if (text.includes('FROM interviews') && text.includes('WHERE id = $1') && !text.includes('OR scheduler_id')) {
        if (options.replayInterview === null) {
          return { rows: [] as Row[], rowCount: 0 }
        }
        return { rows: [options.replayInterview ?? buildInterviewRow()] as Row[], rowCount: 1 }
      }

      return { rows: [] as Row[], rowCount: 0 }
    },
  }

  const repository = new PremiumClaimRepository()
  const creditRepository = new CreditRepository(executor)

  const service = new PremiumClaimService(
    repository,
    creditRepository,
    { leadTimeMinutes: 60, horizonDays: 90 },
    executor,
    function createId() {
      return interviewId
    },
    function now() {
      return fixedNow
    },
  )

  return { executor, queries, persistOutboxEvent, service }
}

describe('PremiumClaimService', function premiumClaimServiceSuite() {
  it('claims a slot successfully: deducts credit, creates interview, claims slot, writes outbox event', async function run() {
    const { queries, persistOutboxEvent, service } = createService()

    const result = await service.claimSlot({
      session: { userId: schedulerId, email: 'scheduler@test.com' },
      slotId,
      idempotencyKey,
      persistOutboxEvent,
    })

    expect(result.replayed).toBe(false)
    expect(result.interview.id).toBe(interviewId)
    expect(result.interview.booking_channel).toBe('verified_interviewer')
    expect(result.interview.tier).toBe('premium')
    expect(result.interview.mode).toBe('peer_to_peer')
    expect(result.interview.status).toBe('scheduled')

    const creditQueries = queries.filter(function isCreditDeduction(query) {
      return query.text.includes('credits = credits -')
    })
    expect(creditQueries).toHaveLength(1)

    const insertInterviewQueries = queries.filter(function isInterviewInsert(query) {
      return query.text.includes('INSERT INTO interviews')
    })
    expect(insertInterviewQueries).toHaveLength(1)

    const claimSlotQueries = queries.filter(function isSlotClaim(query) {
      return query.text.includes("status = 'claimed'")
    })
    expect(claimSlotQueries).toHaveLength(1)

    const insertClaimQueries = queries.filter(function isClaimInsert(query) {
      return query.text.includes('INSERT INTO premium_slot_claims')
    })
    expect(insertClaimQueries).toHaveLength(1)

    expect(persistOutboxEvent).toHaveBeenCalledTimes(1)

    const normalizedTexts = queries.map(function normalize(query) {
      return query.text.trim().toUpperCase()
    })
    expect(normalizedTexts[0]).toBe('BEGIN;')
    expect(normalizedTexts.at(-1)).toBe('COMMIT;')
    expect(normalizedTexts).not.toContain('ROLLBACK;')
  })

  it('replays an existing claim with the same idempotency key and scheduler without recharging', async function run() {
    const { queries, persistOutboxEvent, service } = createService({
      existingClaim: buildClaimRow(),
      schedulerRow: { id: schedulerId, deleted_at: null, companies: false },
      replayInterview: buildInterviewRow(),
    })

    const result = await service.claimSlot({
      session: { userId: schedulerId, email: 'scheduler@test.com' },
      slotId,
      idempotencyKey,
      persistOutboxEvent,
    })

    expect(result.replayed).toBe(true)
    expect(result.interview.id).toBe(interviewId)

    const creditQueries = queries.filter(function isCreditDeduction(query) {
      return query.text.includes('credits = credits -')
    })
    expect(creditQueries).toHaveLength(0)

    const insertInterviewQueries = queries.filter(function isInterviewInsert(query) {
      return query.text.includes('INSERT INTO interviews')
    })
    expect(insertInterviewQueries).toHaveLength(0)

    expect(persistOutboxEvent).not.toHaveBeenCalled()
  })

  it('throws idempotency key conflict when key maps to a different scheduler', async function run() {
    const { service } = createService({
      existingClaim: buildClaimRow({ scheduler_id: '77777777-7777-4777-8777-777777777777' }),
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumIdempotencyKeyConflictError)
  })

  it('throws not found when slot does not exist', async function run() {
    const { service } = createService({
      existingClaim: null,
      slotRow: null,
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumNotFoundError)
  })

  it('throws slot already claimed when a claim already exists for the slot', async function run() {
    const { service } = createService({
      existingClaim: null,
      existingSlotClaim: buildClaimRow(),
      slotRow: buildSlotRow(),
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumSlotAlreadyClaimedError)
  })

  it('throws slot already claimed when slot status is claimed', async function run() {
    const { service } = createService({
      existingClaim: null,
      existingSlotClaim: null,
      slotRow: buildSlotRow({ status: 'claimed' }),
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumSlotAlreadyClaimedError)
  })

  it('throws not found when slot is cancelled', async function run() {
    const { service } = createService({
      existingClaim: null,
      existingSlotClaim: null,
      slotRow: buildSlotRow({ status: 'cancelled' }),
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumNotFoundError)
  })

  it('throws self-claim error when scheduler equals interviewer', async function run() {
    const { service } = createService({
      existingClaim: null,
      existingSlotClaim: null,
      slotRow: buildSlotRow({ interviewer_id: schedulerId }),
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumSelfClaimError)
  })

  it('throws forbidden when scheduler is deleted', async function run() {
    const { service } = createService({
      existingClaim: null,
      existingSlotClaim: null,
      slotRow: buildSlotRow(),
      userRows: [
        { id: schedulerId, deleted_at: '2026-08-01T00:00:00.000Z', companies: false },
        { id: interviewerId, deleted_at: null, companies: true },
      ],
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumForbiddenError)
  })

  it('throws interviewer ineligible when interviewer companies is false', async function run() {
    const { service } = createService({
      existingClaim: null,
      existingSlotClaim: null,
      slotRow: buildSlotRow(),
      userRows: [
        { id: schedulerId, deleted_at: null, companies: false },
        { id: interviewerId, deleted_at: null, companies: false },
      ],
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumInterviewerIneligibleError)
  })

  it('throws interviewer ineligible when interviewer is deleted', async function run() {
    const { service } = createService({
      existingClaim: null,
      existingSlotClaim: null,
      slotRow: buildSlotRow(),
      userRows: [
        { id: schedulerId, deleted_at: null, companies: false },
        { id: interviewerId, deleted_at: '2026-08-01T00:00:00.000Z', companies: true },
      ],
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumInterviewerIneligibleError)
  })

  it('throws insufficient credits when scheduler has no credits', async function run() {
    const { service } = createService({
      existingClaim: null,
      existingSlotClaim: null,
      slotRow: buildSlotRow(),
      creditRowCount: 0,
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumInsufficientCreditsError)
  })

  it('throws scheduling conflict when scheduler has an overlapping interview', async function run() {
    const { service } = createService({
      existingClaim: null,
      existingSlotClaim: null,
      slotRow: buildSlotRow(),
      interviewConflict: { id: 'existing-interview-id' },
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumSchedulingConflictError)
  })

  it('throws scheduling conflict when interviewer has an overlapping premium slot', async function run() {
    const { service } = createService({
      existingClaim: null,
      existingSlotClaim: null,
      slotRow: buildSlotRow(),
      slotConflict: { id: 'existing-slot-id' },
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumSchedulingConflictError)
  })

  it('rolls back the transaction on error', async function run() {
    const { queries, service } = createService({
      existingClaim: null,
      existingSlotClaim: null,
      slotRow: null,
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumNotFoundError)

    const normalizedTexts = queries.map(function normalize(query) {
      return query.text.trim().toUpperCase()
    })
    expect(normalizedTexts).toContain('ROLLBACK;')
    expect(normalizedTexts).not.toContain('COMMIT;')
  })

  it('throws unauthorized when session is null', async function run() {
    const { service } = createService()

    await expect(
      service.claimSlot({
        session: null,
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumUnauthorizedError)
  })

  it('throws a 409-mapped conflict error when serialization conflicts are exhausted', async function run() {
    const { service } = createService({ serializationConflict: true })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumConflictError)
  })

  it('throws forbidden when replaying for a deleted scheduler', async function run() {
    const { service } = createService({
      existingClaim: buildClaimRow(),
      schedulerRow: { id: schedulerId, deleted_at: '2026-08-01T00:00:00.000Z', companies: false },
    })

    await expect(
      service.claimSlot({
        session: { userId: schedulerId, email: 'scheduler@test.com' },
        slotId,
        idempotencyKey,
        persistOutboxEvent: vi.fn(async () => {}),
      }),
    ).rejects.toThrow(PremiumForbiddenError)
  })

  it('locks users in uuid sort order to maintain deadlock-free concurrency with cancellation', async function run() {
    const { queries, service } = createService({
      slotRow: buildSlotRow({
        interviewer_id: '11111111-1111-4111-8111-111111111111',
      }),
      userRows: [
        { id: '11111111-1111-4111-8111-111111111111', deleted_at: null, companies: true },
        { id: schedulerId, deleted_at: null, companies: false },
      ],
    })

    await service.claimSlot({
      session: { userId: schedulerId, email: 'scheduler@test.com' },
      slotId,
      idempotencyKey,
      persistOutboxEvent: vi.fn(async () => {}),
    })

    const userLockQuery = queries.find(function isUserLock(query) {
      return (
        query.text.includes('FROM "user"') &&
        query.text.includes('WHERE id = ANY') &&
        query.text.includes('FOR UPDATE')
      )
    })

    expect(userLockQuery).toBeDefined()
    const ids = userLockQuery!.values[0] as string[]
    expect(ids).toEqual(['11111111-1111-4111-8111-111111111111', schedulerId])
  })
})
