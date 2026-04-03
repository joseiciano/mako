import {
  parseAvailabilityRequestRow,
  parseAvailabilitySlotRow,
} from '../database/foundation-schemas'
import type { SqlQuery } from '../index'
import type {
  MatchAttemptResult,
  MatchPairAttempt,
  MatcherCandidateSlot,
} from './types'
import { toMatcherCandidateSlot } from './types'

type QueryResult<Row> = {
  rows: Row[]
  rowCount?: number
}

export type MatcherQueryExecutor = {
  query<Row>(query: SqlQuery): Promise<QueryResult<Row>>
}

export type ListMatcherCandidatesInput = {
  nowIso: string
}

type LockedSlotRow = {
  id: string
  request_id: string
  start_time: string | Date
  end_time: string | Date
  status: 'available' | 'matched' | 'cancelled'
  created_at: string | Date
  updated_at: string | Date
}

type LockedRequestRow = {
  id: string
  user_id: string
  max_matches: number
  current_matches: number
  interview_type: 'system_design' | 'coding' | 'behavioral'
  status: 'active' | 'fulfilled' | 'cancelled'
  created_at: string | Date
  updated_at: string | Date
}

export class MatcherRepository {
  constructor(private readonly queryExecutor: MatcherQueryExecutor) {}

  async listCandidates(
    input: ListMatcherCandidatesInput,
  ): Promise<MatcherCandidateSlot[]> {
    const query: SqlQuery = {
      text: `
        SELECT
          slot.id AS slot_id,
          slot.request_id,
          request.user_id,
          request.interview_type,
          request.created_at AS request_created_at,
          request.max_matches AS request_max_matches,
          request.current_matches AS request_current_matches,
          request.status AS request_status,
          slot.start_time AS slot_start_time,
          slot.end_time AS slot_end_time,
          slot.status AS slot_status
        FROM availability_slots slot
        INNER JOIN availability_requests request
          ON request.id = slot.request_id
        WHERE slot.status = 'available'
          AND request.status = 'active'
          AND request.current_matches < request.max_matches
          AND slot.start_time > $1::timestamptz
        ORDER BY
          request.created_at ASC,
          request.id ASC,
          slot.start_time ASC,
          slot.id ASC;
      `,
      values: [input.nowIso],
    }

    const result = await this.queryExecutor.query(query)
    return result.rows.map(function toCandidateSlot(row) {
      return toMatcherCandidateSlot(row)
    })
  }

  async executePairAttempt(input: MatchPairAttempt): Promise<MatchAttemptResult> {
    if (input.slotAId === input.slotBId) {
      return {
        outcome: 'skipped',
        reason: 'invalid_pair',
      }
    }

    const slotIds = [input.slotAId, input.slotBId]

    await this.queryExecutor.query({
      text: 'BEGIN',
      values: [],
    })

    try {
      const lockedSlots = await this.lockSlots(slotIds)

      if (lockedSlots.length !== 2) {
        await this.rollbackTransaction()
        return {
          outcome: 'skipped',
          reason: 'stale_write_conflict',
        }
      }

      const requestIds = Array.from(
        new Set(
          lockedSlots.map(function getRequestId(slot) {
            return slot.request_id
          }),
        ),
      )

      if (requestIds.length !== 2) {
        await this.rollbackTransaction()
        return {
          outcome: 'skipped',
          reason: 'invalid_pair',
        }
      }

      const lockedRequests = await this.lockRequests(requestIds)

      if (!isEligibleAfterLock(lockedSlots, lockedRequests)) {
        await this.rollbackTransaction()
        return {
          outcome: 'skipped',
          reason: 'ineligible_after_lock',
        }
      }

      const matchedSlots = await this.markSlotsAsMatched(slotIds)

      if (matchedSlots.length !== 2) {
        await this.rollbackTransaction()
        return {
          outcome: 'skipped',
          reason: 'stale_write_conflict',
        }
      }

      const updatedRequests = await this.incrementRequestMatches(requestIds)

      if (updatedRequests.length !== 2) {
        await this.rollbackTransaction()
        return {
          outcome: 'skipped',
          reason: 'stale_write_conflict',
        }
      }

      const newlyFulfilledRequestIds = updatedRequests
        .filter(function reachedQuota(request) {
          return request.current_matches >= request.max_matches
        })
        .map(function toRequestId(request) {
          return request.id
        })

      const cancelledSlots =
        newlyFulfilledRequestIds.length > 0
          ? await this.fulfillRequestsAndCancelRemainingSlots(newlyFulfilledRequestIds)
          : []

      await this.commitTransaction()

      return {
        outcome: 'matched',
        fulfilledRequestIds: newlyFulfilledRequestIds,
        cancelledSlotIds: cancelledSlots.map(function toSlotId(slot) {
          return slot.id
        }),
      }
    } catch (error) {
      await this.rollbackTransaction().catch(function ignoreRollbackError() {})
      throw error
    }
  }

