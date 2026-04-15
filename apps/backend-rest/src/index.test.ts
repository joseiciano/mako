import { describe, expect, it } from 'vitest'
import { createApp } from './index'

describe('backend-rest smoke tests', function () {
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
    expect(dbBinding.executedStatements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('FROM users'),
        expect.stringContaining('BEGIN;'),
        expect.stringContaining('INSERT INTO interviews'),
      ]),
    )
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
})

function createInterview(
  app: ReturnType<typeof createApp>,
  payload: {
    type?: 'system_design' | 'coding' | 'behavioral'
    scheduled_at?: string
  } = {},
  env: { DB?: ReturnType<typeof createDatabaseBinding> } = {},
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

function getAccount(
  app: ReturnType<typeof createApp>,
  env: { DB?: ReturnType<typeof createDatabaseBinding> } = {},
) {
  return app.request('/api/account', {}, env)
}

function createDatabaseBinding(accountState: {
  credits: number
  freeAiInterviews: number
}) {
  const executedStatements: string[] = []

  return {
    executedStatements,
    async query(statementText: string, ...statementValues: readonly unknown[]) {
      executedStatements.push(statementText)

      if (
        statementText.includes('FROM users') &&
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
        statementText.includes('FROM users') &&
        statementText.includes('SELECT credits, free_ai_interviews') &&
        statementText.includes('LIMIT 1')
      ) {
        return {
          rows: [
            {
              credits: accountState.credits,
              free_ai_interviews: accountState.freeAiInterviews,
            },
          ],
        }
      }

      if (statementText.includes('BEGIN;') || statementText.includes('COMMIT;')) {
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

      if (statementText.includes('SET credits = credits - 1')) {
        if (accountState.credits <= 0) {
          return { rows: [] }
        }

        accountState.credits -= 1
        return {
          rows: [{ id: '11111111-1111-4111-8111-111111111111' }],
        }
      }

      if (statementText.includes('INSERT INTO interviews')) {
        return {
          rows: [
            {
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
              created_at: statementValues[10],
              updated_at: statementValues[11],
            },
          ],
        }
      }

      throw new Error(`Unhandled DB statement: ${statementText}`)
    },
  }
}
