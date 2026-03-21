export type HealthResponse = {
  status: 'ok'
  service: string
  timestamp: string
}

export function createHealthResponse(service: string): HealthResponse {
  return {
    status: 'ok',
    service,
    timestamp: new Date().toISOString(),
  }
}

export {
  accountProfileSchema,
  updateAccountProfileInputSchema,
} from './account'
export type { AccountProfile, UpdateAccountProfileInput } from './account'
