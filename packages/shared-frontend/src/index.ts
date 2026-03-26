import type { HealthResponse } from '@mako/shared'
export * from './auth/auth-client'

export function formatHealthLabel(response: HealthResponse): string {
  return `${response.service} • ${response.status}`
}
