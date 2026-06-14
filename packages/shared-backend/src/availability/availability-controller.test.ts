import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  AvailabilityRepository,
  createInMemoryAvailabilityDataSource,
} from './availability-repository'
import { registerAvailabilityController } from './availability-controller'
import { AvailabilityService } from './availability-service'
import type { AvailabilitySession } from './types'

type TestBindings = Record<string, unknown>

const activeSession: AvailabilitySession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@mako.dev',
}

describe('AvailabilityController', function availabilityControllerSuite() {
  it('returns 201 for authenticated create availability', async function run() {
    const app = createAvailabilityApp({ session: activeSession })

    const response = await app.request('/api/availability', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interview_type: 'system_design',
        max_matches: 2,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
        ],
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      request: {
        user_id: activeSession.userId,
        interview_type: 'system_design',
        max_matches: 2,
        current_matches: 0,
        status: 'active',
      },
      slots: [
        {
          status: 'available',
          start_time: '2026-04-13T10:00:00.000Z',
          end_time: '2026-04-13T11:00:00.000Z',
        },
      ],
    })
  })

  it('returns 401 without an authenticated session', async function run() {
    const app = createAvailabilityApp({ session: null })

    const response = await app.request('/api/availability', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interview_type: 'system_design',
        max_matches: 2,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
        ],
      }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('returns 401 for malformed json without an authenticated session', async function run() {
    const app = createAvailabilityApp({ session: null })

    const response = await app.request('/api/availability', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{bad-json',
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('returns 401 for session with invalid userId UUID', async function run() {
    const app = createAvailabilityApp({
      session: { userId: 'not-a-valid-uuid', email: 'candidate@mako.dev' },
    })

    const response = await app.request('/api/availability', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interview_type: 'system_design',
        max_matches: 2,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
        ],
      }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('returns 400 when request body is not valid json', async function run() {
    const app = createAvailabilityApp({ session: activeSession })

    const response = await app.request('/api/availability', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{bad-json',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Request body must be valid JSON.',
    })
  })

  it('returns 400 for schema-invalid interview_type', async function run() {
    const app = createAvailabilityApp({ session: activeSession })

    const response = await app.request('/api/availability', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interview_type: 'invalid_type',
        max_matches: 2,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
        ],
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 400 for schema-invalid max_matches', async function run() {
    const app = createAvailabilityApp({ session: activeSession })

    const response = await app.request('/api/availability', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interview_type: 'system_design',
        max_matches: 0,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
        ],
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 400 for schema-invalid slot duration', async function run() {
    const app = createAvailabilityApp({ session: activeSession })

    const response = await app.request('/api/availability', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interview_type: 'system_design',
        max_matches: 2,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T10:30:00.000Z',
          },
        ],
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 400 for extra unacceptable fields', async function run() {
    const app = createAvailabilityApp({ session: activeSession })

    const response = await app.request('/api/availability', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interview_type: 'system_design',
        max_matches: 2,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
        ],
        extra_field: 'not_allowed',
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 422 for duplicate slot windows', async function run() {
    const app = createAvailabilityApp({ session: activeSession })

    const response = await app.request('/api/availability', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interview_type: 'system_design',
        max_matches: 2,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
        ],
      }),
    })

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error: 'Duplicate slot windows are not allowed in the same request.',
    })
  })
})

function createAvailabilityApp(options: {
  session: AvailabilitySession | null
}) {
  const app = new Hono<{ Bindings: TestBindings }>()
  const availabilityService = new AvailabilityService(
    new AvailabilityRepository(createInMemoryAvailabilityDataSource()),
    function createId() {
      return '22222222-2222-4222-8222-222222222222'
    },
    function now() {
      return '2026-04-13T09:00:00.000Z'
    },
  )

  registerAvailabilityController(app, {
    createService: function createService() {
      return availabilityService
    },
    resolveSession: function resolveSession() {
      return options.session
    },
  })

  return app
}
