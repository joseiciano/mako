import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiRequestInit, createApiUrl } from './http-transport'

describe('http transport', function httpTransportSuite() {
  afterEach(function resetEnvironment() {
    vi.unstubAllEnvs()
  })

  it('resolves app API paths from the configured auth backend URL', function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://mako-backend-rest.icianojn.workers.dev/api/auth',
    )

    expect(createApiUrl('/api/account')).toBe(
      'https://mako-backend-rest.icianojn.workers.dev/api/account',
    )
    expect(createApiUrl('/api/interviews?status=scheduled')).toBe(
      'https://mako-backend-rest.icianojn.workers.dev/api/interviews?status=scheduled',
    )
  })

  it('uses include credentials for cross-origin backend requests', function run() {
    expect(createApiRequestInit({ method: 'GET' })).toEqual({
      method: 'GET',
      credentials: 'include',
    })
  })
})
