import type { HealthResponse } from '@mako/shared'
export {
  availabilityRequestRowSchema,
  availabilityRequestStatusSchema,
  availabilitySlotRowSchema,
  availabilitySlotStatusSchema,
  interviewTypeSchema,
  parseAvailabilityRequestRow,
  parseAvailabilitySlotRow,
  parseUserCompanyRow,
  parseUserRow,
  userCompanyRowSchema,
  userRowSchema,
  type AvailabilityRequestRow,
  type AvailabilitySlotRow,
  type UserCompanyRow,
  type UserRow,
} from './database/foundation-schemas'
export * from './account'

export const backendRuntime = 'cloudflare-workers'

export type SqlQuery = {
  text: string
  values: readonly unknown[]
}

export function createSqlQuery(
  text: string,
  values: readonly unknown[] = [],
): SqlQuery {
  return { text, values }
}

export function toBackendHealth(service: string): HealthResponse {
  return {
    status: 'ok',
    service,
    timestamp: new Date().toISOString(),
  }
}
