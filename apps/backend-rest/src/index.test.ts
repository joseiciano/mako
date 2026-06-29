import * as sharedBackend from '@mako/shared-backend'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, type WorkerBindings } from './index'

describe('backend-rest smoke tests', function () {
  afterEach(function restoreMocks() {
    vi.restoreAllMocks()
  })

  it('returns health response', async function () {
    const app = createApp()
    const response = await app.request('/health')

    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      status: string
      service: string
      timestamp: string
    }

    expect(body).toMatchObject({
      status: 'ok',
      service: 'backend-rest',
    })
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date')
  })

  it('returns root response', async function () {
    const app = createApp()
    const response = await app.request('/')

    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      message: string
      runtime: string
    }

    expect(body).toEqual({
      message: 'Mako backend API is running.',
      runtime: 'cloudflare-workers',
    })
  })

  it('mounts Better Auth routes and returns 503 when auth runtime env is missing', async function () {
    const app = createApp()
    const response = await app.request('/api/auth/get-session')

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error:
        'Better Auth is not configured. Set HYPERDRIVE and BETTER_AUTH_SECRET.',
    })
  })

  it('returns CORS preflight headers for configured frontend origins', async function () {
    const app = createApp()
    const response = await app.request(
      '/api/auth/sign-up/email',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://mako-frontend.icianojn.workers.dev',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      },
      {
        BETTER_AUTH_TRUSTED_ORIGINS:
          'https://mako-frontend.icianojn.workers.dev',
      },
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://mako-frontend.icianojn.workers.dev',
    )
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'content-type',
    )
  })

  it('adds CORS headers to API responses for configured frontend origins', async function () {
    const app = createApp()
    const response = await app.request(
      '/api/auth/get-session',
      {
        headers: {
          origin: 'https://mako-frontend.icianojn.workers.dev',
        },
      },
      {
        BETTER_AUTH_TRUSTED_ORIGINS:
          'https://mako-frontend.icianojn.workers.dev',
      },
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://mako-frontend.icianojn.workers.dev',
    )
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('fails closed when Hyperdrive is configured but Better Auth is unavailable', async function () {
    const app = createApp()
    const postgresConnectionSpy = vi.spyOn(
      sharedBackend,
      'createPostgresConnectionPool',
    )
    const hyperdriveEnv: WorkerBindings = {
      HYPERDRIVE: {
        connectionString: 'postgres://hyperdrive.local/mako',
      },
    }

    const accountResponse = await getAccount(app, hyperdriveEnv)

    expect(accountResponse.status).toBe(401)
    await expect(accountResponse.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })

    const interviewResponse = await createInterview(app, {}, hyperdriveEnv)

    expect(interviewResponse.status).toBe(401)
    await expect(interviewResponse.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })

    expect(postgresConnectionSpy).not.toHaveBeenCalled()
  })

  it('creates AI-led interviews in demo mode without a DB binding', async function () {
    const app = createApp()

    const response = await createInterview(app)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      interview: {
        scheduler_id: '11111111-1111-4111-8111-111111111111',
        mode: 'ai_led',
        tier: 'standard',
      },
    })
  })

  it('falls back to credits after demo free AI quota is consumed', async function () {
    const app = createApp()

    const firstResponse = await createInterview(app)
    expect(firstResponse.status).toBe(201)

    const secondResponse = await createInterview(app, {
      type: 'coding',
      scheduled_at: '2026-05-01T15:00:00.000Z',
    })

    expect(secondResponse.status).toBe(201)
    await expect(secondResponse.json()).resolves.toMatchObject({
      interview: {
        type: 'coding',
        tier: 'premium',
        scheduled_at: '2026-05-01T15:00:00.000Z',
      },
    })
  })

  it('lists and cancels interviews in demo mode through the registered interview controller', async function () {
    const app = createApp()

    const createResponse = await createInterview(app)
    expect(createResponse.status).toBe(201)

    const createdInterview = (await createResponse.json()) as {
      interview: { id: string }
    }

    const scheduledListResponse = await listInterviews(app, {
      status: 'scheduled',
    })

    expect(scheduledListResponse.status).toBe(200)
    await expect(scheduledListResponse.json()).resolves.toEqual({
      interviews: [
        expect.objectContaining({
          id: createdInterview.interview.id,
          status: 'scheduled',
        }),
      ],
    })

    const cancelResponse = await cancelInterview(app, createdInterview.interview.id)

    expect(cancelResponse.status).toBe(200)
    await expect(cancelResponse.json()).resolves.toEqual({
      success: true,
    })

    const cancelledListResponse = await listInterviews(app, {
      status: 'cancelled',
    })

    expect(cancelledListResponse.status).toBe(200)
    await expect(cancelledListResponse.json()).resolves.toEqual({
      interviews: [
        expect.objectContaining({
          id: createdInterview.interview.id,
          status: 'cancelled',
        }),
      ],
    })
  })

  it('provisions stable interview credentials in demo mode through registered route', async function () {
    const app = createApp()
    const createResponse = await createInterview(app)
    expect(createResponse.status).toBe(201)
    const createdInterview = (await createResponse.json()) as {
      interview: { id: string }
    }

    const firstProvisionResponse = await provisionInterview(app, createdInterview.interview.id)
    const secondProvisionResponse = await provisionInterview(app, createdInterview.interview.id)

    expect(firstProvisionResponse.status).toBe(200)
    expect(secondProvisionResponse.status).toBe(200)
    const firstBody = (await firstProvisionResponse.json()) as {
      realtime: { realtime_session_id: string; token: string }
      excalidraw: { excalidraw_room_id: string; excalidraw_key: string }
    }
    const secondBody = (await secondProvisionResponse.json()) as typeof firstBody
    expect(firstBody.realtime.realtime_session_id).toBe(secondBody.realtime.realtime_session_id)
    expect(firstBody.excalidraw).toEqual(secondBody.excalidraw)
    expect(firstBody.realtime.token).toMatch(/^realtime_token_/)
  })

  it('provisions stable credentials through DB-backed route with idempotent retry', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({ credits: 1, freeAiInterviews: 0 })
    const realtimeEnv: WorkerBindings = {
      DB: dbBinding,
      CLOUDFLARE_ACCOUNT_ID: 'account-1',
      CLOUDFLARE_API_TOKEN: 'api-token-1',
      CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-1',
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: 'meeting-db-1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { token: 'participant-token-1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { token: 'participant-token-2' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

    const createResponse = await createInterview(app, {}, realtimeEnv)
    expect(createResponse.status).toBe(201)
    const createdInterview = (await createResponse.json()) as {
      interview: { id: string }
    }

    const firstResponse = await provisionInterview(app, createdInterview.interview.id, realtimeEnv)
    const secondResponse = await provisionInterview(app, createdInterview.interview.id, realtimeEnv)

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    const firstBody = (await firstResponse.json()) as {
      realtime: { realtime_session_id: string; token: string }
      excalidraw: { excalidraw_room_id: string; excalidraw_key: string }
    }
    const secondBody = (await secondResponse.json()) as typeof firstBody
    expect(secondBody.realtime.realtime_session_id).toBe(firstBody.realtime.realtime_session_id)
    expect(secondBody.excalidraw).toEqual(firstBody.excalidraw)
    expect(firstBody.realtime.token).toBe('participant-token-1')
    expect(secondBody.realtime.token).toBe('participant-token-2')
  })

  it('does not mutate interview status during DB-backed provisioning', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({ credits: 1, freeAiInterviews: 0 })
    const realtimeEnv: WorkerBindings = {
      DB: dbBinding,
      CLOUDFLARE_ACCOUNT_ID: 'account-1',
      CLOUDFLARE_API_TOKEN: 'api-token-1',
      CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-1',
    }
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: 'meeting-db-1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { token: 'participant-token-1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

    const createResponse = await createInterview(app, {}, realtimeEnv)
    expect(createResponse.status).toBe(201)
    const createdInterview = (await createResponse.json()) as {
      interview: { id: string }
    }

    const provisionResponse = await provisionInterview(app, createdInterview.interview.id, realtimeEnv)
    expect(provisionResponse.status).toBe(200)

    const statusUpdateStatements = dbBinding.executedStatements.filter(function isStatusUpdate(stmt) {
      return stmt.includes('UPDATE interviews') && stmt.includes('SET status')
    })
    expect(statusUpdateStatements).toHaveLength(0)
  })

  it('rejects provisioning for cancelled interviews with 409', async function () {
    const app = createApp()

    const createResponse = await createInterview(app)
    expect(createResponse.status).toBe(201)
    const createdInterview = (await createResponse.json()) as {
      interview: { id: string }
    }

    const cancelResponse = await cancelInterview(app, createdInterview.interview.id)
    expect(cancelResponse.status).toBe(200)

    const provisionResponse = await provisionInterview(app, createdInterview.interview.id)
    expect(provisionResponse.status).toBe(409)
  })

  it('returns 404 when provisioning a non-existent interview', async function () {
    const app = createApp()

    const response = await provisionInterview(app, '00000000-0000-4000-8000-000000000000')
    expect(response.status).toBe(404)
  })

  it('provisions DB-backed interviews with RealtimeKit credentials', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({ credits: 1, freeAiInterviews: 0 })
    const realtimeEnv: WorkerBindings = {
      DB: dbBinding,
      CLOUDFLARE_ACCOUNT_ID: 'account-1',
      CLOUDFLARE_API_TOKEN: 'api-token-1',
      CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-1',
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: 'meeting-db-1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { token: 'participant-token-1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

    const createResponse = await createInterview(app, { type: 'coding' }, realtimeEnv)
    expect(createResponse.status).toBe(201)
    const createdPayload = (await createResponse.json()) as { interview: { id: string } }

    const provisionResponse = await provisionInterview(
      app,
      createdPayload.interview.id,
      realtimeEnv,
    )

    expect(provisionResponse.status).toBe(200)
    await expect(provisionResponse.json()).resolves.toMatchObject({
      realtime: {
        realtime_session_id: 'meeting-db-1',
        token: 'participant-token-1',
      },
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account-1/realtime/kit/app-1/meetings',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account-1/realtime/kit/app-1/meetings/meeting-db-1/participants',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('fails closed for DB-backed provision when RealtimeKit config is missing', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({ credits: 1, freeAiInterviews: 0 })
    const dbEnv: WorkerBindings = { DB: dbBinding }

    const createResponse = await createInterview(app, { type: 'coding' }, dbEnv)
    expect(createResponse.status).toBe(201)
    const createdPayload = (await createResponse.json()) as { interview: { id: string } }

    const provisionResponse = await provisionInterview(app, createdPayload.interview.id, dbEnv)

    expect(provisionResponse.status).toBe(500)
    await expect(provisionResponse.json()).resolves.toEqual({
      error: 'Unexpected interview error.',
    })
  })

  it('sorts demo interview list by instant across offsets and strips private fields', async function () {
    const app = createApp()

    const laterResponse = await createInterview(app, {
      scheduled_at: '2026-05-01T10:00:00-05:00',
    })
    expect(laterResponse.status).toBe(201)
    const laterInterview = (await laterResponse.json()) as {
      interview: { id: string }
    }

    const earlierResponse = await createInterview(app, {
      scheduled_at: '2026-05-01T14:00:00.000Z',
    })
    expect(earlierResponse.status).toBe(201)
    const earlierInterview = (await earlierResponse.json()) as {
      interview: { id: string }
    }

    const listResponse = await listInterviews(app)
    expect(listResponse.status).toBe(200)

    const body = (await listResponse.json()) as {
      interviews: Array<Record<string, unknown>>
    }

    expect(body.interviews.map((interview) => interview.id)).toEqual([
      earlierInterview.interview.id,
      laterInterview.interview.id,
    ])

    expect(body.interviews[0]).not.toHaveProperty('realtime_session_id')
    expect(body.interviews[0]).not.toHaveProperty('excalidraw_room_id')
    expect(body.interviews[0]).not.toHaveProperty('excalidraw_key')
    expect(body.interviews[0]).not.toHaveProperty('recording_url')
    expect(body.interviews[0]).not.toHaveProperty('screenshot_urls')
    expect(body.interviews[0]).not.toHaveProperty('feedback')
  })

  it('keeps demo account balances in sync after interview creation', async function () {
    const app = createApp()

    await createInterview(app)
    await createInterview(app, {
      type: 'coding',
    })

    const accountResponse = await getAccount(app)

    expect(accountResponse.status).toBe(200)
    await expect(accountResponse.json()).resolves.toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      credits: 7,
      freeAiInterviews: 0,
    })
  })

  it('uses database-backed account and interview stores when DB is configured', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({
      credits: 1,
      freeAiInterviews: 0,
    })

    const accountResponse = await getAccount(app, {
      DB: dbBinding,
    })

    expect(accountResponse.status).toBe(200)
    await expect(accountResponse.json()).resolves.toMatchObject({
      email: 'db-candidate@mako.dev',
      credits: 1,
      freeAiInterviews: 0,
    })

    const interviewResponse = await createInterview(
      app,
      {
        type: 'coding',
      },
      {
        DB: dbBinding,
      },
    )

    expect(interviewResponse.status).toBe(201)
    await expect(interviewResponse.json()).resolves.toMatchObject({
      interview: {
        tier: 'premium',
      },
    })

    const listResponse = await listInterviews(
      app,
      {
        status: 'scheduled',
      },
      {
        DB: dbBinding,
      },
    )

    expect(listResponse.status).toBe(200)
    const listedPayload = (await listResponse.json()) as {
      interviews: Array<{ id: string }>
    }
    expect(listedPayload.interviews).toHaveLength(1)

    const cancelResponse = await cancelInterview(
      app,
      listedPayload.interviews[0]?.id ?? '',
      {
        DB: dbBinding,
      },
    )

    expect(cancelResponse.status).toBe(200)
    await expect(cancelResponse.json()).resolves.toEqual({
      success: true,
    })

    expect(dbBinding.executedStatements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('FROM "user"'),
        expect.stringContaining('BEGIN;'),
        expect.stringContaining('INSERT INTO interviews'),
        expect.stringContaining('participant_interviews'),
        expect.stringContaining('FOR UPDATE'),
      ]),
    )
  })

  it('emits one queue message after outbox insert on successful DB-backed create', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({ credits: 1, freeAiInterviews: 0 })
    const trackingQueue = createTrackingQueue()

    const response = await createInterview(
      app,
      { type: 'coding' },
      { DB: dbBinding, NOTIFICATION_QUEUE: trackingQueue },
    )

    expect(response.status).toBe(201)
    expect(trackingQueue.messages).toHaveLength(1)

    const queueMessage = trackingQueue.messages[0] as { event_type: string }
    expect(queueMessage.event_type).toBe('interview.created')

    const outboxInsertIndex = dbBinding.executedStatements.findIndex((s) =>
      s.includes('INSERT INTO notification_outbox_events'),
    )
    const commitIndex = dbBinding.executedStatements.findIndex((s) =>
      s.includes('COMMIT;'),
    )
    expect(outboxInsertIndex).toBeGreaterThan(-1)
    expect(commitIndex).toBeGreaterThan(-1)
    expect(outboxInsertIndex).toBeLessThan(commitIndex)
  })

  it('emits one queue message after outbox insert on successful DB-backed cancel', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({ credits: 1, freeAiInterviews: 0 })
    const trackingQueue = createTrackingQueue()

    const createResponse = await createInterview(
      app,
      { type: 'coding' },
      { DB: dbBinding, NOTIFICATION_QUEUE: trackingQueue },
    )
    expect(createResponse.status).toBe(201)

    const createdPayload = (await createResponse.json()) as {
      interview: { id: string }
    }

    const cancelResponse = await cancelInterview(
      app,
      createdPayload.interview.id,
      { DB: dbBinding, NOTIFICATION_QUEUE: trackingQueue },
    )
    expect(cancelResponse.status).toBe(200)

    expect(trackingQueue.messages).toHaveLength(2)
    expect((trackingQueue.messages[0] as { event_type: string }).event_type).toBe(
      'interview.created',
    )
    expect((trackingQueue.messages[1] as { event_type: string }).event_type).toBe(
      'interview.cancelled',
    )

    const outboxInserts = dbBinding.executedStatements.filter((s) =>
      s.includes('INSERT INTO notification_outbox_events'),
    )
    expect(outboxInserts).toHaveLength(2)
  })

  it('returns success and logs error when DB-backed queue send fails after commit', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({ credits: 1, freeAiInterviews: 0 })
    const failingQueue = createFailingQueue()
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const response = await createInterview(
      app,
      { type: 'coding' },
      { DB: dbBinding, NOTIFICATION_QUEUE: failingQueue },
    )

    expect(response.status).toBe(201)
    expect(consoleErrorSpy).toHaveBeenCalled()

    const dispatchFailureCall = consoleErrorSpy.mock.calls.find((call) =>
      String(call[0]).includes('notification.dispatch_failure'),
    )
    expect(dispatchFailureCall).toBeDefined()

    const outboxEvent = Array.from(dbBinding.outboxEvents.values())[0]
    expect(outboxEvent).toBeDefined()
    expect(outboxEvent.status).toBe('failed')
    expect(outboxEvent.dispatch_attempts).toBe(1)

    consoleErrorSpy.mockRestore()
  })

  it('does not duplicate queue sends on DB-backed create and cancel', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({ credits: 1, freeAiInterviews: 0 })
    const trackingQueue = createTrackingQueue()

    const createResponse = await createInterview(
      app,
      { type: 'coding' },
      { DB: dbBinding, NOTIFICATION_QUEUE: trackingQueue },
    )
    expect(createResponse.status).toBe(201)

    const createdPayload = (await createResponse.json()) as {
      interview: { id: string }
    }

    const cancelResponse = await cancelInterview(
      app,
      createdPayload.interview.id,
      { DB: dbBinding, NOTIFICATION_QUEUE: trackingQueue },
    )
    expect(cancelResponse.status).toBe(200)

    expect(trackingQueue.messages).toHaveLength(2)
    expect((trackingQueue.messages[0] as { event_type: string }).event_type).toBe(
      'interview.created',
    )
    expect((trackingQueue.messages[1] as { event_type: string }).event_type).toBe(
      'interview.cancelled',
    )
  })

  it('uses Hyperdrive-backed account and interview stores when HYPERDRIVE is configured', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({
      credits: 1,
      freeAiInterviews: 0,
    })

    vi.spyOn(sharedBackend, 'createPostgresConnectionPool').mockReturnValue(
      createHyperdrivePool(dbBinding) as ReturnType<
        typeof sharedBackend.createPostgresConnectionPool
      >,
    )
    vi.spyOn(sharedBackend, 'createBetterAuth').mockReturnValue({
      handler: vi.fn(),
      api: {
        async getSession() {
          return {
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'db-candidate@mako.dev',
            },
            session: {
              id: 'session-1',
            },
          }
        },
      },
    })

    const hyperdriveEnv: WorkerBindings = {
      HYPERDRIVE: {
        connectionString: 'postgres://hyperdrive.local/mako',
      },
      BETTER_AUTH_SECRET: 'test-secret',
    }

    const accountResponse = await getAccount(app, hyperdriveEnv)

    expect(accountResponse.status).toBe(200)
    await expect(accountResponse.json()).resolves.toMatchObject({
      email: 'db-candidate@mako.dev',
      credits: 1,
      freeAiInterviews: 0,
    })

    const interviewResponse = await createInterview(
      app,
      {
        type: 'coding',
      },
      hyperdriveEnv,
    )

    expect(interviewResponse.status).toBe(201)
    await expect(interviewResponse.json()).resolves.toMatchObject({
      interview: {
        tier: 'premium',
      },
    })
  })

  it('rejects demo creates after free AI quota and credits are exhausted', async function () {
    const app = createApp()

    for (let requestIndex = 0; requestIndex < 9; requestIndex += 1) {
      const response = await createInterview(app, {
        type: requestIndex % 2 === 0 ? 'system_design' : 'behavioral',
      })

      expect(response.status).toBe(201)
    }

    const exhaustedResponse = await createInterview(app)

    expect(exhaustedResponse.status).toBe(422)
    await expect(exhaustedResponse.json()).resolves.toEqual({
      error:
        'AI-led interview creation requires remaining free AI interviews or credits.',
    })
  })

  it('logs post-commit publish failures without failing the HTTP response', async function () {
    const app = createApp()
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const failingQueue = {
      async send() {
        throw new Error('Queue send failed')
      },
    } as unknown as Queue

    const response = await createInterview(
      app,
      {},
      {
        NOTIFICATION_QUEUE: failingQueue,
      },
    )

    expect(response.status).toBe(201)
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('creates availability in demo mode without a DB binding', async function () {
    const app = createApp()

    const response = await createAvailability(app)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      request: {
        user_id: '11111111-1111-4111-8111-111111111111',
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

  it('returns 401 for availability without auth when Hyperdrive is configured but Better Auth unavailable', async function () {
    const app = createApp()
    const hyperdriveEnv: WorkerBindings = {
      HYPERDRIVE: {
        connectionString: 'postgres://hyperdrive.local/mako',
      },
    }

    const response = await createAvailability(app, {}, hyperdriveEnv)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'You must be authenticated to access this resource.',
    })
  })

  it('uses Hyperdrive-backed availability stores when HYPERDRIVE is configured', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({
      credits: 1,
      freeAiInterviews: 0,
    })

    vi.spyOn(sharedBackend, 'createPostgresConnectionPool').mockReturnValue(
      createHyperdrivePool(dbBinding) as ReturnType<
        typeof sharedBackend.createPostgresConnectionPool
      >,
    )
    vi.spyOn(sharedBackend, 'createBetterAuth').mockReturnValue({
      handler: vi.fn(),
      api: {
        async getSession() {
          return {
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'db-candidate@mako.dev',
            },
            session: {
              id: 'session-1',
            },
          }
        },
      },
    })

    const hyperdriveEnv: WorkerBindings = {
      HYPERDRIVE: {
        connectionString: 'postgres://hyperdrive.local/mako',
      },
      BETTER_AUTH_SECRET: 'test-secret',
    }

    const response = await createAvailability(app, {}, hyperdriveEnv)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      request: {
        user_id: '11111111-1111-4111-8111-111111111111',
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

    expect(dbBinding.executedStatements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('INSERT INTO availability_requests'),
        expect.stringContaining('INSERT INTO availability_slots'),
      ]),
    )

    const interviewInserts = dbBinding.executedStatements.filter((s) =>
      s.includes('INSERT INTO interviews'),
    )
    expect(interviewInserts).toHaveLength(0)
  })

  it('creates all requested availability slots through Hyperdrive-backed stores', async function () {
    const app = createApp()
    const dbBinding = createDatabaseBinding({
      credits: 1,
      freeAiInterviews: 0,
    })

    vi.spyOn(sharedBackend, 'createPostgresConnectionPool').mockReturnValue(
      createHyperdrivePool(dbBinding) as ReturnType<
        typeof sharedBackend.createPostgresConnectionPool
      >,
    )
    vi.spyOn(sharedBackend, 'createBetterAuth').mockReturnValue({
      handler: vi.fn(),
      api: {
        async getSession() {
          return {
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'db-candidate@mako.dev',
            },
            session: {
              id: 'session-1',
            },
          }
        },
      },
    })

    const hyperdriveEnv: WorkerBindings = {
      HYPERDRIVE: {
        connectionString: 'postgres://hyperdrive.local/mako',
      },
      BETTER_AUTH_SECRET: 'test-secret',
    }

    const response = await createAvailability(
      app,
      {
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
          {
            start_time: '2026-04-13T12:00:00.000Z',
            end_time: '2026-04-13T13:00:00.000Z',
          },
        ],
      },
      hyperdriveEnv,
    )

    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      slots: Array<{ start_time: string; end_time: string; status: string }>
    }

    expect(body.slots).toHaveLength(2)
    expect(body.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'available',
          start_time: '2026-04-13T10:00:00.000Z',
          end_time: '2026-04-13T11:00:00.000Z',
        }),
        expect.objectContaining({
          status: 'available',
          start_time: '2026-04-13T12:00:00.000Z',
          end_time: '2026-04-13T13:00:00.000Z',
        }),
      ]),
    )
  })
})