  private async lockSlots(slotIds: readonly string[]) {
    const query: SqlQuery = {
      text: `
        SELECT
          id,
          request_id,
          start_time,
          end_time,
          status,
          created_at,
          updated_at
        FROM availability_slots
        WHERE id = ANY($1::uuid[])
        ORDER BY id ASC
        FOR UPDATE;
      `,
      values: [slotIds],
    }

    const result = await this.queryExecutor.query<LockedSlotRow>(query)
    return result.rows.map(function parseRow(row) {
      return parseAvailabilitySlotRow(row)
    })
  }

  private async lockRequests(requestIds: readonly string[]) {
    const query: SqlQuery = {
      text: `
        SELECT
          id,
          user_id,
          max_matches,
          current_matches,
          interview_type,
          status,
          created_at,
          updated_at
        FROM availability_requests
        WHERE id = ANY($1::uuid[])
        ORDER BY id ASC
        FOR UPDATE;
      `,
      values: [requestIds],
    }

    const result = await this.queryExecutor.query<LockedRequestRow>(query)
    return result.rows.map(function parseRow(row) {
      return parseAvailabilityRequestRow(row)
    })
  }

  private async markSlotsAsMatched(slotIds: readonly string[]) {
    const query: SqlQuery = {
      text: `
        UPDATE availability_slots
        SET status = 'matched',
            updated_at = NOW()
        WHERE id = ANY($1::uuid[])
          AND status = 'available'
        RETURNING
          id,
          request_id,
          start_time,
          end_time,
          status,
          created_at,
          updated_at;
      `,
      values: [slotIds],
    }

    const result = await this.queryExecutor.query<LockedSlotRow>(query)
    return result.rows.map(function parseRow(row) {
      return parseAvailabilitySlotRow(row)
    })
  }

  private async incrementRequestMatches(requestIds: readonly string[]) {
    const query: SqlQuery = {
      text: `
        UPDATE availability_requests
        SET current_matches = current_matches + 1,
            updated_at = NOW()
        WHERE id = ANY($1::uuid[])
          AND status = 'active'
          AND current_matches < max_matches
        RETURNING
          id,
          user_id,
          max_matches,
          current_matches,
          interview_type,
          status,
          created_at,
          updated_at;
      `,
      values: [requestIds],
    }

    const result = await this.queryExecutor.query<LockedRequestRow>(query)
    return result.rows.map(function parseRow(row) {
      return parseAvailabilityRequestRow(row)
    })
  }

  private async fulfillRequestsAndCancelRemainingSlots(requestIds: readonly string[]) {
    const fulfillQuery: SqlQuery = {
      text: `
        UPDATE availability_requests
        SET status = 'fulfilled',
            updated_at = NOW()
        WHERE id = ANY($1::uuid[])
          AND status = 'active'
          AND current_matches >= max_matches;
      `,
      values: [requestIds],
    }

    await this.queryExecutor.query(fulfillQuery)

    const cancelSlotsQuery: SqlQuery = {
      text: `
        UPDATE availability_slots
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE request_id = ANY($1::uuid[])
          AND status = 'available'
        RETURNING
          id,
          request_id,
          start_time,
          end_time,
          status,
          created_at,
          updated_at;
      `,
      values: [requestIds],
    }

    const result = await this.queryExecutor.query<LockedSlotRow>(cancelSlotsQuery)
    return result.rows.map(function parseRow(row) {
      return parseAvailabilitySlotRow(row)
    })
  }

  private async commitTransaction() {
    await this.queryExecutor.query({
      text: 'COMMIT',
      values: [],
    })
  }

  private async rollbackTransaction() {
    await this.queryExecutor.query({
      text: 'ROLLBACK',
      values: [],
    })
  }
}

function isEligibleAfterLock(
  lockedSlots: readonly ReturnType<typeof parseAvailabilitySlotRow>[],
  lockedRequests: readonly ReturnType<typeof parseAvailabilityRequestRow>[],
): boolean {
  if (lockedSlots.length !== 2 || lockedRequests.length !== 2) {
    return false
  }

  const requestById = new Map(
    lockedRequests.map(function toEntry(request) {
      return [request.id, request] as const
    }),
  )

  const [slotA, slotB] = lockedSlots

  if (!slotA || !slotB) {
    return false
  }

  if (slotA.status !== 'available' || slotB.status !== 'available') {
    return false
  }

  const requestA = requestById.get(slotA.request_id)
  const requestB = requestById.get(slotB.request_id)

  if (!requestA || !requestB) {
    return false
  }

  if (requestA.status !== 'active' || requestB.status !== 'active') {
    return false
  }

  if (requestA.current_matches >= requestA.max_matches) {
    return false
  }

  if (requestB.current_matches >= requestB.max_matches) {
    return false
  }

  if (requestA.user_id === requestB.user_id) {
    return false
  }

  if (requestA.interview_type !== requestB.interview_type) {
    return false
  }

  return slotsOverlap(slotA.start_time, slotA.end_time, slotB.start_time, slotB.end_time)
}

function slotsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA < endB && endA > startB
}
