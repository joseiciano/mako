import { createSqlQuery, type SqlQuery } from '../index'
import type { SqlQueryExecutor } from '../interviews/interview-repository'
import type {
  InterviewState,
  NotificationOutboxEventRow,
  NotificationProcessingCheckpointRow,
  NotificationReminderScheduleRow,
} from './notification-types'

export type NotificationRepositoryDataSource = {
  persistOutboxEvent(event: NotificationOutboxEventRow): Promise<void>
  fetchPendingOutboxEvents(limit: number): Promise<NotificationOutboxEventRow[]>
  fetchOutboxEventByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<NotificationOutboxEventRow | null>
  markOutboxEventDispatched(idempotencyKey: string): Promise<void>
  recordDispatchFailure(idempotencyKey: string): Promise<void>
  recordCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<void>
  hasCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<boolean>
  createReminderSchedule(schedule: NotificationReminderScheduleRow): Promise<void>
  listDueReminderSchedules(before: string, limit?: number): Promise<NotificationReminderScheduleRow[]>
  suppressReminderSchedulesForInterview(interviewId: string): Promise<number>
  markReminderDispatched(id: string): Promise<void>
  markReminderDispatchedBatch?(ids: string[]): Promise<void>
  getInterviewState(id: string): Promise<InterviewState | null>
  getInterviewStates?(ids: string[]): Promise<Map<string, InterviewState>>
}

type NotificationRepositoryDependencies = {
  dataSource?: NotificationRepositoryDataSource
  queryExecutor?: SqlQueryExecutor
}

type NotificationRepositoryConstructorInput =
  | NotificationRepositoryDataSource
  | SqlQueryExecutor
  | NotificationRepositoryDependencies

export class NotificationRepository {
  private readonly dependencies: NotificationRepositoryDependencies

