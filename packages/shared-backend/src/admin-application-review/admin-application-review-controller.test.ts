import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { BetterAuthLike } from '../auth/auth-config'
import { createAuthSessionMiddleware } from '../auth/auth-middleware'
import { requireAdmin } from '../auth/require-admin'
import { DatabaseUnavailableError, handleUnexpectedError } from '../http'
import { registerAdminApplicationReviewController } from './admin-application-review-controller'
import { AdminApplicationReviewService } from './admin-application-review-service'
import {
  adminId,
  applicantId,
  applicationId,
  buildDetailRow,
  createFakeRepository,
  createRecordingLogger,
  secondApplicationId,
} from './test-support'

type SessionKind = 'anonymous' | 'user' | 'admin' | 'self' | 'unavailable'

function createApp(
  session: SessionKind,
  options: { rows?: ReturnType<typeof buildDetailRow>[]; failCreate?: Error } = {},
) {
  const { repository, state } = createFakeRepository(options.rows ?? [buildDetailRow()])
  const { logger } = createRecordingLogger()
  const app = new Hono<{ Bindings: Record<string, unknown> }>()

  app.onError(handleUnexpectedError)
  app.use(
    '/api/*',
    createAuthSessionMiddleware({
      getAuth: function getAuth() {
        return {
          handler: async () => new Response(null),
          api: {
            getSession: (async () => {
              if (session === 'unavailable') throw new Error('session store down')
              if (session === 'anonymous') return null
              return {
                user: {
                  id: session === 'self' ? applicantId : adminId,
                  email: 'someone@mako.dev',
                  isAdmin: session !== 'user',
                },
                session: { id: 'session-1' },
              }
            }) as BetterAuthLike['api']['getSession'],
          },
        } satisfies BetterAuthLike
      },
    }),
  )
  registerAdminApplicationReviewController(app, {
    guard: requireAdmin,
    createService: function createService() {
      if (options.failCreate) throw options.failCreate
      return new AdminApplicationReviewService(repository, logger)
    },
  })

  return { app, state }
}

const noStore = 'private, no-store'

