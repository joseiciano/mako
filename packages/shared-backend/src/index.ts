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

export const backendRuntime = 'cloudflare-workers'

export function toBackendHealth(service: string): HealthResponse {
  return {
    status: 'ok',
    service,
    timestamp: new Date().toISOString(),
  }
}

export {
  AccountRepository,
  AccountService,
  createHeaderSessionResolver,
  createInMemoryAccountDataSource,
  registerAccountController,
} from './account'
export type {
  AccountControllerOptions,
  AccountRepositoryDataSource,
  AccountSession,
} from './account'
