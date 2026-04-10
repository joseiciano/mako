export const demoSessionHeaders = {
  'x-user-id': '11111111-1111-4111-8111-111111111111',
  'x-user-email': 'demo@mako.dev',
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
    return maybeError
  }

  return fallbackMessage
}
