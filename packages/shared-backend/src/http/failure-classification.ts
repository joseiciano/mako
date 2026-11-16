/** The session store or Better Auth session provider could not be reached. */
export class AuthUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Authentication service unavailable.', options)
    this.name = 'AuthUnavailableError'
  }
}

/** The database (Hyperdrive/Postgres) is not configured or cannot be reached. */
export class DatabaseUnavailableError extends Error {
  constructor(message = 'Database unavailable.', options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DatabaseUnavailableError'
  }
}

export type FailureClass = 'unavailable' | 'internal'

const connectivityErrnoCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'EHOSTUNREACH',
])

// 57P01-57P03: admin shutdown / crash shutdown / cannot connect now.
// 53300 / 53400: too many connections / configuration limit exceeded.
const connectivitySqlStates = new Set(['57P01', '57P02', '57P03', '53300', '53400'])

const connectivityMessagePatterns = [
  /connection terminated/i,
  /connection (?:timeout|refused|closed)/i,
  /timeout expired/i,
  /Client has encountered a connection error/i,
]

/**
 * Fail-closed classification: auth/session and database connectivity failures are
 * `unavailable` (503). Everything else, including query errors on valid data, is
 * `internal` (500).
 */
export function classifyFailure(error: unknown): FailureClass {
  if (error instanceof AuthUnavailableError || error instanceof DatabaseUnavailableError) {
    return 'unavailable'
  }

  if (typeof error !== 'object' || error === null) {
    return 'internal'
  }

  const code = (error as { code?: unknown }).code

  if (typeof code === 'string') {
    if (connectivityErrnoCodes.has(code) || connectivitySqlStates.has(code)) {
      return 'unavailable'
    }

    // SQLSTATE class 08: connection exception.
    if (/^08[0-9A-Z]{3}$/.test(code)) {
      return 'unavailable'
    }
  }

  const message = (error as { message?: unknown }).message

  if (
    typeof message === 'string' &&
    connectivityMessagePatterns.some(function matches(pattern) {
      return pattern.test(message)
    })
  ) {
    return 'unavailable'
  }

  const cause = (error as { cause?: unknown }).cause

  return cause !== undefined && cause !== error ? classifyFailure(cause) : 'internal'
}
