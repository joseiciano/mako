import { createSqlQuery, type SqlQueryExecutor } from '../index'

export type MarketplaceSlotRow = {
  id: string
  interview_type: string
  start_time: string
  end_time: string
  interviewer_name: string
  interviewer_image: string | null
}

export type ListAvailableMarketplaceSlotsInput = {
  limit: number
  offset: number
  interviewType?: string
  earliestStartTime: string
  latestStartTime: string
}

export type CountAvailableMarketplaceSlotsInput = {
  interviewType?: string
  earliestStartTime: string
  latestStartTime: string
}

export class PremiumMarketplaceRepository {
  async listAvailableMarketplaceSlots(
    queryExecutor: SqlQueryExecutor,
    input: ListAvailableMarketplaceSlotsInput,
  ): Promise<MarketplaceSlotRow[]> {
    const conditions: string[] = [
      "s.status = 'available'",
      'u.deleted_at IS NULL',
      'u.companies = TRUE',
      's.start_time >= $1',
      's.start_time <= $2',
    ]
    const values: unknown[] = [input.earliestStartTime, input.latestStartTime]
    let parameterIndex = 3

    if (input.interviewType !== undefined) {
      conditions.push(`s.interview_type = $${parameterIndex}`)
      values.push(input.interviewType)
      parameterIndex += 1
    }

    const result = await queryExecutor.query<MarketplaceSlotRow>(
      createSqlQuery(
        `
          SELECT
            s.id,
            s.interview_type,
            s.start_time,
            s.end_time,
            u.name AS interviewer_name,
            u.image AS interviewer_image
          FROM premium_interviewer_slots s
          INNER JOIN "user" u ON u.id = s.interviewer_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY s.start_time ASC, s.id ASC
          LIMIT $${parameterIndex}
          OFFSET $${parameterIndex + 1};
        `,
        [...values, input.limit, input.offset],
      ),
    )

    return result.rows
  }

  async countAvailableMarketplaceSlots(
    queryExecutor: SqlQueryExecutor,
    input: CountAvailableMarketplaceSlotsInput,
  ): Promise<number> {
    const conditions: string[] = [
      "s.status = 'available'",
      'u.deleted_at IS NULL',
      'u.companies = TRUE',
      's.start_time >= $1',
      's.start_time <= $2',
    ]
    const values: unknown[] = [input.earliestStartTime, input.latestStartTime]
    let parameterIndex = 3

    if (input.interviewType !== undefined) {
      conditions.push(`s.interview_type = $${parameterIndex}`)
      values.push(input.interviewType)
      parameterIndex += 1
    }

    const result = await queryExecutor.query<{ count: string }>(
      createSqlQuery(
        `
          SELECT COUNT(*) AS count
          FROM premium_interviewer_slots s
          INNER JOIN "user" u ON u.id = s.interviewer_id
          WHERE ${conditions.join(' AND ')};
        `,
        values,
      ),
    )

    return Number(result.rows[0]?.count ?? 0)
  }
}
