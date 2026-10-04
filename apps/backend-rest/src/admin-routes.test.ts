import { describe, expect, it } from 'vitest'
import { createApp } from './index'

const applicationPath = '/api/admin/applications/22222222-2222-4222-8222-222222222222'

describe('admin review route registration', function () {
  it.each([
    ['GET', '/api/admin/applications'],
    ['GET', applicationPath],
    ['PATCH', applicationPath],
  ])(
    '%s %s is guarded: unauthenticated requests get 401 with no demo fallback',
    async function (method, path) {
      const app = createApp()
      const response = await app.request(path, {
        method,
        headers: {
          'content-type': 'application/json',
          // Demo identity headers must never authorize the admin surface.
          'x-user-id': '11111111-1111-4111-8111-111111111111',
          'x-user-email': 'admin@mako.dev',
        },
        body: method === 'PATCH' ? JSON.stringify({ decision: 'approved' }) : undefined,
      })

      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    },
  )
})
