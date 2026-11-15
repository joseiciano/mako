import { rollbackTransactionSafely } from '../database/transaction-utils'
import { createSqlQuery, type SqlQueryExecutor } from '../index'
import {
  adminApplicationDetailRowSchema,
  adminApplicationSummaryRowSchema,
  type AdminApplicationDetailRow,
  type AdminApplicationSummaryRow,
  type AdminDecisionInput,
  type AdminDecisionResult,
  type AdminListRowsInput,
} from './types'

const detailSelect = `
  SELECT
    a.id,
    a.user_id,
    a.email,
    a.status,
    a.created_at,
    a.reviewed_at,
    a.employment_history,
    a.reviewed_by,
    applicant.name AS applicant_name,
    (applicant.deleted_at IS NOT NULL) AS applicant_is_deleted,
    reviewer.name AS reviewer_name,
    reviewer.email AS reviewer_email
  FROM user_interviewer_applications a
  JOIN "user" applicant ON applicant.id = a.user_id
  LEFT JOIN "user" reviewer ON reviewer.id = a.reviewed_by
`

/**
 * Raw-SQL repository for admin review of interviewer applications.
 * The decision runs as one transaction on the supplied executor.
 */
export class AdminApplicationReviewRepository {
  constructor(private readonly queryExecutor: SqlQueryExecutor) {}

  /** Oldest-first page of summaries. Returns up to `limit + 1` rows so the caller can compute hasMore. */
  async listByStatus(input: AdminListRowsInput): Promise<AdminApplicationSummaryRow[]> {
    const result = await this.queryExecutor.query<unknown>(
      createSqlQuery(
        `
          SELECT
            a.id,
            a.user_id,
            a.email,
            a.status,
            a.created_at,
            a.reviewed_at,
            applicant.name AS applicant_name,
            (applicant.deleted_at IS NOT NULL) AS applicant_is_deleted
          FROM user_interviewer_applications a
          JOIN "user" applicant ON applicant.id = a.user_id
          WHERE a.status = $1
          ORDER BY a.created_at ASC, a.id ASC
          LIMIT $2 OFFSET $3;
        `,
        [input.status, input.limit + 1, input.offset],
      ),
    )

    return result.rows.map(function parseRow(row) {
      return adminApplicationSummaryRowSchema.parse(row)
    })
  }

  async getDetail(applicationId: string): Promise<AdminApplicationDetailRow | null> {
    return readDetail(this.queryExecutor, applicationId)
  }

  /**
   * Guarded single-decision transaction. The UPDATE only matches a pending row,
   * so the first concurrent writer wins and later writers see zero rows.
   * Retryable SQLSTATE errors (40001/40P01) propagate after rollback so the
   * service can retry.
   */
  async decide(input: AdminDecisionInput): Promise<AdminDecisionResult> {
    await this.queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const now = new Date().toISOString()
      const updateResult = await this.queryExecutor.query<{ id: string; user_id: string }>(
        createSqlQuery(
          `
            UPDATE user_interviewer_applications
            SET status = $2,
                reviewed_by = $3,
                reviewed_at = $4,
                updated_at = $4
            WHERE id = $1
              AND status = 'pending'
            RETURNING id, user_id;
          `,
          [input.applicationId, input.decision, input.adminId, now],
        ),
      )

      const [updated] = updateResult.rows

      if (!updated) {
        const existsResult = await this.queryExecutor.query<{ id: string }>(
          createSqlQuery(
            'SELECT id FROM user_interviewer_applications WHERE id = $1;',
            [input.applicationId],
          ),
        )
        await this.queryExecutor.query(createSqlQuery('ROLLBACK;'))

        return existsResult.rows.length > 0
          ? { outcome: 'conflict', reason: 'not_pending' }
          : { outcome: 'not_found' }
      }

      if (input.decision === 'approved') {
        // Idempotent for already-eligible applicants; zero rows means inactive/deleted.
        const eligibilityResult = await this.queryExecutor.query<{ id: string }>(
          createSqlQuery(
            `
              UPDATE "user"
              SET companies = true,
                  "updatedAt" = $2
              WHERE id = $1
                AND deleted_at IS NULL
              RETURNING id;
            `,
            [updated.user_id, now],
          ),
        )

        if (eligibilityResult.rows.length !== 1) {
          await this.queryExecutor.query(createSqlQuery('ROLLBACK;'))
          return { outcome: 'conflict', reason: 'applicant_deleted' }
        }
      }

      const application = await readDetail(this.queryExecutor, input.applicationId)

      if (!application) {
        throw new Error('Decided interviewer application could not be re-read.')
      }

      await this.queryExecutor.query(createSqlQuery('COMMIT;'))

      return { outcome: 'decided', application }
    } catch (error) {
      await rollbackTransactionSafely(this.queryExecutor)
      throw error
    }
  }
}

async function readDetail(
  queryExecutor: SqlQueryExecutor,
  applicationId: string,
): Promise<AdminApplicationDetailRow | null> {
  const result = await queryExecutor.query<unknown>(
    createSqlQuery(`${detailSelect} WHERE a.id = $1;`, [applicationId]),
  )
  const [row] = result.rows

  return row ? adminApplicationDetailRowSchema.parse(row) : null
}