type TrackingQueue = Queue & {
  messages: unknown[]
}

function createInterview(
  app: ReturnType<typeof createApp>,
  payload: {
    type?: 'system_design' | 'coding' | 'behavioral'
    scheduled_at?: string
  } = {},
  env: Partial<WorkerBindings> = {},
) {
  return app.request('/api/interviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: payload.type ?? 'system_design',
      mode: 'ai_led',
      scheduled_at: payload.scheduled_at ?? 'now',
    }),
  }, env)
}

function createAvailability(
  app: ReturnType<typeof createApp>,
  payload: {
    interview_type?: 'system_design' | 'coding' | 'behavioral'
    max_matches?: number
    slots?: Array<{ start_time: string; end_time: string }>
  } = {},
  env: Partial<WorkerBindings> = {},
) {
  return app.request('/api/availability', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      interview_type: payload.interview_type ?? 'system_design',
      max_matches: payload.max_matches ?? 2,
      slots: payload.slots ?? [
        {
          start_time: '2026-04-13T10:00:00.000Z',
          end_time: '2026-04-13T11:00:00.000Z',
        },
      ],
    }),
  }, env)
}

function getAccount(
  app: ReturnType<typeof createApp>,
  env: Partial<WorkerBindings> = {},
) {
  return app.request('/api/account', {}, env)
}

