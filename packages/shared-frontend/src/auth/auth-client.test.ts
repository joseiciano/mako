import { describe, expect, it, vi } from 'vitest'

const createAuthClientMock = vi.fn()

vi.mock('better-auth/react', function () {
  return {
    createAuthClient: createAuthClientMock,
  }
})

describe('auth client', function () {
  it('creates the shared auth client with default options', async function () {
    createAuthClientMock.mockReturnValue({ getSession: vi.fn() })

    const module = await import('./auth-client')

    expect(module.authClient).toBeDefined()
    expect(createAuthClientMock).toHaveBeenCalledWith({
      fetchOptions: {
        credentials: 'include',
      },
    })
  })

  it('allows creating a client with a custom base URL', async function () {
    createAuthClientMock.mockClear()
    createAuthClientMock.mockReturnValue({ getSession: vi.fn() })

    const module = await import('./auth-client')

    module.createMakoAuthClient({ baseURL: 'http://localhost:8787' })

    expect(createAuthClientMock).toHaveBeenCalledWith({
      baseURL: 'http://localhost:8787',
      fetchOptions: {
        credentials: 'include',
      },
    })
  })
})