  constructor(input: NotificationRepositoryConstructorInput) {
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

  async persistOutboxEvent(event: NotificationOutboxEventRow): Promise<void> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.persistOutboxEvent(event)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          INSERT INTO notification_outbox_events (
            idempotency_key,
            event_type,
            event_payload,
            status,
            dispatch_attempts,
            last_dispatch_attempted_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (idempotency_key) DO NOTHING;
        `,
        [
          event.idempotency_key,
          event.event_type,
          JSON.stringify(event.event_payload),
          event.status,
          event.dispatch_attempts,
          event.last_dispatch_attempted_at,
          event.created_at,
          event.updated_at,
        ],
      ),
    )
  }

  async fetchPendingOutboxEvents(limit: number): Promise<NotificationOutboxEventRow[]> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.fetchPendingOutboxEvents(limit)
    }

    const result = await this.getQueryExecutor().query<NotificationOutboxEventRow>(
      createSqlQuery(
        `
          SELECT
            idempotency_key,
            event_type,
            event_payload,
            status,
            dispatch_attempts,
            last_dispatch_attempted_at,
            created_at,
            updated_at
          FROM notification_outbox_events
          WHERE (
            status = 'pending'
            OR status = 'failed'
          )
            AND (
              status = 'pending'
              OR last_dispatch_attempted_at IS NULL
              OR NOW() >= (
                last_dispatch_attempted_at
                + (LEAST(GREATEST(dispatch_attempts, 1), 10) * INTERVAL '30 seconds')
              )
            )
          ORDER BY
            CASE
              WHEN status = 'pending' THEN 0
              ELSE 1
            END ASC,
            created_at ASC
          LIMIT $1;
        `,
        [limit],
      ),
    )

    return result.rows
  }

  async fetchOutboxEventByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<NotificationOutboxEventRow | null> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.fetchOutboxEventByIdempotencyKey(idempotencyKey)
    }

    const result = await this.getQueryExecutor().query<NotificationOutboxEventRow>(
      createSqlQuery(
        `
          SELECT
            idempotency_key,
            event_type,
            event_payload,
            status,
            dispatch_attempts,
            last_dispatch_attempted_at,
            created_at,
            updated_at
          FROM notification_outbox_events
          WHERE idempotency_key = $1
          LIMIT 1;
        `,
        [idempotencyKey],
      ),
    )

    return result.rows[0] ?? null
  }

  async markOutboxEventDispatched(idempotencyKey: string): Promise<void> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.markOutboxEventDispatched(idempotencyKey)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE notification_outbox_events
          SET status = 'dispatched',
              updated_at = NOW()
          WHERE idempotency_key = $1;
        `,
        [idempotencyKey],
      ),
    )
  }

  async recordDispatchFailure(idempotencyKey: string): Promise<void> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.recordDispatchFailure(idempotencyKey)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE notification_outbox_events
          SET status = 'failed',
              dispatch_attempts = dispatch_attempts + 1,
              last_dispatch_attempted_at = NOW(),
              updated_at = NOW()
          WHERE idempotency_key = $1;
        `,
        [idempotencyKey],
      ),
    )
  }

  async recordCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<void> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.recordCheckpoint(idempotencyKey, checkpointKey)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          INSERT INTO notification_processing_checkpoints (
            idempotency_key,
            checkpoint_key,
            created_at
          )
          VALUES ($1, $2, NOW())
          ON CONFLICT (idempotency_key, checkpoint_key) DO NOTHING;
        `,
        [idempotencyKey, checkpointKey],
      ),
    )
  }

  async hasCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<boolean> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.hasCheckpoint(idempotencyKey, checkpointKey)
    }

    const result = await this.getQueryExecutor().query<{ exists: boolean }>(
      createSqlQuery(
        `
          SELECT EXISTS (
            SELECT 1
            FROM notification_processing_checkpoints
            WHERE idempotency_key = $1
              AND checkpoint_key = $2
          ) AS exists;
        `,
        [idempotencyKey, checkpointKey],
      ),
    )

    return result.rows[0]?.exists ?? false
  }

  async createReminderSchedule(schedule: NotificationReminderScheduleRow): Promise<void> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.createReminderSchedule(schedule)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          INSERT INTO notification_reminder_schedules (
            id,
            interview_id,
            idempotency_key,
            reminder_due_at,
            status,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (idempotency_key) DO NOTHING;
        `,
        [
          schedule.id,
          schedule.interview_id,
          schedule.idempotency_key,
          schedule.reminder_due_at,
          schedule.status,
          schedule.created_at,
          schedule.updated_at,
        ],
      ),
    )
  }

  async listDueReminderSchedules(
    before: string,
    limit: number = 100,
  ): Promise<NotificationReminderScheduleRow[]> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.listDueReminderSchedules(before, limit)
    }

    const result = await this.getQueryExecutor().query<NotificationReminderScheduleRow>(
      createSqlQuery(
        `
          SELECT
            id,
            interview_id,
            idempotency_key,
            reminder_due_at,
            status,
            created_at,
            updated_at
          FROM notification_reminder_schedules
          WHERE status = 'pending'
            AND reminder_due_at <= $1
          ORDER BY reminder_due_at ASC
          LIMIT $2;
        `,
        [before, limit],
      ),
    )

    return result.rows
  }

  async suppressReminderSchedulesForInterview(interviewId: string): Promise<number> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.suppressReminderSchedulesForInterview(interviewId)
    }

    const result = await this.getQueryExecutor().query<{ count: number }>(
      createSqlQuery(
        `
          UPDATE notification_reminder_schedules
          SET status = 'suppressed',
              updated_at = NOW()
          WHERE interview_id = $1
            AND status = 'pending'
          RETURNING 1;
        `,
        [interviewId],
      ),
    )

    return result.rows.length
  }

  async markReminderDispatched(id: string): Promise<void> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.markReminderDispatched(id)
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE notification_reminder_schedules
          SET status = 'dispatched',
              updated_at = NOW()
          WHERE id = $1
            AND status = 'pending';
        `,
        [id],
      ),
    )
  }

  async markReminderDispatchedBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return
    }

    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      if (dataSource.markReminderDispatchedBatch) {
        return dataSource.markReminderDispatchedBatch(ids)
      }

      await Promise.all(ids.map(async (id) => dataSource.markReminderDispatched(id)))
      return
    }

    await this.getQueryExecutor().query(
      createSqlQuery(
        `
          UPDATE notification_reminder_schedules
          SET status = 'dispatched',
              updated_at = NOW()
          WHERE id = ANY($1)
            AND status = 'pending';
        `,
        [ids],
      ),
    )
  }

  async getInterviewState(id: string): Promise<InterviewState | null> {
    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      return dataSource.getInterviewState(id)
    }

    const result = await this.getQueryExecutor().query<InterviewState>(
      createSqlQuery(
        `
          SELECT
            id,
            scheduler_id,
            interviewer_id,
            type,
            mode,
            tier,
            status,
            scheduled_at,
            created_at,
            updated_at
          FROM interviews
          WHERE id = $1
          LIMIT 1;
        `,
        [id],
      ),
    )

    return result.rows[0] ?? null
  }

  async getInterviewStates(ids: string[]): Promise<Map<string, InterviewState>> {
    if (ids.length === 0) {
      return new Map()
    }

    const dataSource = this.dependencies.dataSource
    if (dataSource) {
      if (dataSource.getInterviewStates) {
        return dataSource.getInterviewStates(ids)
      }

      const entries = await Promise.all(
        ids.map(async (id) => {
          const interview = await dataSource.getInterviewState(id)
          return interview ? ([id, interview] as const) : null
        }),
      )

      return new Map(
        entries.filter((entry): entry is readonly [string, InterviewState] => entry !== null),
      )
    }

    const result = await this.getQueryExecutor().query<InterviewState>(
      createSqlQuery(
        `
          SELECT
            id,
            scheduler_id,
            interviewer_id,
            type,
            mode,
            tier,
            status,
            scheduled_at,
            created_at,
            updated_at
          FROM interviews
          WHERE id = ANY($1);
        `,
        [ids],
      ),
    )

    return new Map(result.rows.map((row) => [row.id, row] as const))
  }

  private getQueryExecutor(): SqlQueryExecutor {
    const queryExecutor = this.dependencies.queryExecutor
    if (!queryExecutor) {
      throw new Error('Notification query executor is not configured')
    }
    return queryExecutor
  }
}

function isDataSource(
  input: NotificationRepositoryConstructorInput,
): input is NotificationRepositoryDataSource {
  return (
    typeof input === 'object' &&
    input !== null &&
    'persistOutboxEvent' in input &&
    typeof input.persistOutboxEvent === 'function'
  )
}

function isQueryExecutor(
  input: NotificationRepositoryConstructorInput,
): input is SqlQueryExecutor {
  return (
    typeof input === 'object' && input !== null && 'query' in input && typeof input.query === 'function'
  )
}
