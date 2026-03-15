import type { HealthResponse } from '@mako/shared'

export function formatHealthLabel(response: HealthResponse): string {
  return `${response.service} • ${response.status}`
}
