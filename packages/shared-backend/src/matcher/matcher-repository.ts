import { createSqlQuery, type SqlQuery } from '../index'
import {
  parseMatcherCandidateRow,
  type MatcherCandidateRow,
} from './types'

export type MatcherQueryResult<Row> = {
  rows: Row[]
}

export type MatcherQueryExecutor = {
  query<Row>(query: SqlQuery): Promise<MatcherQueryResult<Row>>
}

export class MatcherRepository {
  constructor(private readonly queryExecutor: MatcherQueryExecutor) {}

  async listCandidateRows(): Promise<MatcherCandidateRow[]> {
    const query = createSqlQuery(`
      SELECT
        requests.id AS request_id,
        requests.user_id AS request_user_id,
        requests.created_at AS request_created_at,
        requests.interview_type,
        slots.id AS slot_id,
        slots.start_time AS slot_start_time,
        slots.end_time AS slot_end_time
      FROM availability_slots AS slots
      INNER JOIN availability_requests AS requests
        ON requests.id = slots.request_id
      WHERE slots.status = 'available'
        AND requests.status = 'active'
        AND requests.current_matches < requests.max_matches
        AND slots.start_time > NOW()
      ORDER BY
        requests.created_at ASC,
        requests.id ASC,
        slots.start_time ASC,
        slots.id ASC;
    `)

    const result = await this.queryExecutor.query<MatcherCandidateRow>(query)

    return result.rows.map(function parseCandidateRow(row) {
      return parseMatcherCandidateRow(row)
    })
  }
}
