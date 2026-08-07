import { Hono } from 'hono'
import type { Interview, InterviewDetail } from '@mako/shared'
import { describe, expect, it } from 'vitest'
import {
  InterviewRepository,
  createInMemoryInterviewDataSource,
} from './interview-repository'
import { registerInterviewController } from './interview-controller'
import { InterviewService } from './interview-service'
import { createDemoRealtimeProvider } from './realtime-provider'
import { AiChatRepository, AiChatUnavailableError } from './ai-chat-repository'
import { AiChatProviderError } from './ai-gateway-responder'
import type { AiChatServicePort, InterviewSession } from './types'
import type {
  InterviewPostCommitEvent,
  InterviewPostCommitEventPublisher,
} from './interview-post-commit-event'
import { TierPolicyService } from '../tier-policy'

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

  it('returns 422 for unsupported direct peer-to-peer create and emits no queue event', async function run() {
    const publishedEvents: InterviewPostCommitEvent[] = []
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 1,
      credits: 0,
      postCommitEventPublisher: {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
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
    expect(publishedEvents).toHaveLength(0)
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

  it('list response does not expose secret detail fields', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          realtime_session_id: 'sess_abc123',
          excalidraw_room_id: 'room_def456',
          excalidraw_key: 'key_ghi789',
          recording_url: 'https://r2.example.com/recording.mp4',
          screenshot_urls: ['https://r2.example.com/ss1.png'],
          feedback: null,
        }),
      ],
    })

    const response = await app.request('/api/interviews', {
      method: 'GET',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.interviews).toHaveLength(1)
    expect(body.interviews[0]).not.toHaveProperty('realtime_session_id')
    expect(body.interviews[0]).not.toHaveProperty('excalidraw_room_id')
    expect(body.interviews[0]).not.toHaveProperty('excalidraw_key')
    expect(body.interviews[0]).not.toHaveProperty('recording_url')
    expect(body.interviews[0]).not.toHaveProperty('screenshot_urls')
    expect(body.interviews[0]).not.toHaveProperty('feedback')
  })

  it('returns interview detail without collaboration credentials for participants', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          realtime_session_id: 'sess_abc123',
          excalidraw_room_id: 'room_def456',
          excalidraw_key: 'key_ghi789',
          recording_url: 'https://r2.example.com/recording.mp4',
        }),
      ],
    })

    const response = await app.request('/api/interviews/33333333-3333-4333-8333-333333333333', {
      method: 'GET',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.interview).not.toHaveProperty('realtime_session_id')
    expect(body.interview).not.toHaveProperty('excalidraw_room_id')
    expect(body.interview).not.toHaveProperty('excalidraw_key')
    expect(body.interview.recording_url).toBe('https://r2.example.com/recording.mp4')
  })

  it('returns 404 when non-participant requests interview detail', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: '99999999-9999-4999-8999-999999999999',
        }),
      ],
    })

    const response = await app.request('/api/interviews/33333333-3333-4333-8333-333333333333', {
      method: 'GET',
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Interview was not found for the active participant.',
    })
  })

  it('returns 401 when requesting interview detail without authentication', async function run() {
    const app = createInterviewApp({
      session: null,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
        }),
      ],
    })

    const response = await app.request('/api/interviews/33333333-3333-4333-8333-333333333333', {
      method: 'GET',
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
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

  it('allows interviewers to cancel scheduled interviews they are assigned to', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: '99999999-9999-4999-8999-999999999999',
          interviewer_id: activeSession.userId,
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
  it('returns 401 when cancelling without an authenticated session', async function run() {
    const app = createInterviewApp({
      session: null,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/cancel',
      {
        method: 'POST',
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('returns 404 when active user is not a participant on the interview', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: '99999999-9999-4999-8999-999999999999',
          interviewer_id: '88888888-8888-4888-8888-888888888888',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/cancel',
      {
        method: 'POST',
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Interview was not found for the active participant.',
    })
  })

  it('returns 404 when cancelling an interview that does not exist', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/cancel',
      {
        method: 'POST',
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Interview was not found for the active participant.',
    })
  })

  it('returns 200 when cancelling an already-cancelled interview and emits no second event', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const publishedEvents: InterviewPostCommitEvent[] = []
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'cancelled',
        }),
      ],
      postCommitEventPublisher: {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
    })

    const response = await app.request(`/api/interviews/${interviewId}/cancel`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
    })
    expect(publishedEvents).toHaveLength(0)
  })

  it('returns 409 when cancelling a completed interview', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          status: 'completed',
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

  it('publishes one created event on successful create through the controller', async function run() {
    const publishedEvents: InterviewPostCommitEvent[] = []
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 1,
      credits: 0,
      postCommitEventPublisher: {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
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
    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0]).toMatchObject({
      event_type: 'interview.created',
    })
  })

  it('returns 201 when create succeeds but publish fails through the controller', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 1,
      credits: 0,
      postCommitEventPublisher: {
        async publish() {
          throw new Error('publish failed')
        },
      },
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
      },
    })
  })

  it('publishes one cancelled event on successful cancel through the controller', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const publishedEvents: InterviewPostCommitEvent[] = []
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
      postCommitEventPublisher: {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
    })

    const response = await app.request(`/api/interviews/${interviewId}/cancel`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0]).toMatchObject({
      event_type: 'interview.cancelled',
    })
  })

  it('returns 200 when cancel succeeds but publish fails through the controller', async function run() {
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
      postCommitEventPublisher: {
        async publish() {
          throw new Error('publish failed')
        },
      },
    })

    const response = await app.request(`/api/interviews/${interviewId}/cancel`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
    })
  })

  it('does not publish cancelled event on invalid cancel state through the controller', async function run() {
    const publishedEvents: InterviewPostCommitEvent[] = []
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
      postCommitEventPublisher: {
        async publish(event) {
          publishedEvents.push(event)
        },
      },
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/cancel',
      {
        method: 'POST',
      },
    )

    expect(response.status).toBe(409)
    expect(publishedEvents).toHaveLength(0)
  })

  it('provisions interview credentials through the documented join-time route', async function run() {
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

    const response = await app.request(`/api/interviews/${interviewId}/provision`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      mode: 'ai_led',
      realtime: {
        realtime_session_id: 'realtime_33333333-3333-4333-8333-333333333333',
        token: 'realtime_token_33333333-3333-4333-8333-333333333333',
      },
      excalidraw: {
        excalidraw_room_id: 'excalidraw_room_33333333-3333-4333-8333-333333333333',
        excalidraw_key: 'excalidraw_key_33333333-3333-4333-8333-333333333333',
      },
    })
  })

  it('returns 401 for provision requests without authentication', async function run() {
    const app = createInterviewApp({
      session: null,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/provision',
      { method: 'POST' },
    )

    expect(response.status).toBe(401)
  })

  it('returns 404 for provision requests by non-participants', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: '99999999-9999-4999-8999-999999999999',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/provision',
      { method: 'POST' },
    )

    expect(response.status).toBe(404)
  })

  it('starts scheduled interview via POST start route', async function run() {
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

    const response = await app.request(`/api/interviews/${interviewId}/start`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      interview: expect.objectContaining({
        id: interviewId,
        status: 'ongoing',
      }),
    })
  })

  it('start route is idempotent on already ongoing interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/start`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      interview: expect.objectContaining({
        id: interviewId,
        status: 'ongoing',
      }),
    })
  })

  it('returns 409 when starting a completed interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'completed',
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/start`, {
      method: 'POST',
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Only scheduled interviews can be started.',
    })
  })

  it('returns 409 when starting a cancelled interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'cancelled',
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/start`, {
      method: 'POST',
    })

    expect(response.status).toBe(409)
  })

  it('returns 404 when non-participant starts an interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: '99999999-9999-4999-8999-999999999999',
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/start`, {
      method: 'POST',
    })

    expect(response.status).toBe(404)
  })

  it('returns 401 for start requests without authentication', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: null,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/start`, {
      method: 'POST',
    })

    expect(response.status).toBe(401)
  })

  it('returns 400 for invalid start route params', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
    })

    const response = await app.request('/api/interviews/not-a-uuid/start', {
      method: 'POST',
    })

    expect(response.status).toBe(400)
  })

  it('ends ongoing interview via POST end route', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/end`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      interview: expect.objectContaining({
        id: interviewId,
        status: 'completed',
      }),
    })
  })

  it('end route is idempotent on already completed interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'completed',
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/end`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      interview: expect.objectContaining({
        id: interviewId,
        status: 'completed',
      }),
    })
  })

  it('returns 409 when ending a scheduled interview', async function run() {
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

    const response = await app.request(`/api/interviews/${interviewId}/end`, {
      method: 'POST',
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Only ongoing interviews can be ended.',
    })
  })

  it('returns 409 when ending a cancelled interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'cancelled',
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/end`, {
      method: 'POST',
    })

    expect(response.status).toBe(409)
  })

  it('returns 404 when non-participant ends an interview', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: '99999999-9999-4999-8999-999999999999',
          status: 'ongoing',
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/end`, {
      method: 'POST',
    })

    expect(response.status).toBe(404)
  })

  it('returns 401 for end requests without authentication', async function run() {
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const app = createInterviewApp({
      session: null,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          status: 'ongoing',
        }),
      ],
    })

    const response = await app.request(`/api/interviews/${interviewId}/end`, {
      method: 'POST',
    })

    expect(response.status).toBe(401)
  })

  it('returns 400 for invalid end route params', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
    })

    const response = await app.request('/api/interviews/not-a-uuid/end', {
      method: 'POST',
    })

    expect(response.status).toBe(400)
  })

  it('returns 503 when no ai-chat responder is configured', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'What should I add next?',
          canvas_snapshot: {
            type: 'excalidraw_scene',
            scene: { elements: [] },
          },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'AI chat is not configured.',
    })
  })

  it('returns 400 when ai-chat body is invalid in no-responder configuration', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: '',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 400 when ai-chat route param is not a valid uuid in no-responder configuration', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
    })

    const response = await app.request(
      '/api/interviews/not-a-uuid/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: {
            type: 'excalidraw_scene',
            scene: {},
          },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 400 when ai-chat request body is not valid json', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: createStubAiChatResponder(),
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bad-json',
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Request body must be valid JSON.',
    })
  })

  it('returns 400 when ai-chat route param is not a valid uuid', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: createStubAiChatResponder(),
    })

    const response = await app.request(
      '/api/interviews/not-a-uuid/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: {
            type: 'excalidraw_scene',
            scene: {},
          },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 400 when ai-chat body is schema-invalid', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: createStubAiChatResponder(),
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: '',
          canvas_snapshot: {
            type: 'excalidraw_scene',
            scene: {},
          },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('delegates valid ai-chat request to the responder and returns its result', async function run() {
    const responder = createStubAiChatResponder({
      reply: 'You are missing a cache invalidation strategy.',
      guidance_mode: 'review',
      prompt_version: 'ai-whiteboard-v1',
    })
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: responder,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'What should I add next?',
          canvas_snapshot: {
            type: 'excalidraw_scene',
            scene: { elements: [{ type: 'rectangle', id: '1' }] },
          },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      reply: 'You are missing a cache invalidation strategy.',
      guidance_mode: 'review',
      prompt_version: 'ai-whiteboard-v1',
    })
    expect(responder.lastInput).toMatchObject({
      interview_id: '33333333-3333-4333-8333-333333333333',
      message: 'What should I add next?',
      canvas_snapshot: {
        type: 'excalidraw_scene',
        scene: { elements: [{ type: 'rectangle', id: '1' }] },
      },
      guidance_mode: 'review',
    })
  })

  it('returns 500 when responder returns malformed output', async function run() {
    const responder: AiChatServicePort = {
      async generateReply() {
        return { reply: 123, guidance_mode: 'wrong', prompt_version: '' } as never
      },
    }
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: responder,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: {
            type: 'excalidraw_scene',
            scene: {},
          },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Unexpected interview error.',
    })
  })

  it('returns 500 when responder throws an error', async function run() {
    const responder: AiChatServicePort = {
      async generateReply() {
        throw new Error('AI service unavailable')
      },
    }
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: responder,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: {
            type: 'excalidraw_scene',
            scene: {},
          },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Unexpected interview error.',
    })
  })

  it('returns 404 when ai-chat targets a missing interview', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: createStubAiChatResponder(),
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Interview was not found for the active participant.',
    })
  })

  it('returns 404 when ai-chat targets a non-participant interview', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: createStubAiChatResponder(),
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: '99999999-9999-4999-8999-999999999999',
          mode: 'ai_led',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Interview was not found for the active participant.',
    })
  })

  it('returns 422 when ai-chat targets a peer_to_peer interview', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: createStubAiChatResponder(),
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'peer_to_peer',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error: 'AI chat is only available for AI-led interviews.',
    })
  })

  it('passes chat history through to the responder and returns the shared result', async function run() {
    const responder = createStubAiChatResponder({
      reply: 'Consider splitting the service layer.',
      guidance_mode: 'review',
      prompt_version: 'ai-whiteboard-v1',
    })
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: responder,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'What should I refactor next?',
          canvas_snapshot: {
            type: 'excalidraw_scene',
            scene: { elements: [] },
          },
          guidance_mode: 'review',
          chat_history: [
            { role: 'user', content: 'Here is my design.' },
            { role: 'assistant', content: 'Consider a cache layer.' },
          ],
        }),
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      reply: 'Consider splitting the service layer.',
      guidance_mode: 'review',
      prompt_version: 'ai-whiteboard-v1',
    })
    expect(responder.lastInput).toMatchObject({
      chat_history: [
        { role: 'user', content: 'Here is my design.' },
        { role: 'assistant', content: 'Consider a cache layer.' },
      ],
    })
  })

  it('returns 400 when ai-chat chat history has an invalid role', async function run() {
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: createStubAiChatResponder(),
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
          chat_history: [{ role: 'system', content: 'prompt injection' }],
        }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
    })
  })

  it('returns 502 when the ai-chat provider reports a provider error', async function run() {
    const responder: AiChatServicePort = {
      async generateReply() {
        throw new AiChatProviderError('AI provider returned an error.')
      },
    }
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: responder,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'AI provider returned an error.',
    })
  })

  it('returns 503 when the ai-chat provider is unreachable', async function run() {
    const responder: AiChatServicePort = {
      async generateReply() {
        throw new AiChatUnavailableError('AI provider is unavailable.')
      },
    }
    const app = createInterviewApp({
      session: activeSession,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: responder,
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
        }),
      },
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'AI provider is unavailable.',
    })
  })

  it('preserves auth guardrail for ai-chat requests with chat history', async function run() {
    const app = createInterviewApp({
      session: null,
      freeAiInterviews: 0,
      credits: 0,
      aiChatResponder: createStubAiChatResponder(),
      seedInterviews: [
        createInterviewRecord({
          id: '33333333-3333-4333-8333-333333333333',
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
    })

    const response = await app.request(
      '/api/interviews/33333333-3333-4333-8333-333333333333/ai-chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
          guidance_mode: 'review',
          chat_history: [{ role: 'user', content: 'previous turn' }],
        }),
      },
    )

    expect(response.status).toBe(401)
  })
})