function patch(app: Hono<{ Bindings: Record<string, unknown> }>, id: string, body: unknown, raw = false) {
  return app.request(`/api/admin/applications/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

describe('admin application review routes', function () {
  describe('authorization', function () {
    it.each([
      ['anonymous', 401],
      ['user', 403],
    ] as const)('%s gets %i on every route with no-store', async function (kind, status) {
      const { app } = createApp(kind)
      const responses = await Promise.all([
        app.request('/api/admin/applications'),
        app.request(`/api/admin/applications/${applicationId}`),
        patch(app, applicationId, { decision: 'approved' }),
      ])

      for (const response of responses) {
        expect(response.status).toBe(status)
        expect(response.headers.get('cache-control')).toBe(noStore)
      }
    })

    it('returns 503 when the session provider is unreachable', async function () {
      const { app } = createApp('unavailable')
      const response = await app.request('/api/admin/applications')
      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe(noStore)
    })

    it('returns 503 when the database is unavailable and 500 for programming errors', async function () {
      const unavailable = createApp('admin', { failCreate: new DatabaseUnavailableError() })
      expect((await unavailable.app.request('/api/admin/applications')).status).toBe(503)

      const broken = createApp('admin', { failCreate: new TypeError('bug') })
      const response = await broken.app.request('/api/admin/applications')
      expect(response.status).toBe(500)
      expect(response.headers.get('cache-control')).toBe(noStore)
    })
  })

  describe('GET /api/admin/applications', function () {
    it('lists pending applications with pagination and no-store', async function () {
      const { app } = createApp('admin')
      const response = await app.request('/api/admin/applications')

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe(noStore)
      const body = (await response.json()) as {
        applications: Record<string, unknown>[]
        pagination: unknown
      }
      expect(body.pagination).toEqual({ limit: 25, offset: 0, hasMore: false })
      expect(body.applications[0]).not.toHaveProperty('employmentHistory')
      expect(body.applications[0]).not.toHaveProperty('reviewedBy')
    })

    it.each([
      'limit=0',
      'limit=101',
      'limit=abc',
      'limit=1.5',
      'offset=-1',
      'offset=1.5',
      'offset=abc',
      'status=bogus',
    ])('returns 400 for ?%s', async function (query) {
      const { app } = createApp('admin')
      const response = await app.request(`/api/admin/applications?${query}`)
      expect(response.status).toBe(400)
      expect(response.headers.get('cache-control')).toBe(noStore)
    })

    it('accepts limit bounds 1 and 100', async function () {
      const { app } = createApp('admin')
      expect((await app.request('/api/admin/applications?limit=1')).status).toBe(200)
      expect((await app.request('/api/admin/applications?limit=100&offset=5')).status).toBe(200)
    })
  })

  describe('GET /api/admin/applications/:id', function () {
    it('returns detail', async function () {
      const { app } = createApp('admin')
      const response = await app.request(`/api/admin/applications/${applicationId}`)
      expect(response.status).toBe(200)
      const { application } = (await response.json()) as { application: Record<string, unknown> }
      expect(application.employmentHistory).toHaveLength(1)
      expect(application).toHaveProperty('reviewedBy', null)
    })

    it('returns 404 for an unknown id and 400 for a malformed id', async function () {
      const { app } = createApp('admin')
      const missing = await app.request(`/api/admin/applications/${secondApplicationId}`)
      expect(missing.status).toBe(404)
      expect(missing.headers.get('cache-control')).toBe(noStore)
      expect((await app.request('/api/admin/applications/nope')).status).toBe(400)
    })
  })

  describe('PATCH /api/admin/applications/:id', function () {
    it.each(['approved', 'rejected'])('%s returns the updated detail', async function (decision) {
      const { app } = createApp('admin')
      const response = await patch(app, applicationId, { decision })

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe(noStore)
      const { application } = (await response.json()) as {
        application: { status: string; reviewedBy: { userId: string } }
      }
      expect(application.status).toBe(decision)
      expect(application.reviewedBy.userId).toBe(adminId)
    })

    it('returns 400 for invalid JSON, body, or id', async function () {
      const { app } = createApp('admin')
      expect((await patch(app, applicationId, '{nope', true)).status).toBe(400)
      expect((await patch(app, applicationId, {})).status).toBe(400)
      expect((await patch(app, applicationId, { decision: 'pending' })).status).toBe(400)
      expect((await patch(app, 'bad-id', { decision: 'approved' })).status).toBe(400)
    })

    it('returns 403 for self-review without mutation', async function () {
      const { app, state } = createApp('self')
      const response = await patch(app, applicationId, { decision: 'approved' })
      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe(noStore)
      expect(state.rows[0]?.status).toBe('pending')
    })

    it('returns 404 for an unknown application', async function () {
      const { app } = createApp('admin')
      expect((await patch(app, secondApplicationId, { decision: 'approved' })).status).toBe(404)
    })

    it('returns 409 for non-pending applications; first decision wins', async function () {
      const { app } = createApp('admin')
      expect((await patch(app, applicationId, { decision: 'approved' })).status).toBe(200)
      const second = await patch(app, applicationId, { decision: 'rejected' })
      expect(second.status).toBe(409)
      expect(second.headers.get('cache-control')).toBe(noStore)
    })

    it('returns 409 approving a deleted applicant but allows rejection', async function () {
      const { app, state } = createApp('admin', {
        rows: [buildDetailRow({ applicant_is_deleted: true })],
      })
      expect((await patch(app, applicationId, { decision: 'approved' })).status).toBe(409)
      expect(state.eligibleUserIds.size).toBe(0)
      expect((await patch(app, applicationId, { decision: 'rejected' })).status).toBe(200)
    })
  })
})
