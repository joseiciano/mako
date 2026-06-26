import type { MediaPermissionError } from '#/components/interviews/media'

const DENIED_ERROR_CODES = new Set(['1602', '2101'])
const DEVICE_UNAVAILABLE_ERROR_CODES = new Set(['1603'])

export function logMeetingError(message: string, error: unknown) {
  console.error(message, error)
}

export function getMediaPermissionError(
  error: unknown,
): MediaPermissionError | null {
  const code = getErrorString(error, 'code')
  if (code && DENIED_ERROR_CODES.has(code)) return 'denied'
  if (code && DEVICE_UNAVAILABLE_ERROR_CODES.has(code)) {
    return 'device-unavailable'
  }

  const text = [getErrorString(error, 'name'), getErrorString(error, 'message')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (
    text.includes('notallowederror') ||
    text.includes('permission denied') ||
    text.includes('not allowed') ||
    text.includes('denied')
  ) {
    return 'denied'
  }

  if (
    text.includes('notfounderror') ||
    text.includes('devicesnotfounderror') ||
    text.includes('notreadableerror') ||
    text.includes('overconstrainederror') ||
    text.includes('no device') ||
    text.includes('device not found') ||
    text.includes('device unavailable') ||
    text.includes('not available')
  ) {
    return 'device-unavailable'
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getErrorString(error: unknown, key: 'code' | 'name' | 'message') {
  if (!isRecord(error)) return undefined
  const value = error[key]
  return typeof value === 'string' ? value : undefined
}
