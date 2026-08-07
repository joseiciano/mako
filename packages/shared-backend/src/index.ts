import type { HealthResponse } from '@mako/shared'

export {
  availabilityRequestRowSchema,
  availabilityRequestStatusSchema,
  availabilitySlotRowSchema,
  availabilitySlotStatusSchema,
  interviewTypeSchema,
  interviewerApplicationRowSchema,
  interviewerApplicationStatusSchema,
  parseAvailabilityRequestRow,
  parseAvailabilitySlotRow,
  parseInterviewerApplicationRow,
  parseUserCompanyRow,
  parseUserRow,
  persistedEmploymentSnapshotEntrySchema,
  userCompanyRowSchema,
  userRowSchema,
  type AvailabilityRequestStatus,
  type AvailabilitySlotStatus,
  type AvailabilityRequestRow,
  type AvailabilitySlotRow,
  type InterviewType,
  type InterviewerApplicationRow,
  type InterviewerApplicationStatus,
  type PersistedEmploymentSnapshotEntry,
  type UserCompanyRow,
  type UserRow,
} from './database/foundation-schemas'
export {
  createPostgresConnectionPool,
  type PostgresConnectionClient,
  type PostgresConnectionPool,
  type PostgresQueryResult,
} from './database/postgres-connection-pool'
export * from './account'
export * from './interviewer-application'
export * from './auth'
export * from './interview'
export * from './interviews'
export * from './availability'
export * from './matcher'
export * from './notifications'
export * from './credit'
export * from './tier-policy'
export * from './payment'
export * from './interview-assets'
export {
  interviewCreatedEventSchema,
  interviewCancelledEventSchema,
  interviewMatchCreatedEventSchema,
  type InterviewCreatedEvent,
  type InterviewCancelledEvent,
  type InterviewMatchCreatedEvent,
  type NotificationQueueEvent,
  type NotificationQueueEventPublisher,
  type NotificationQueueTransport,
} from './notification-queue-event-contract'

export type SqlQuery = {
  text: string
  values: readonly unknown[]
}

export type QueryResult<Row> = {
  rows: Row[]
  rowCount?: number
}

export type SqlQueryExecutor = {
  query<Row>(query: SqlQuery): Promise<QueryResult<Row>>
}

export function createSqlQuery(
  text: string,
  values: readonly unknown[] = [],
): SqlQuery {
  return { text, values }
}

export const backendRuntime = 'cloudflare-workers'

export function toBackendHealth(service: string): HealthResponse {
  return {
    status: 'ok',
    service,
    timestamp: new Date().toISOString(),
  }
}
