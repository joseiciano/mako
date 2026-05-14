import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createMakoAuthClientMock } = vi.hoisted(function createMocks() {
  return {
    createMakoAuthClientMock: vi.fn(),
  }
})

vi.mock('@mako/shared-frontend', function mockSharedFrontend() {
  return {
    createMakoAuthClient: createMakoAuthClientMock,
  }
})

describe('app auth client', function () {
  beforeEach(function resetMocks() {
    vi.resetModules()
    createMakoAuthClientMock.mockReset()
  })

  it('delegates app auth client creation to the shared factory', async function () {
    const client = { getSession: vi.fn() }
    createMakoAuthClientMock.mockReturnValue(client)

    const module = await import('./auth-client')

    expect(module.authClient).toBe(client)
    expect(createMakoAuthClientMock).toHaveBeenCalledTimes(1)
    expect(createMakoAuthClientMock).toHaveBeenCalledWith({
      baseURL: 'http://localhost:3000/api/auth',
    })
    expect(module.getAuthBaseUrl()).toBe('http://localhost:3000/api/auth')
  })
})
