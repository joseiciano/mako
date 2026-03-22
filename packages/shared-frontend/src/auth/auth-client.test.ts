import { describe, expect, it, vi } from 'vitest'
import {
  AuthClientError,
  createAuthClient,
  type AuthSessionPayload,
} from './auth-client'

describe('authClient', function () {
  it('calls sign-up endpoint with email payload', async function () {
    const expectedPayload: AuthSessionPayload = {
      user: {
        email: 'jose@example.com',
        name: 'Jose',
      },
      session: {
        id: 'session_123',
      },
    }

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(expectedPayload), {
        status: 200,
      }),
    )

    const client = createAuthClient(fetchMock)

    const result = await client.signUp.email({
      name: 'Jose',
      email: 'jose@example.com',
      password: 'password123',
    })

    expect(result).toEqual(expectedPayload)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-up', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Jose',
        email: 'jose@example.com',
        password: 'password123',
      }),
      credentials: 'include',
    })
  })

  it('throws an AuthClientError for failed auth requests', async function () {
    expect.assertions(2)

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid credentials' }), {
        status: 401,
      }),
    )

    const client = createAuthClient(fetchMock)

    try {
      await client.signIn.email({
        email: 'jose@example.com',
        password: 'wrong-password',
      })
    } catch (error) {
      expect(error).toBeInstanceOf(AuthClientError)
      expect(error).toMatchObject({
        message: 'Invalid credentials',
        status: 401,
      })
    }
  })

  it('returns null when the session endpoint responds with null', async function () {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('null', {
        status: 200,
      }),
    )

    const client = createAuthClient(fetchMock)

    const session = await client.getSession()

    expect(session).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/get-session', {
      method: 'GET',
      headers: undefined,
      body: undefined,
      credentials: 'include',
    })
  })
})