function listInterviews(
  app: ReturnType<typeof createApp>,
  query: {
    status?: 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
    limit?: number
    offset?: number
  } = {},
  env: Partial<WorkerBindings> = {},
) {
  const searchParams = new URLSearchParams()

  if (query.status !== undefined) {
    searchParams.set('status', query.status)
  }

  if (query.limit !== undefined) {
    searchParams.set('limit', String(query.limit))
  }

  if (query.offset !== undefined) {
    searchParams.set('offset', String(query.offset))
  }

  const url = searchParams.size > 0
    ? `/api/interviews?${searchParams.toString()}`
    : '/api/interviews'

  return app.request(url, { method: 'GET' }, env)
}

function cancelInterview(
  app: ReturnType<typeof createApp>,
  interviewId: string,
  env: Partial<WorkerBindings> = {},
) {
  return app.request(`/api/interviews/${interviewId}/cancel`, { method: 'POST' }, env)
}

function provisionInterview(
  app: ReturnType<typeof createApp>,
  interviewId: string,
  env: Partial<WorkerBindings> = {},
) {
  return app.request(`/api/interviews/${interviewId}/provision`, { method: 'POST' }, env)
}

function createDatabaseBinding(accountState: {
  credits: number
  freeAiInterviews: number
}) {
  const executedStatements: string[] = []
  const interviewsById = new Map<string, Record<string, unknown>>()
  const outboxEvents = new Map<string, Record<string, unknown>>()

  const availabilityRequestsById = new Map<string, Record<string, unknown>>()
  const availabilitySlotsById = new Map<string, Record<string, unknown>>()

  return {
    executedStatements,
    outboxEvents,
    async query(statementText: string, ...statementValues: readonly unknown[]) {
      executedStatements.push(statementText)

      if (
        statementText.includes('FROM "user"') &&
        statementText.includes('name') &&
        statementText.includes('LIMIT 1')
      ) {
        return {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'db-candidate@mako.dev',
              name: 'DB Candidate',
              credits: accountState.credits,
              free_standard_interviews: 1,
              free_ai_interviews: accountState.freeAiInterviews,
              companies: false,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
              deleted_at: null,
            },
          ],
        }
      }

      if (
        statementText.includes('FROM "user"') &&
        statementText.includes('SELECT credits, free_standard_interviews, free_ai_interviews') &&
        statementText.includes('LIMIT 1')
      ) {
        return {
          rows: [
            {
              credits: accountState.credits,
              free_standard_interviews: 1,
              free_ai_interviews: accountState.freeAiInterviews,
            },
          ],
        }
      }

      if (statementText.includes('BEGIN;') || statementText.includes('COMMIT;')) {
        return { rows: [] }
      }

      if (statementText.includes('ROLLBACK;')) {
        return { rows: [] }
      }

      if (statementText.includes('SET free_ai_interviews = free_ai_interviews - 1')) {
        if (accountState.freeAiInterviews <= 0) {
          return { rows: [] }
        }

        accountState.freeAiInterviews -= 1
        return {
          rows: [{ id: '11111111-1111-4111-8111-111111111111' }],
        }
      }

      if (statementText.includes('SET credits = credits -')) {
        if (accountState.credits <= 0) {
          return { rows: [] }
        }

        accountState.credits -= 1
        return {
          rows: [{ id: '11111111-1111-4111-8111-111111111111', credits: accountState.credits }],
        }
      }

      if (statementText.includes('INSERT INTO interviews')) {
        const interviewRecord = {
          id: statementValues[0],
          scheduler_id: statementValues[1],
          scheduler_alias: statementValues[2],
          interviewer_id: statementValues[3],
          interviewer_alias: statementValues[4],
          type: statementValues[5],
          mode: statementValues[6],
          tier: statementValues[7],
          status: statementValues[8],
          scheduled_at: statementValues[9],
          realtime_session_id: null,
          excalidraw_room_id: null,
          excalidraw_key: null,
          recording_url: null,
          screenshot_urls: null,
          feedback: null,
          created_at: statementValues[10],
          updated_at: statementValues[11],
        }

        interviewsById.set(String(statementValues[0]), interviewRecord)

        return {
          rows: [interviewRecord],
        }
      }

      if (statementText.includes('participant_interviews')) {
        const participantUserId = String(statementValues[0])
        const hasStatusFilter = statementText.includes('AND status = $2')
        const status = hasStatusFilter ? String(statementValues[1]) : undefined
        const limit = Number(statementValues[hasStatusFilter ? 2 : 1])
        const offset = Number(statementValues[hasStatusFilter ? 3 : 2])

        return {
          rows: Array.from(interviewsById.values())
            .filter(function isParticipantInterview(interview) {
              return (
                interview.scheduler_id === participantUserId ||
                interview.interviewer_id === participantUserId
              )
            })
            .filter(function matchesStatus(interview) {
              return status === undefined ? true : interview.status === status
            })
            .sort(compareInterviewRecords)
            .slice(offset, offset + limit),
        }
      }

      if (statementText.includes('FROM interviews') && statementText.includes('FOR UPDATE')) {
        const interviewId = String(statementValues[0])
        const participantUserId = String(statementValues[1])
        const interview = interviewsById.get(interviewId)

        if (
          !interview ||
          (interview.scheduler_id !== participantUserId &&
            interview.interviewer_id !== participantUserId)
        ) {
          return { rows: [] }
        }

        return {
          rows: [interview],
        }
      }

      if (
        statementText.includes('UPDATE interviews') &&
        statementText.includes('realtime_session_id = COALESCE')
      ) {
        const interviewId = String(statementValues[0])
        const participantUserId = String(statementValues[1])
        const interview = interviewsById.get(interviewId)

        if (
          !interview ||
          (interview.scheduler_id !== participantUserId &&
            interview.interviewer_id !== participantUserId)
        ) {
          return { rows: [] }
        }

        const updatedInterview = {
          ...interview,
          realtime_session_id: interview.realtime_session_id ?? statementValues[2],
          excalidraw_room_id: interview.excalidraw_room_id ?? statementValues[3],
          excalidraw_key: interview.excalidraw_key ?? statementValues[4],
          updated_at: statementValues[5],
        }
        interviewsById.set(interviewId, updatedInterview)

        return { rows: [updatedInterview] }
      }

      if (statementText.includes("UPDATE interviews") && statementText.includes("status = 'cancelled'")) {
        const interviewId = String(statementValues[0])
        const interview = interviewsById.get(interviewId)

        if (!interview) {
          return { rows: [] }
        }

        const updatedInterview = {
          ...interview,
          status: 'cancelled',
          updated_at: statementValues[1],
        }

        interviewsById.set(interviewId, updatedInterview)

        return {
          rows: [updatedInterview],
        }
      }

      if (statementText.includes('INSERT INTO notification_outbox_events')) {
        const event = {
          idempotency_key: statementValues[0],
          event_type: statementValues[1],
          event_payload: JSON.parse(String(statementValues[2])),
          status: statementValues[3],
          dispatch_attempts: statementValues[4],
          last_dispatch_attempted_at: statementValues[5],
          created_at: statementValues[6],
          updated_at: statementValues[7],
        }
        outboxEvents.set(String(statementValues[0]), event)
        return { rows: [] }
      }

      if (
        statementText.includes('FROM notification_outbox_events') &&
        statementText.includes('idempotency_key = $1') &&
        statementText.includes('LIMIT 1')
      ) {
        const idempotencyKey = String(statementValues[0])
        const event = outboxEvents.get(idempotencyKey)
        return { rows: event ? [event] : [] }
      }

      if (
        statementText.includes('UPDATE notification_outbox_events') &&
        statementText.includes("status = 'dispatched'")
      ) {
        const idempotencyKey = String(statementValues[0])
        const event = outboxEvents.get(idempotencyKey)
        if (event) {
          event.status = 'dispatched'
        }
        return { rows: [] }
      }

      if (
        statementText.includes('UPDATE notification_outbox_events') &&
        statementText.includes("status = 'failed'")
      ) {
        const idempotencyKey = String(statementValues[0])
        const event = outboxEvents.get(idempotencyKey)
        if (event) {
          event.status = 'failed'
          event.dispatch_attempts = (event.dispatch_attempts as number) + 1
        }
        return { rows: [] }
      }

      if (
        statementText.includes('FROM interviews') &&
        statementText.includes('WHERE id = $1') &&
        statementText.includes('LIMIT 1') &&
        !statementText.includes('FOR UPDATE')
      ) {
        const interviewId = String(statementValues[0])
        const interview = interviewsById.get(interviewId)
        return {
          rows: interview ? [interview] : [],
        }
      }


      if (statementText.includes('INSERT INTO availability_requests')) {
        const requestRecord = {
          id: statementValues[0],
          user_id: statementValues[1],
          interview_type: statementValues[2],
          max_matches: statementValues[3],
          current_matches: statementValues[4],
          status: statementValues[5],
          created_at: statementValues[6],
          updated_at: statementValues[7],
        }

        availabilityRequestsById.set(String(statementValues[0]), requestRecord)

        return {
          rows: [requestRecord],
        }
      }

      if (statementText.includes('INSERT INTO availability_slots')) {
        const slotRecords: Array<Record<string, unknown>> = []

        for (let index = 0; index < statementValues.length; index += 7) {
          const slotRecord = {
            id: statementValues[index],
            request_id: statementValues[index + 1],
            start_time: statementValues[index + 2],
            end_time: statementValues[index + 3],
            status: statementValues[index + 4],
            created_at: statementValues[index + 5],
            updated_at: statementValues[index + 6],
          }

          availabilitySlotsById.set(String(statementValues[index]), slotRecord)
          slotRecords.push(slotRecord)
        }

        return {
          rows: slotRecords,
        }
      }
      throw new Error(`Unhandled DB statement: ${statementText}`)
    },
  }
}

