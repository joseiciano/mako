export type AuthUser = {
  id?: string
  name?: string | null
  email: string
}

export type AuthSession = {
  id?: string
  expiresAt?: string | null
}

export type AuthSessionPayload = {
  user: AuthUser
  session: AuthSession
}

export type SignUpWithEmailInput = {
  name: string
  email: string
  password: string
}

export type SignInWithEmailInput = {
  email: string
  password: string
}

type FetchLike = typeof fetch

type AuthRequestInit = {
  method: 'GET' | 'POST'
  body?: Record<string, unknown>
}

export class AuthClientError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details: unknown) {
    super(message)
    this.name = 'AuthClientError'
    this.status = status
    this.details = details
  }
}

type AuthClient = {
  signUp: {
    email: (input: SignUpWithEmailInput) => Promise<AuthSessionPayload>
  }
  signIn: {
    email: (input: SignInWithEmailInput) => Promise<AuthSessionPayload>
  }
  signOut: () => Promise<{ success: boolean }>
  getSession: () => Promise<AuthSessionPayload | null>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function resolveErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback
  }

  const message = payload.message

  return typeof message === 'string' && message.trim().length > 0
    ? message
    : fallback
}

async function requestJson<T>(
  fetchImpl: FetchLike,
  path: string,
  init: AuthRequestInit,
): Promise<T> {
  const response = await fetchImpl(path, {
    method: init.method,
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: 'include',
  })

  let payload: unknown = null

  if (response.status !== 204) {
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    throw new AuthClientError(
      resolveErrorMessage(payload, 'Authentication request failed.'),
      response.status,
      payload,
    )
  }

  return payload as T
}

export function createAuthClient(fetchImpl: FetchLike = fetch): AuthClient {
  return {
    signUp: {
      email: function signUpWithEmail(input: SignUpWithEmailInput) {
        return requestJson<AuthSessionPayload>(fetchImpl, '/api/auth/sign-up', {
          method: 'POST',
          body: input,
        })
      },
    },
    signIn: {
      email: function signInWithEmail(input: SignInWithEmailInput) {
        return requestJson<AuthSessionPayload>(fetchImpl, '/api/auth/sign-in', {
          method: 'POST',
          body: input,
        })
      },
    },
    signOut: function signOut() {
      return requestJson<{ success: boolean }>(fetchImpl, '/api/auth/sign-out', {
        method: 'POST',
      })
    },
    getSession: function getSession() {
      return requestJson<AuthSessionPayload | null>(
        fetchImpl,
        '/api/auth/get-session',
        {
          method: 'GET',
        },
      )
    },
  }
}

export const authClient = createAuthClient()
