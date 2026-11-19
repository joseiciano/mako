import { createHmac } from 'node:crypto'
import { findCreditPackage } from '@mako/shared-backend'
import { jsonResponse } from '../http.ts'

const SEND_PATH = '/stripe/payment-succeeded'
const BACKEND_WEBHOOK_PATH = '/api/payments/webhook'
const DEFAULT_WEBHOOK_SECRET = 'whsec_placeholder'
const DEFAULT_BACKEND_URL = 'http://workers:8787'

type SendRequest = { payment_intent_id?: unknown; package_id?: unknown; user_id?: unknown }

/** Stripe signing scheme: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<payload>">`. */
export const signStripePayload = (payload: string, secret: string, timestamp: number): string => {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return `t=${timestamp},v1=${digest}`
}

export const buildPaymentSucceededEvent = (input: {
  paymentIntentId: string
  packageId: string
  userId: string
  amountCents: number
}) => ({
  id: `evt_fake_${crypto.randomUUID().replaceAll('-', '')}`,
  object: 'event',
  api_version: '2025-01-27.acacia',
  created: Math.floor(Date.now() / 1000),
  livemode: false,
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: input.paymentIntentId,
      object: 'payment_intent',
      amount: input.amountCents,
      amount_received: input.amountCents,
      currency: 'usd',
      status: 'succeeded',
      metadata: { package_id: input.packageId, user_id: input.userId },
    },
  },
})

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

/**
 * POST /stripe/payment-succeeded builds a `payment_intent.succeeded` event for
 * the given payment intent, signs it with the local webhook secret and posts it
 * to the backend webhook route, returning the backend's answer.
 */
export const handleStripeWebhook = async (request: Request, path: string): Promise<Response | null> => {
  if (request.method !== 'POST' || path !== SEND_PATH) return null

  const body = (await request.json().catch(() => ({}))) as SendRequest
  const pkg = isNonEmptyString(body.package_id) ? findCreditPackage(body.package_id) : undefined

  if (!isNonEmptyString(body.payment_intent_id) || !isNonEmptyString(body.user_id) || !pkg) {
    return jsonResponse(
      { error: 'payment_intent_id, user_id and a known package_id are required.' },
      400,
    )
  }

  const payload = JSON.stringify(
    buildPaymentSucceededEvent({
      paymentIntentId: body.payment_intent_id,
      packageId: pkg.package_id,
      userId: body.user_id,
      amountCents: pkg.amount_cents,
    }),
  )
  const secret = process.env.STRIPE_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET
  const backendUrl = (process.env.FAKES_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, '')
  const backendResponse = await fetch(`${backendUrl}${BACKEND_WEBHOOK_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signStripePayload(payload, secret, Math.floor(Date.now() / 1000)),
    },
    body: payload,
  })

  return jsonResponse(
    { backend_status: backendResponse.status, backend_body: await backendResponse.text() },
    backendResponse.ok ? 200 : 502,
  )
}