function createTrackingQueue(): TrackingQueue {
  const messages: unknown[] = []
  return {
    messages,
    async send(message: unknown) {
      messages.push(message)
    },
  } as unknown as TrackingQueue
}

function createFailingQueue(errorMessage: string = 'Queue send failed') {
  return {
    async send() {
      throw new Error(errorMessage)
    },
  } as unknown as Queue
}

function createHyperdrivePool(dbBinding: ReturnType<typeof createDatabaseBinding>) {
  let activeTransactionClientId: string | null = null
  let clientCount = 0

  return {
    async query(statementText: string, statementValues: readonly unknown[] = []) {
      if (activeTransactionClientId) {
        throw new Error(
          `Expected transactional statement to stay on client ${activeTransactionClientId}: ${statementText}`,
        )
      }

      return dbBinding.query(statementText, ...statementValues)
    },
    async connect() {
      clientCount += 1
      const clientId = `client-${clientCount}`
      activeTransactionClientId = clientId

      return {
        async query(statementText: string, statementValues: readonly unknown[] = []) {
          if (activeTransactionClientId !== clientId) {
            throw new Error(`Inactive Hyperdrive client used for statement: ${statementText}`)
          }

          return dbBinding.query(statementText, ...statementValues)
        },
        release() {
          if (activeTransactionClientId === clientId) {
            activeTransactionClientId = null
          }
        },
      }
    },
    async end() {},
  }
}

function compareInterviewRecords(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): number {
  const leftScheduledAt = String(left.scheduled_at)
  const rightScheduledAt = String(right.scheduled_at)

  if (leftScheduledAt < rightScheduledAt) {
    return -1
  }

  if (leftScheduledAt > rightScheduledAt) {
    return 1
  }

  const leftId = String(left.id)
  const rightId = String(right.id)

  if (leftId < rightId) {
    return -1
  }

  if (leftId > rightId) {
    return 1
  }

  return 0
}
