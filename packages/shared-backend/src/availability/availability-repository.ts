import type { AvailabilityRequest, AvailabilitySlot } from '@mako/shared'
import { createSqlQuery } from '../index'
import {
  parseAvailabilityRequestRow,
  parseAvailabilitySlotRow,
  type AvailabilityRequestRow,
  type AvailabilitySlotRow,
} from '../database/foundation-schemas'
import type { SqlQueryExecutor } from '../index'

export interface AvailabilityRepositoryDataSource {
  createAvailability(input: CreateAvailabilityRecordInput): Promise<CreateAvailabilityRecordResult>
}

type AvailabilityRepositoryDependencies = {
  dataSource?: AvailabilityRepositoryDataSource
  queryExecutor?: SqlQueryExecutor
}

type AvailabilityRepositoryConstructorInput =
  | AvailabilityRepositoryDataSource
  | SqlQueryExecutor
  | AvailabilityRepositoryDependencies

export type CreateAvailabilityRecordInput = {
  request: AvailabilityRequestRow
  slots: AvailabilitySlotRow[]
}

export type CreateAvailabilityRecordResult = {
  request: AvailabilityRequest
  slots: AvailabilitySlot[]
}

export class AvailabilityRepository {
  private readonly dependencies: AvailabilityRepositoryDependencies

  constructor(input: AvailabilityRepositoryConstructorInput) {
    if (isDataSource(input)) {
      this.dependencies = { dataSource: input }
      return
    }

    if (isQueryExecutor(input)) {
      this.dependencies = { queryExecutor: input }
      return
    }

    this.dependencies = input
  }

  async createAvailability(
    input: CreateAvailabilityRecordInput,
  ): Promise<CreateAvailabilityRecordResult> {
    const dataSource = this.dependencies.dataSource

    if (dataSource) {
      return dataSource.createAvailability(input)
    }

    const queryExecutor = this.getQueryExecutor()
    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const requestResult = await queryExecutor.query<AvailabilityRequestRow>(
        createSqlQuery(
          `
            INSERT INTO availability_requests (
              id,
              user_id,
              interview_type,
              max_matches,
              current_matches,
              status,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING
              id,
              user_id,
              interview_type,
              max_matches,
              current_matches,
              status,
              created_at,
              updated_at;
          `,
          [
            input.request.id,
            input.request.user_id,
            input.request.interview_type,
            input.request.max_matches,
            input.request.current_matches,
            input.request.status,
            input.request.created_at,
            input.request.updated_at,
          ],
        ),
      )

      const [createdRequest] = requestResult.rows

      if (!createdRequest) {
        throw new Error('Failed to insert availability request record.')
      }

      let createdSlots: AvailabilitySlotRow[] = []

      if (input.slots.length > 0) {
        const valuesPlaceholders: string[] = []
        const slotValues: unknown[] = []

        let parameterIndex = 1

        for (const slot of input.slots) {
          valuesPlaceholders.push(
            `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, $${parameterIndex + 5}, $${parameterIndex + 6})`,
          )
          slotValues.push(
            slot.id,
            slot.request_id,
            slot.start_time,
            slot.end_time,
            slot.status,
            slot.created_at,
            slot.updated_at,
          )
          parameterIndex += 7
        }

        const slotsResult = await queryExecutor.query<AvailabilitySlotRow>(
          createSqlQuery(
            `
              INSERT INTO availability_slots (
                id,
                request_id,
                start_time,
                end_time,
                status,
                created_at,
                updated_at
              )
              VALUES ${valuesPlaceholders.join(', ')}
              RETURNING
                id,
                request_id,
                start_time,
                end_time,
                status,
                created_at,
                updated_at;
            `,
            slotValues,
          ),
        )

        createdSlots = slotsResult.rows

        if (createdSlots.length !== input.slots.length) {
          throw new Error('Failed to insert availability slot record.')
        }
      }


      await queryExecutor.query(createSqlQuery('COMMIT;'))

      return {
        request: parseAvailabilityRequestRow(createdRequest),
        slots: createdSlots.map(function parseSlotRow(slotRow) {
          return parseAvailabilitySlotRow(slotRow)
        }),
      }
    } catch (error) {
      await rollbackTransactionSafely(queryExecutor)
      throw error
    }
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.dependencies.queryExecutor

    if (!queryExecutor) {
      throw new Error('Availability query executor is not configured')
    }

    return queryExecutor
  }
}

export function createInMemoryAvailabilityDataSource(): AvailabilityRepositoryDataSource {
  const requestsById = new Map<string, AvailabilityRequestRow>()
  const slotsById = new Map<string, AvailabilitySlotRow>()

  return {
    async createAvailability(
      input: CreateAvailabilityRecordInput,
    ): Promise<CreateAvailabilityRecordResult> {
      requestsById.set(input.request.id, structuredClone(input.request))

      for (const slot of input.slots) {
        slotsById.set(slot.id, structuredClone(slot))
      }

      return {
        request: parseAvailabilityRequestRow(structuredClone(input.request)),
        slots: input.slots.map(function parseSlot(slot) {
          return parseAvailabilitySlotRow(structuredClone(slot))
        }),
      }
    },
  }
}

function isDataSource(
  input: AvailabilityRepositoryConstructorInput,
): input is AvailabilityRepositoryDataSource {
  return (
    typeof input === 'object' &&
    input !== null &&
    'createAvailability' in input &&
    typeof input.createAvailability === 'function'
  )
}

function isQueryExecutor(
  input: AvailabilityRepositoryConstructorInput,
): input is SqlQueryExecutor {
  return (
    typeof input === 'object' &&
    input !== null &&
    'query' in input &&
    typeof input.query === 'function'
  )
}

async function rollbackTransactionSafely(queryExecutor: SqlQueryExecutor): Promise<void> {
  try {
    await queryExecutor.query(createSqlQuery('ROLLBACK;'))
  } catch {}
}
