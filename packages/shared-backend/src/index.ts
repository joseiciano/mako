import type { HealthResponse } from '@mako/shared'

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
