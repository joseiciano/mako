export const demoSessionHeaders: Record<string, string> = import.meta.env.DEV
  ? {
      'x-user-id': '11111111-1111-4111-8111-111111111111',
      'x-user-email': 'demo@mako.dev',
    }
  : {}

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function createApiUrl(path: string): string {
  const apiBaseUrl = getApiBaseUrl().replace(/\/$/, '')
  const apiPath = normalizeApiPath(path)

  return `${apiBaseUrl}${apiPath}`
}

export function createApiRequestInit(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    credentials: 'include',
  }
}

export async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export function readErrorMessage(
  payload: unknown,
  fallbackMessage: string,
): string {
  if (!payload || typeof payload !== 'object') {
    return fallbackMessage
  }

  const maybeError = (payload as Record<string, unknown>).error
  if (typeof maybeError === 'string' && maybeError.length > 0) {
    // Cap length and reject multiline messages to prevent
    // internal details (stack traces, SQL fragments) from leaking to end users.
    if (maybeError.length > 200 || maybeError.includes('\n')) {
      return fallbackMessage
    }
    return maybeError
  }

  return fallbackMessage
}

function getApiBaseUrl(): string {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL

  if (
    typeof configuredApiBaseUrl === 'string' &&
    configuredApiBaseUrl.length > 0
  ) {
    return configuredApiBaseUrl
  }

  const configuredAuthBaseUrl = import.meta.env.VITE_AUTH_BASE_URL

  if (
    typeof configuredAuthBaseUrl === 'string' &&
    configuredAuthBaseUrl.length > 0 &&
    (configuredAuthBaseUrl.startsWith('http://') ||
      configuredAuthBaseUrl.startsWith('https://'))
  ) {
    return new URL('/api', configuredAuthBaseUrl).toString()
  }

  return '/api'
}

function normalizeApiPath(path: string): string {
  if (path === '/api') {
    return ''
  }

  if (path.startsWith('/api/')) {
    return path.slice('/api'.length)
  }

  if (path.startsWith('/')) {
    return path
  }

  return `/${path}`
}
