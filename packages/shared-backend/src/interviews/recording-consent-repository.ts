import {
  consentDecisionSchema,
  type ConsentDecision,
  type Interview,
  type RecordingStatus,
} from '@mako/shared'
import { createSqlQuery, rollbackTransactionSafely, type SqlQueryExecutor } from '../index'

export type RecordingConsentRecord = {
  interview_id: string
  user_id: string
  decision: ConsentDecision
  consent_copy_version: string
  decided_at: string
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type RecordingConsentResult = {
  outcome:
    | 'recorded'
    | 'already_recorded'
    | 'already_revoked'
    | 'invalid_status'
    | 'not_found'
    | 'no_consent'
  consent?: RecordingConsentRecord
  recording_status?: RecordingStatus
}

export type UpsertConsentInput = {
  interview_id: string
  user_id: string
  decision: ConsentDecision
  consent_copy_version: string
}

export type RevokeConsentInput = {
  interview_id: string
  user_id: string
}

type RecordingConsentRepositoryDependencies = {
  queryExecutor?: SqlQueryExecutor
}

type RecordingConsentRepositoryConstructorInput =
  | RecordingConsentRepositoryDependencies
  | SqlQueryExecutor

type InterviewConsentLookupRow = {
  id: string
  status: Interview['status']
  recording_status: RecordingStatus
}

export class RecordingConsentRepository {
  private readonly dependencies: RecordingConsentRepositoryDependencies

  constructor(input: RecordingConsentRepositoryConstructorInput) {
    if (isQueryExecutor(input)) {
      this.dependencies = { queryExecutor: input }
      return
    }

    this.dependencies = input
  }

  async upsertConsent(input: UpsertConsentInput): Promise<RecordingConsentResult> {
    const queryExecutor = this.getQueryExecutor()
    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const interviewLookup = await queryExecutor.query<InterviewConsentLookupRow>(
        createSqlQuery(
          `
            SELECT id, status, recording_status
            FROM interviews
            WHERE id = $1
            LIMIT 1
            FOR UPDATE;
          `,
          [input.interview_id],
        ),
      )

      const [existingInterview] = interviewLookup.rows

      if (!existingInterview) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return { outcome: 'not_found' }
      }

      if (!isConsentEligibleInterviewStatus(existingInterview.status)) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'invalid_status',
          recording_status: existingInterview.recording_status,
        }
      }

      if (existingInterview.recording_status !== 'not_started') {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'invalid_status',
          recording_status: existingInterview.recording_status,
        }
      }

      const existingConsentLookup = await queryExecutor.query<RecordingConsentRecord>(
        createSqlQuery(
          `
            SELECT
              interview_id,
              user_id,
              decision,
              consent_copy_version,
              decided_at,
              revoked_at,
              created_at,
              updated_at
            FROM interview_recording_consents
            WHERE interview_id = $1 AND user_id = $2
            LIMIT 1;
          `,
          [input.interview_id, input.user_id],
        ),
      )

      const [existingConsent] = existingConsentLookup.rows

      if (
        existingConsent &&
        existingConsent.decision === input.decision &&
        existingConsent.consent_copy_version === input.consent_copy_version &&
        existingConsent.revoked_at === null
      ) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'already_recorded',
          consent: existingConsent,
          recording_status: existingInterview.recording_status,
        }
      }

      const timestamp = defaultNow()

      const upsertResult = await queryExecutor.query<RecordingConsentRecord>(
        createSqlQuery(
          `
            INSERT INTO interview_recording_consents (
              interview_id,
              user_id,
              decision,
              consent_copy_version,
              decided_at,
              revoked_at,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, NULL, $6, $6)
            ON CONFLICT (interview_id, user_id)
            DO UPDATE SET
              decision = EXCLUDED.decision,
              consent_copy_version = EXCLUDED.consent_copy_version,
              decided_at = EXCLUDED.decided_at,
              revoked_at = NULL,
              updated_at = EXCLUDED.updated_at
            RETURNING
              interview_id,
              user_id,
              decision,
              consent_copy_version,
              decided_at,
              revoked_at,
              created_at,
              updated_at;
          `,
          [
            input.interview_id,
            input.user_id,
            input.decision,
            input.consent_copy_version,
            timestamp,
            timestamp,
          ],
        ),
      )

      const [recordedConsent] = upsertResult.rows

      if (!recordedConsent) {
        throw new Error('Failed to record interview consent.')
      }

      await queryExecutor.query(createSqlQuery('COMMIT;'))

      return {
        outcome: 'recorded',
        consent: parseConsentRecord(recordedConsent),
        recording_status: existingInterview.recording_status,
      }
    } catch (error) {
      await rollbackTransactionSafely(queryExecutor)
      throw error
    }
  }

  async revokeConsent(input: RevokeConsentInput): Promise<RecordingConsentResult> {
    const queryExecutor = this.getQueryExecutor()
    await queryExecutor.query(createSqlQuery('BEGIN;'))

    try {
      const interviewLookup = await queryExecutor.query<InterviewConsentLookupRow>(
        createSqlQuery(
          `
            SELECT id, status, recording_status
            FROM interviews
            WHERE id = $1
            LIMIT 1
            FOR UPDATE;
          `,
          [input.interview_id],
        ),
      )

      const [existingInterview] = interviewLookup.rows

      if (!existingInterview) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return { outcome: 'not_found' }
      }

      if (!isConsentEligibleInterviewStatus(existingInterview.status)) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'invalid_status',
          recording_status: existingInterview.recording_status,
        }
      }

      if (existingInterview.recording_status !== 'not_started') {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'invalid_status',
          recording_status: existingInterview.recording_status,
        }
      }

      const existingConsentLookup = await queryExecutor.query<RecordingConsentRecord>(
        createSqlQuery(
          `
            SELECT
              interview_id,
              user_id,
              decision,
              consent_copy_version,
              decided_at,
              revoked_at,
              created_at,
              updated_at
            FROM interview_recording_consents
            WHERE interview_id = $1 AND user_id = $2
            LIMIT 1;
          `,
          [input.interview_id, input.user_id],
        ),
      )

      const [existingConsent] = existingConsentLookup.rows

      if (!existingConsent) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'no_consent',
          recording_status: existingInterview.recording_status,
        }
      }

      if (existingConsent.revoked_at !== null) {
        await queryExecutor.query(createSqlQuery('COMMIT;'))
        return {
          outcome: 'already_revoked',
          consent: existingConsent,
          recording_status: existingInterview.recording_status,
        }
      }

      const timestamp = defaultNow()

      const revokeResult = await queryExecutor.query<RecordingConsentRecord>(
        createSqlQuery(
          `
            UPDATE interview_recording_consents
            SET revoked_at = $2,
                updated_at = $2
            WHERE interview_id = $1 AND user_id = $3
            RETURNING
              interview_id,
              user_id,
              decision,
              consent_copy_version,
              decided_at,
              revoked_at,
              created_at,
              updated_at;
          `,
          [input.interview_id, timestamp, input.user_id],
        ),
      )

      const [revokedConsent] = revokeResult.rows

      if (!revokedConsent) {
        throw new Error('Failed to revoke interview consent.')
      }

      await queryExecutor.query(createSqlQuery('COMMIT;'))

      return {
        outcome: 'recorded',
        consent: parseConsentRecord(revokedConsent),
        recording_status: existingInterview.recording_status,
      }
    } catch (error) {
      await rollbackTransactionSafely(queryExecutor)
      throw error
    }
  }

  // Scaffolding for future consent visibility stories (5.16/5.17).
  // Not currently called by any production code path.
  async getConsentForUser(
    interviewId: string,
    userId: string,
  ): Promise<RecordingConsentRecord | null> {
    const result = await this.getQueryExecutor().query<RecordingConsentRecord>(
      createSqlQuery(
        `
          SELECT
            interview_id,
            user_id,
            decision,
            consent_copy_version,
            decided_at,
            revoked_at,
            created_at,
            updated_at
          FROM interview_recording_consents
          WHERE interview_id = $1 AND user_id = $2
          LIMIT 1;
        `,
        [interviewId, userId],
      ),
    )

    const [row] = result.rows
    return row ? parseConsentRecord(row) : null
  }

  // Scaffolding for future recording status stories (5.16/5.17).
  // Not currently called by any production code path.
  async getRecordingStatus(interviewId: string): Promise<RecordingStatus | null> {
    const result = await this.getQueryExecutor().query<{ recording_status: RecordingStatus }>(
      createSqlQuery(
        `
          SELECT recording_status
          FROM interviews
          WHERE id = $1
          LIMIT 1;
        `,
        [interviewId],
      ),
    )

    const [row] = result.rows
    return row ? row.recording_status : null
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.dependencies.queryExecutor

    if (!queryExecutor) {
      throw new Error('Recording consent query executor is not configured')
    }

    return queryExecutor
  }
}

function parseConsentRecord(row: unknown): RecordingConsentRecord {
  const record = row as RecordingConsentRecord
  return {
    ...record,
    decision: consentDecisionSchema.parse(record.decision),
  }
}

function isQueryExecutor(
  input: RecordingConsentRepositoryConstructorInput,
): input is SqlQueryExecutor {
  return (
    typeof input === 'object' &&
    input !== null &&
    'query' in input &&
    typeof input.query === 'function'
  )
}

function isConsentEligibleInterviewStatus(status: Interview['status']): boolean {
  return status === 'scheduled' || status === 'ongoing'
}

function defaultNow(): string {
  return new Date().toISOString()
}
