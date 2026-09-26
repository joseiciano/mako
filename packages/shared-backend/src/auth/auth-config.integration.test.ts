import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createEmailVerificationToken } from 'better-auth/api'
import { Client } from 'pg'
import { createBetterAuth, type BetterAuthLike } from './auth-config'
import { resolveLocalTestDatabaseUrl } from '../database/test-database-url'

const backendOrigin = 'http://localhost:8787'

function uniqueEmail(): string {
  return `verify-it-${crypto.randomUUID()}@example.com`
}

function decodeJwtPayload(token: string): { exp: number; iat: number } {
  const payloadPart = token.split('.')[1]

  if (!payloadPart) {
    throw new Error('Verification token is not a JWT')
  }

  return JSON.parse(
    Buffer.from(payloadPart, 'base64url').toString('utf8'),
  ) as { exp: number; iat: number }
}

type SignUpBody = {
  token: string | null
  user: { id: string; email: string; emailVerified: boolean }
}
describe('Better Auth email verification integration', function betterAuthEmailVerificationSuite() {
  let client: Client
  let auth: BetterAuthLike
  let databaseUrl: string
  type VerificationEmailInput = { email: string; url: string }

  const sendVerificationEmail = vi.fn(
    async function sendVerificationEmail(input: VerificationEmailInput) {
      void input
    },
  )

  beforeAll(async function setup() {
    vi.spyOn(console, 'log').mockImplementation(function silenceLogs() {})

    databaseUrl = resolveLocalTestDatabaseUrl()
    client = new Client({ connectionString: databaseUrl })
    await client.connect()

    auth = createBetterAuth({
      connectionString: databaseUrl,
      secret: 'integration-test-secret',
      baseURL: `${backendOrigin}/api/auth`,
      trustedOrigins: ['http://localhost:3000'],
      requireEmailVerification: true,
      sendVerificationEmail,
    })
  })

  afterAll(async function teardown() {
    await client.query(`DELETE FROM "user" WHERE email LIKE 'verify-it-%'`)
    await client.end()
    vi.restoreAllMocks()
  })

  async function callAuthWith(
    authInstance: BetterAuthLike,
    pathWithQuery: string,
    init?: RequestInit,
  ): Promise<Response> {
    return await authInstance.handler(
      new Request(`${backendOrigin}${pathWithQuery}`, init),
    )
  }

  async function callAuth(
    pathWithQuery: string,
    init?: RequestInit,
  ): Promise<Response> {
    return await callAuthWith(auth, pathWithQuery, init)
  }

  async function signUp(
    email: string,
    password: string,
    authInstance: BetterAuthLike = auth,
  ): Promise<Response> {
    return await callAuthWith(authInstance, '/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        name: 'Verification Integration',
        email,
        password,
        callbackURL: '/login?verified=true',
      }),
    })
  }

  async function countSessions(userId: string): Promise<number> {
    const result = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM "session" WHERE "userId" = $1`,
      [userId],
    )

    return Number(result.rows[0].count)
  }

  async function countUsers(email: string): Promise<number> {
    const result = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM "user" WHERE email = $1`,
      [email],
    )

    return Number(result.rows[0].count)
  }

  it('signs up unverified without a session and sends exactly one verification email', async function run() {
    const email = uniqueEmail()
    const response = await signUp(email, 'correct-password-123')
    const body = (await response.json()) as SignUpBody

    expect(response.status).toBe(200)
    expect(body.token).toBe(null)
    expect(body.user.emailVerified).toBe(false)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await countSessions(body.user.id)).toBe(0)

    expect(sendVerificationEmail).toHaveBeenCalledTimes(1)

    const sent = sendVerificationEmail.mock.calls[0]?.[0] as {
      email: string
      url: string
    }
    expect(sent.email).toBe(email)

    const verificationUrl = new URL(sent.url)
    expect(verificationUrl.pathname).toBe('/api/auth/verify-email')
    expect(verificationUrl.searchParams.get('callbackURL')).toBe(
      '/login?verified=true',
    )

    const token = verificationUrl.searchParams.get('token')
    expect(token).not.toBe(null)
    const payload = decodeJwtPayload(token as string)
    const lifetimeSeconds = payload.exp - payload.iat
    expect(lifetimeSeconds).toBeGreaterThanOrEqual(3599)
    expect(lifetimeSeconds).toBeLessThanOrEqual(3600)
  })

  it('creates a session and permits unverified signup when verification is not required', async function run() {
    const nonEnforcingAuth = createBetterAuth({
      connectionString: databaseUrl,
      secret: 'integration-test-secret',
      baseURL: `${backendOrigin}/api/auth`,
      trustedOrigins: ['http://localhost:3000'],
      requireEmailVerification: false,
      sendVerificationEmail,
    })
    const email = uniqueEmail()

    const response = await signUp(
      email,
      'correct-password-123',
      nonEnforcingAuth,
    )
    const body = (await response.json()) as SignUpBody

    expect(response.status).toBe(200)
    expect(body.token).toEqual(expect.any(String))
    expect(body.user.emailVerified).toBe(false)
    expect(response.headers.getSetCookie()).not.toEqual([])
    expect(await countSessions(body.user.id)).toBe(1)

    const signInResponse = await callAuthWith(
      nonEnforcingAuth,
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ email, password: 'correct-password-123' }),
      },
    )

    expect(signInResponse.status).toBe(200)
  })

  it('rejects unverified sign-in with EMAIL_NOT_VERIFIED and resends the verification email', async function run() {
    const email = uniqueEmail()
    await signUp(email, 'correct-password-123')
    sendVerificationEmail.mockClear()

    const response = await callAuth('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ email, password: 'correct-password-123' }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    })
    const resend = sendVerificationEmail.mock.calls[0]?.[0] as { email: string }
    expect(resend.email).toBe(email)
  })

  it('marks the email verified on link click without creating a session', async function run() {
    const email = uniqueEmail()
    const response = await signUp(email, 'correct-password-123')
    const body = (await response.json()) as SignUpBody
    const sent = sendVerificationEmail.mock.calls.at(-1)?.[0] as {
      email: string
      url: string
    }

    const verificationResponse = await auth.handler(new Request(sent.url))

    expect(verificationResponse.status).toBe(302)
    expect(verificationResponse.headers.get('location')).toContain(
      '/login?verified=true',
    )
    expect(verificationResponse.headers.get('location')).not.toContain('error=')
    expect(verificationResponse.headers.getSetCookie()).toEqual([])

    const updated = await client.query<{ emailVerified: boolean }>(
      `SELECT "emailVerified" FROM "user" WHERE id = $1`,
      [body.user.id],
    )
    expect(updated.rows[0].emailVerified).toBe(true)
    expect(await countSessions(body.user.id)).toBe(0)
  })

  it('redirects an invalid token to the login callback with INVALID_TOKEN', async function run() {
    const response = await callAuth(
      '/api/auth/verify-email?token=not-a-jwt&callbackURL=%2Flogin%3Fverified%3Dtrue',
    )

    expect(response.status).toBe(302)
    const location = response.headers.get('location')
    expect(location).toContain('/login?verified=true')
    expect(location).toContain('&error=INVALID_TOKEN')
  })

  it('redirects an expired token to the login callback with TOKEN_EXPIRED', async function run() {
    const email = uniqueEmail()
    const expiredToken = await createEmailVerificationToken(
      'integration-test-secret',
      email,
      undefined,
      -1,
    )

    const response = await callAuth(
      `/api/auth/verify-email?token=${expiredToken}&callbackURL=%2Flogin%3Fverified%3Dtrue`,
    )

    expect(response.status).toBe(302)
    const location = response.headers.get('location')
    expect(location).toContain('/login?verified=true')
    expect(location).toContain('&error=TOKEN_EXPIRED')
  })

  it('returns the enumeration-safe synthetic duplicate response without sending another email', async function run() {
    const email = uniqueEmail()
    sendVerificationEmail.mockClear()
    const first = await signUp(email, 'correct-password-123')
    const firstBody = (await first.json()) as SignUpBody

    const second = await signUp(email, 'different-password-456')
    const secondBody = (await second.json()) as SignUpBody

    expect(second.status).toBe(200)
    expect(secondBody.token).toBe(null)
    expect(secondBody.user.emailVerified).toBe(false)
    expect(secondBody.user.id).not.toBe(firstBody.user.id)
    expect(await countUsers(email)).toBe(1)
    expect(await countSessions(firstBody.user.id)).toBe(0)
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1)
  })
})
