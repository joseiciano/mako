import { describe, expect, it, vi } from 'vitest'
import {
  AvailabilityRepository,
  createInMemoryAvailabilityDataSource,
} from './availability-repository'
import type { SqlQuery } from '../index'
import type { AvailabilityRequestRow, AvailabilitySlotRow } from '../database/foundation-schemas'

describe('AvailabilityRepository', function availabilityRepositorySuite() {
  it('in-memory createAvailability persists request and slots deterministically', async function run() {
    const repository = new AvailabilityRepository(createInMemoryAvailabilityDataSource())

    const request: AvailabilityRequestRow = {
      id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      interview_type: 'system_design',
      max_matches: 2,
      current_matches: 0,
      status: 'active',
      created_at: '2026-04-13T09:00:00.000Z',
      updated_at: '2026-04-13T09:00:00.000Z',
    }

    const slots: AvailabilitySlotRow[] = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        request_id: '11111111-1111-4111-8111-111111111111',
        start_time: '2026-04-13T10:00:00.000Z',
        end_time: '2026-04-13T11:00:00.000Z',
        status: 'available',
        created_at: '2026-04-13T09:00:00.000Z',
        updated_at: '2026-04-13T09:00:00.000Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        request_id: '11111111-1111-4111-8111-111111111111',
        start_time: '2026-04-13T12:00:00.000Z',
        end_time: '2026-04-13T13:00:00.000Z',
        status: 'available',
        created_at: '2026-04-13T09:00:00.000Z',
        updated_at: '2026-04-13T09:00:00.000Z',
      },
    ]

    const result = await repository.createAvailability({ request, slots })

    expect(result.request).toEqual(request)
    expect(result.slots).toHaveLength(2)
    expect(result.slots[0].start_time).toBe('2026-04-13T10:00:00.000Z')
    expect(result.slots[1].start_time).toBe('2026-04-13T12:00:00.000Z')
  })

  it('SQL path inserts only availability tables and commits', async function run() {
    const queries: SqlQuery[] = []

    const mockQueryExecutor = {
      async query<Row>(query: SqlQuery) {
        queries.push(query)
        const normalized = query.text.trim().toUpperCase()

        if (normalized === 'BEGIN;') {
          return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
        }

        if (normalized === 'COMMIT;') {
          return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
        }

        if (query.text.includes('INSERT INTO availability_requests')) {
          return {
            rows: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                user_id: '22222222-2222-4222-8222-222222222222',
                interview_type: 'system_design',
                max_matches: 2,
                current_matches: 0,
                status: 'active',
                created_at: '2026-04-13T09:00:00.000Z',
                updated_at: '2026-04-13T09:00:00.000Z',
              },
            ] as Row[],
            rowCount: 1,
          }
        }

        if (query.text.includes('INSERT INTO availability_slots')) {
          const slotCount = (query.text.match(/\),\s*\(/g) || []).length + 1
          return {
            rows: slots.slice(0, slotCount).map((slot) => ({
              id: slot.id,
              request_id: slot.request_id,
              start_time: slot.start_time,
              end_time: slot.end_time,
              status: slot.status,
              created_at: slot.created_at,
              updated_at: slot.updated_at,
            })) as Row[],
            rowCount: slotCount,
          }
        }

        return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
      },
    }

    const repository = new AvailabilityRepository({ queryExecutor: mockQueryExecutor })

    const request: AvailabilityRequestRow = {
      id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      interview_type: 'system_design',
      max_matches: 2,
      current_matches: 0,
      status: 'active',
      created_at: '2026-04-13T09:00:00.000Z',
      updated_at: '2026-04-13T09:00:00.000Z',
    }

    const slots: AvailabilitySlotRow[] = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        request_id: '11111111-1111-4111-8111-111111111111',
        start_time: '2026-04-13T10:00:00.000Z',
        end_time: '2026-04-13T11:00:00.000Z',
        status: 'available',
        created_at: '2026-04-13T09:00:00.000Z',
        updated_at: '2026-04-13T09:00:00.000Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        request_id: '11111111-1111-4111-8111-111111111111',
        start_time: '2026-04-13T12:00:00.000Z',
        end_time: '2026-04-13T13:00:00.000Z',
        status: 'available',
        created_at: '2026-04-13T09:00:00.000Z',
        updated_at: '2026-04-13T09:00:00.000Z',
      },
    ]

    await repository.createAvailability({ request, slots })

    const statementTexts = queries.map((q) => q.text.trim().toUpperCase())
    expect(statementTexts).toContain('BEGIN;')
    expect(statementTexts).toContain('COMMIT;')

    const insertStatements = queries.filter((q) =>
      q.text.includes('INSERT INTO'),
    )
    expect(insertStatements).toHaveLength(2)
    expect(insertStatements[0]!.text).toContain('availability_requests')
    expect(insertStatements[1]!.text).toContain('availability_slots')
    expect(insertStatements[1]!.values).toContain(slots[0]!.id)
    expect(insertStatements[1]!.values).toContain(slots[1]!.id)

    // No interviews or notifications
    for (const query of queries) {
      expect(query.text).not.toContain('interviews')
      expect(query.text).not.toContain('notification')
    }
  })

  it('SQL path rolls back on slot insert failure', async function run() {
    const queries: SqlQuery[] = []

    const mockQueryExecutor = {
      async query<Row>(query: SqlQuery) {
        queries.push(query)
        const normalized = query.text.trim().toUpperCase()

        if (normalized === 'BEGIN;') {
          return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
        }

        if (normalized === 'ROLLBACK;') {
          return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
        }

        if (query.text.includes('INSERT INTO availability_requests')) {
          return {
            rows: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                user_id: '22222222-2222-4222-8222-222222222222',
                interview_type: 'system_design',
                max_matches: 2,
                current_matches: 0,
                status: 'active',
                created_at: '2026-04-13T09:00:00.000Z',
                updated_at: '2026-04-13T09:00:00.000Z',
              },
            ] as Row[],
            rowCount: 1,
          }
        }

        if (query.text.includes('INSERT INTO availability_slots')) {
          throw new Error('Slot insert failed')
        }

        return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
      },
    }

    const repository = new AvailabilityRepository({ queryExecutor: mockQueryExecutor })

    const request: AvailabilityRequestRow = {
      id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      interview_type: 'system_design',
      max_matches: 2,
      current_matches: 0,
      status: 'active',
      created_at: '2026-04-13T09:00:00.000Z',
      updated_at: '2026-04-13T09:00:00.000Z',
    }

    const slots: AvailabilitySlotRow[] = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        request_id: '11111111-1111-4111-8111-111111111111',
        start_time: '2026-04-13T10:00:00.000Z',
        end_time: '2026-04-13T11:00:00.000Z',
        status: 'available',
        created_at: '2026-04-13T09:00:00.000Z',
        updated_at: '2026-04-13T09:00:00.000Z',
      },
    ]

    await expect(repository.createAvailability({ request, slots })).rejects.toThrow(
      'Slot insert failed',
    )

    const rollbackIndex = queries.findIndex(
      (q) => q.text.trim().toUpperCase() === 'ROLLBACK;',
    )
    expect(rollbackIndex).toBeGreaterThan(-1)
  })
})
