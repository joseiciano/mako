import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { registerInterviewerApplicationController } from './interviewer-application-controller'
import { InterviewerApplicationService } from './interviewer-application-service'
import { InterviewerApplicationRepository } from './interviewer-application-repository'

type TestBindings = Record<string, unknown>

const authenticatedUserId = '11111111-1111-4111-8111-111111111111'
const createdApplicationId = '22222222-2222-4222-8222-222222222222'
const existingCompanyId = '33333333-3333-4333-8333-333333333333'

describe('InterviewerApplicationController', function suite() {
  describe('POST /api/interviewer/apply', function postSuite() {
    it('returns 201 with application on successful submission', async function run() {
      const app = createInterviewerApplicationApp()

      const response = await app.request('/api/interviewer/apply', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': authenticatedUserId,
          'x-user-email': 'user@mako.dev',
        },
        body: JSON.stringify({
          email: 'contact@example.com',
          employmentRecordIds: [existingCompanyId],
        }),
      })

      expect(response.status).toBe(201)
      expect(response.headers.get('cache-control')).toBe('private, no-store')

      const payload = await response.json()

      expect(payload).toEqual({
        application: {
          applicationId: createdApplicationId,
          email: 'contact@example.com',
          employmentHistory: [
            {
              sourceCompanyId: existingCompanyId,
              company: 'demo company',
              role: 'demo role',
              start: '2020-01-01',
              end: null,
            },
          ],
          status: 'pending',
          createdAt: '2026-08-07T00:00:00.000Z',
          updatedAt: '2026-08-07T00:00:00.000Z',
        },
      })
    })

    it('returns 400 for invalid request payload', async function run() {
      const app = createInterviewerApplicationApp()

      const response = await app.request('/api/interviewer/apply', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': authenticatedUserId,
          'x-user-email': 'user@mako.dev',
        },
        body: JSON.stringify({
          email: 'not-an-email',
          employmentRecordIds: ['not-a-uuid'],
        }),
      })

      expect(response.status).toBe(400)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.json()).resolves.toMatchObject({
        error: 'Invalid request payload',
      })
    })

    it('returns 400 for duplicate employmentRecordIds', async function run() {
      const app = createInterviewerApplicationApp()

      const response = await app.request('/api/interviewer/apply', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': authenticatedUserId,
          'x-user-email': 'user@mako.dev',
        },
        body: JSON.stringify({
          email: 'contact@example.com',
          employmentRecordIds: [existingCompanyId, existingCompanyId],
        }),
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: 'Invalid request payload',
      })
    })

    it('returns 400 when employmentRecordIds exceeds limit', async function run() {
      const app = createInterviewerApplicationApp()

      const response = await app.request('/api/interviewer/apply', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': authenticatedUserId,
          'x-user-email': 'user@mako.dev',
        },
        body: JSON.stringify({
          email: 'contact@example.com',
          employmentRecordIds: [
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            'ffffffff-ffff-4fff-8fff-ffffffffffff',
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
            '33333333-3333-4333-8333-333333333333',
            '44444444-4444-4444-8444-444444444444',
            '55555555-5555-4555-8555-555555555555',
          ],
        }),
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: 'Invalid request payload',
      })
    })

    it('returns 400 for empty employmentRecordIds', async function run() {
      const app = createInterviewerApplicationApp()

      const response = await app.request('/api/interviewer/apply', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': authenticatedUserId,
          'x-user-email': 'user@mako.dev',
        },
        body: JSON.stringify({
          email: 'contact@example.com',
          employmentRecordIds: [],
        }),
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: 'Invalid request payload',
      })
    })

    it('returns 401 when session is null', async function run() {
      const app = createInterviewerApplicationApp({
        resolveSession: function resolveSession() {
          return null
        },
      })

      const response = await app.request('/api/interviewer/apply', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'contact@example.com',
          employmentRecordIds: [existingCompanyId],
        }),
      })

      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.json()).resolves.toEqual({
        error: 'You must be authenticated to access this resource.',
      })
    })

    it('returns 403 when account is inactive', async function run() {
      const app = createInterviewerApplicationApp({
        executorOptions: { userActive: false },
      })

      const response = await app.request('/api/interviewer/apply', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': authenticatedUserId,
          'x-user-email': 'user@mako.dev',
        },
        body: JSON.stringify({
          email: 'contact@example.com',
          employmentRecordIds: [existingCompanyId],
        }),
      })

      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.json()).resolves.toEqual({
        error: 'Account is inactive or deleted.',
      })
    })

    it('returns 409 when an active application already exists', async function run() {
      const app = createInterviewerApplicationApp({
        executorOptions: { activeApplication: true },
      })

      const response = await app.request('/api/interviewer/apply', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': authenticatedUserId,
          'x-user-email': 'user@mako.dev',
        },
        body: JSON.stringify({
          email: 'contact@example.com',
          employmentRecordIds: [existingCompanyId],
        }),
      })

      expect(response.status).toBe(409)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.json()).resolves.toEqual({
        error: 'An active interviewer application already exists.',
      })
    })
  })

  describe('GET /api/interviewer/status', function statusSuite() {
    it('returns 200 with application when one exists', async function run() {
      const app = createInterviewerApplicationApp({
        executorOptions: { hasLatestApplication: true },
      })

      const response = await app.request('/api/interviewer/status', {
        method: 'GET',
        headers: {
          'x-user-id': authenticatedUserId,
          'x-user-email': 'user@mako.dev',
        },
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      const payload = await response.json()
      expect(payload.application).not.toBeNull()
      expect(payload.application.applicationId).toBe(createdApplicationId)
    })

    it('returns 200 with null when no application exists', async function run() {
      const app = createInterviewerApplicationApp({
        executorOptions: { hasLatestApplication: false },
      })

      const response = await app.request('/api/interviewer/status', {
        method: 'GET',
        headers: {
          'x-user-id': authenticatedUserId,
          'x-user-email': 'user@mako.dev',
        },
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.json()).resolves.toEqual({ application: null })
    })

    it('returns 401 when session is null', async function run() {
      const app = createInterviewerApplicationApp({
        resolveSession: function resolveSession() {
          return null
        },
      })

      const response = await app.request('/api/interviewer/status', {
        method: 'GET',
      })

      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    })

    it('returns 403 when account is inactive', async function run() {
      const app = createInterviewerApplicationApp({
        executorOptions: { userActive: false },
      })

      const response = await app.request('/api/interviewer/status', {
        method: 'GET',
        headers: {
          'x-user-id': authenticatedUserId,
          'x-user-email': 'user@mako.dev',
        },
      })

      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      await expect(response.json()).resolves.toEqual({
        error: 'Account is inactive or deleted.',
      })
    })
  })
})

type ExecutorOptions = {
  userActive?: boolean
  activeApplication?: boolean
  hasLatestApplication?: boolean
}

function createInterviewerApplicationApp(
  options?: {
    executorOptions?: ExecutorOptions
    resolveSession?: Parameters<typeof registerInterviewerApplicationController<TestBindings>>[1]['resolveSession']
  },
) {
  const app = new Hono<{ Bindings: TestBindings }>()
  const service = new InterviewerApplicationService(
    new InterviewerApplicationRepository(
      createSubmitQueryExecutor(options?.executorOptions ?? {}),
    ),
  )

  registerInterviewerApplicationController(app, {
    createService: function createService() {
      return service
    },
    resolveSession:
      options?.resolveSession ??
      function resolveSession(context) {
        const userId = context.req.header('x-user-id')
        const email = context.req.header('x-user-email')

        if (!userId || !email) {
          return null
        }

        return { userId, email }
      },
  })

  return app
}

function createSubmitQueryExecutor(options: ExecutorOptions) {
  const userActive = options.userActive ?? true
  const activeApplication = options.activeApplication ?? false
  const hasLatestApplication = options.hasLatestApplication ?? false

  return {
    async query<Row>(queryInput: SqlQuery) {
      const text = queryInput.text

      // BEGIN / COMMIT / ROLLBACK
      if (
        text.includes('BEGIN') ||
        text.includes('COMMIT') ||
        text.includes('ROLLBACK')
      ) {
        return { rows: [] as Row[], rowCount: 0 }
      }

      // Lock applicant user row (transaction)
      if (text.includes('SELECT id') && text.includes('FROM "user"') && text.includes('FOR UPDATE')) {
        return {
          rows: (userActive ? [{ id: authenticatedUserId }] : []) as Row[],
        }
      }

      // isUserActive check (service-level, GET status)
      if (text.includes('SELECT 1 FROM "user"')) {
        return {
          rows: (userActive ? [{ exists: 1 }] : []) as Row[],
        }
      }

      // Active application check
      if (text.includes('status IN') && text.includes('LIMIT 1') && text.includes('user_interviewer_applications')) {
        return {
          rows: (activeApplication ? [{ id: createdApplicationId }] : []) as Row[],
        }
      }

      // Lock user_companies rows
      if (text.includes('FROM user_companies')) {
        return {
          rows: [
            {
              id: existingCompanyId,
              user_id: authenticatedUserId,
              company: 'demo company',
              role: 'demo role',
              joined: '2020-01-01T00:00:00.000Z',
              ended_at: null,
              created_at: '2020-01-01T00:00:00.000Z',
              updated_at: '2020-01-01T00:00:00.000Z',
              deleted_at: null,
            },
          ] as Row[],
        }
      }

      // INSERT application
      if (text.includes('INSERT INTO user_interviewer_applications')) {
        const [, userId, email, employmentHistory] = queryInput.values
        return {
          rows: [
            {
              id: createdApplicationId,
              user_id: userId,
              email,
              employment_history: typeof employmentHistory === 'string'
                ? JSON.parse(employmentHistory)
                : employmentHistory,
              status: 'pending',
              reviewed_by: null,
              reviewed_at: null,
              created_at: '2026-08-07T00:00:00.000Z',
              updated_at: '2026-08-07T00:00:00.000Z',
            },
          ] as Row[],
        }
      }

      // GET latest application
      if (text.includes('ORDER BY created_at DESC') && text.includes('user_interviewer_applications')) {
        if (!hasLatestApplication) {
          return { rows: [] as Row[] }
        }

        return {
          rows: [
            {
              id: createdApplicationId,
              user_id: authenticatedUserId,
              email: 'contact@example.com',
              employment_history: [
                {
                  sourceCompanyId: existingCompanyId,
                  company: 'demo company',
                  role: 'demo role',
                  start: '2020-01-01',
                  end: null,
                },
              ],
              status: 'pending',
              reviewed_by: null,
              reviewed_at: null,
              created_at: '2026-08-07T00:00:00.000Z',
              updated_at: '2026-08-07T00:00:00.000Z',
            },
          ] as Row[],
        }
      }

      return { rows: [] as Row[] }
    },
  }
}
