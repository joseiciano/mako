import { Hono } from 'hono'
import type { Interview } from '@mako/shared'
import { describe, expect, it } from 'vitest'
import {
  InterviewRepository,
  createInMemoryInterviewDataSource,
} from './interview-repository'
import { registerInterviewController } from './interview-controller'
import { InterviewService } from './interview-service'
import type { InterviewSession } from './types'

type TestBindings = Record<string, unknown>

const activeSession: InterviewSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@mako.dev',
}

describe('InterviewController', function interviewControllerSuite() {
  it('creates direct ai-led interviews for authenticated users', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 1,
      credits: 0,
    })

    const response = await app.request('/api/interviews', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      interview: {
        scheduler_id: activeSession.userId,
        mode: 'ai_led',
        tier: 'standard',
      },
    })
  })

  it('returns 401 without an authenticated session', async function run() {
    const app = createInterviewApp({
      session: null,
      freeAiInterviews: 1,
      credits: 0,
    })

    const response = await app.request('/api/interviews', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('returns 400 when request body is not valid json', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 1,
      credits: 0,
    })

    const response = await app.request('/api/interviews', {
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

  it('returns 400 for schema-invalid scheduled_at payloads', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 1,
      credits: 0,
    })

    const response = await app.request('/api/interviews', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'later',
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 422 for unsupported direct peer-to-peer create combinations', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 1,
      credits: 0,
    })

    const response = await app.request('/api/interviews', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'system_design',
        mode: 'peer_to_peer',
        scheduled_at: '2026-04-13T10:00:00.000Z',
      }),
    })

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error:
        'Direct peer-to-peer interview creation is not supported. Use the availability matcher flow.',
    })
  })

  it('returns 400 when direct create requests provide interviewer_id', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 1,
      credits: 0,
    })

    const response = await app.request('/api/interviews', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: '2026-04-13T10:00:00.000Z',
        interviewer_id: '33333333-3333-4333-8333-333333333333',
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: '`interviewer_id` is not supported for direct interview creation.',
    })
  })

  it('returns 400 when direct create requests try to set tier client-side', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 1,
      credits: 0,
    })

    const response = await app.request('/api/interviews', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: '2026-04-13T10:00:00.000Z',
        tier: 'premium',
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: '`tier` is resolved server-side and must not be provided.',
    })
  })

  it('returns 422 when the account has no remaining free ai quota or credits', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
    })

    const response = await app.request('/api/interviews', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      }),
    })

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error:
        'AI-led interview creation requires remaining free AI interviews or credits.',
    })
  })

  it('lists participant interviews using shared query validation and deterministic ordering', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          scheduled_at: '2026-04-14T10:00:00.000Z',
        }),
        createInterviewRecord({
          id: '22222222-2222-4222-8222-222222222222',
          interviewer_id: activeSession.userId,
          scheduled_at: '2026-04-13T10:00:00.000Z',
        }),
        createInterviewRecord({
          id: '44444444-4444-4444-8444-444444444444',
          scheduler_id: '99999999-9999-4999-8999-999999999999',
        }),
      ],
    })

    const response = await app.request('/api/interviews?status=scheduled&limit=1', {
      method: 'GET',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      interviews: [
        expect.objectContaining({
          id: '22222222-2222-4222-8222-222222222222',
          interviewer_id: activeSession.userId,
        }),
      ],
    })
  })

  it('returns 400 for invalid interview list query params', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
    })

    const response = await app.request('/api/interviews?limit=', {
      method: 'GET',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('cancels scheduled interviews and returns the shared success contract', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/cancel`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
    })

    const listResponse = await app.request('/api/interviews?status=cancelled', {
      method: 'GET',
    })

    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual({
      interviews: [
        expect.objectContaining({
          id: interviewId,
          status: 'cancelled',
        }),
      ],
    })
  })

  it('returns 400 for invalid cancel route params', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
    })

    const response = await app.request('/api/interviews/not-a-uuid/cancel', {
      method: 'POST',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 409 when cancelling interviews outside the scheduled state', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/cancel',
      {
        method: 'POST',
      },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Only scheduled interviews can be cancelled.',
    })
  })
})

function createInterviewApp(options: {
  session: InterviewSession | null
  freeAiInterviews: number
  credits: number
  seedInterviews?: readonly Interview[]
}) {
  const app = new Hono<{ Bindings: TestBindings }>()
  const interviewService = new InterviewService(
    new InterviewRepository(
      createInMemoryInterviewDataSource([
        {
          userId: activeSession.userId,
          credits: options.credits,
          freeAiInterviews: options.freeAiInterviews,
        },
      ], options.seedInterviews),
    ),
    undefined,
    function createId() {
      return '22222222-2222-4222-8222-222222222222'
    },
    function now() {
      return '2026-04-13T10:00:00.000Z'
    },
  )

  registerInterviewController(app, {
    createService: function createService() {
      return interviewService
    },
    resolveSession: function resolveSession() {
      return options.session
    },
  })

  return app
}

function createInterviewRecord(overrides: Partial<Interview> = {}): Interview {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-04-13T10:00:00.000Z',
    created_at: '2026-04-13T09:55:00.000Z',
    updated_at: '2026-04-13T09:55:00.000Z',
    ...overrides,
  }
}