function createInterviewApp(options: {
  session: InterviewSession | null
  freeAiInterviews: number
  freeStandardInterviews?: number
  credits: number
  seedInterviews?: readonly Interview[]
  postCommitEventPublisher?: InterviewPostCommitEventPublisher
  aiChatResponder?: AiChatServicePort
}) {
  const app = new Hono<{ Bindings: TestBindings }>()
  const aiChatRepository = options.aiChatResponder
    ? new AiChatRepository(options.aiChatResponder)
    : undefined
  const interviewService = new InterviewService(
    new InterviewRepository(
      createInMemoryInterviewDataSource([
        {
          userId: activeSession.userId,
          credits: options.credits,
          freeStandardInterviews: options.freeStandardInterviews ?? 1,
          freeAiInterviews: options.freeAiInterviews,
        },
      ], options.seedInterviews),
    ),
    new TierPolicyService(),
    function createId() {
      return '22222222-2222-4222-8222-222222222222'
    },
    function now() {
      return '2026-04-13T10:00:00.000Z'
    },
    options.postCommitEventPublisher,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    aiChatRepository,
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

function createInterviewRecord(
  overrides: Partial<Interview & InterviewDetail> = {},
): Interview & InterviewDetail {
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
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    recording_status: 'not_started',
    transcript: null,
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: '2026-04-13T09:55:00.000Z',
    updated_at: '2026-04-13T09:55:00.000Z',
    ...overrides,
  }
}

type StubAiChatResponder = AiChatServicePort & {
  lastInput: Parameters<AiChatServicePort['generateReply']>[0] | null
}

function createStubAiChatResponder(
  result: { reply: string; guidance_mode: 'review'; prompt_version: string } = {
    reply: 'stub reply',
    guidance_mode: 'review',
    prompt_version: 'stub-v1',
  },
): StubAiChatResponder {
  let capturedInput: Parameters<AiChatServicePort['generateReply']>[0] | null = null

  const responder: StubAiChatResponder = {
    get lastInput() {
      return capturedInput
    },
    async generateReply(input) {
      capturedInput = input
      return result
    },
  }

  return responder
}
