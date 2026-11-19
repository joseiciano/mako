import { createStripeClient } from '@mako/shared-backend'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleRequest } from '../app.ts'
import { signStripePayload } from './stripe-webhook.ts'

const SECRET = 'whsec_test_secret'
const stripe = createStripeClient('sk_test_x')

const send = (body: unknown) =>
  handleRequest(
    new Request('http://fakes.test/stripe/payment-succeeded', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('FAKES_BACKEND_URL', 'http://backend.test')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('signed payment-success webhook', () => {
  it('posts an event the backend verifier accepts, with the learner and package in metadata', async () => {
    const sent: { url: string; signature: string; payload: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      sent.push({
        url,
        signature: (init.headers as Record<string, string>)['stripe-signature'],
        payload: init.body as string,
      })
      return new Response('{"received":true}', { status: 200 })
    })

    const response = await send({ payment_intent_id: 'pi_1', user_id: 'u1', package_id: 'credits_5' })

    expect(response.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('http://backend.test/api/payments/webhook')

    const event = await stripe.webhooks.constructEventAsync(sent[0].payload, sent[0].signature, SECRET)
    expect(event.type).toBe('payment_intent.succeeded')
    expect(event.data.object).toMatchObject({
      id: 'pi_1',
      amount_received: 2500,
      metadata: { package_id: 'credits_5', user_id: 'u1' },
    })
  })

  it('produces a signature the backend verifier rejects under another secret or a changed body', async () => {
    const payload = '{"id":"evt_1"}'
    const signature = signStripePayload(payload, SECRET, Math.floor(Date.now() / 1000))

    await expect(stripe.webhooks.constructEventAsync(payload, signature, 'whsec_other')).rejects.toThrow()
    await expect(stripe.webhooks.constructEventAsync(`${payload} `, signature, SECRET)).rejects.toThrow()
  })

  it('surfaces a backend rejection as 502', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":"bad"}', { status: 400 }))

    const response = await send({ payment_intent_id: 'pi_1', user_id: 'u1', package_id: 'credits_5' })

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ backend_status: 400 })
  })

  it('rejects a request without a known package or learner', async () => {
    vi.stubGlobal('fetch', vi.fn())

    expect((await send({ payment_intent_id: 'pi_1', user_id: 'u1', package_id: 'nope' })).status).toBe(400)
    expect((await send({ package_id: 'credits_5' })).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
})
