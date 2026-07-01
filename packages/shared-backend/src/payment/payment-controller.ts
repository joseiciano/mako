import {
  createPaymentIntentRequestSchema,
  createPaymentIntentResponseSchema,
  creditPackageListResponseSchema,
} from '@mako/shared'
import type { Context, Hono } from 'hono'
import { ZodError } from 'zod'
import type { PaymentService } from './payment-service'
import {
  PaymentPackageNotFoundError,
  PaymentUnauthorizedError,
  PaymentValidationError,
  PaymentWebhookSignatureError,
  type AccountSession,
} from './types'

type ControllerBindings = Record<string, unknown>

export type PaymentControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: { bindings: Bindings }) => PaymentService
  resolveSession: (
    context: Context<{ Bindings: Bindings }>,
  ) => Promise<AccountSession | null> | AccountSession | null
  getWebhookSecret: (bindings: Bindings) => string | undefined
}

export function registerPaymentController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: PaymentControllerOptions<Bindings>,
): void {
  app.get('/api/payments/packages', async function getPackagesHandler(c) {
    const session = await options.resolveSession(c)
    if (!session) {
      return c.json({ error: 'Authentication is required.' }, 401)
    }
    const paymentService = options.createService({ bindings: c.env })
    try {
      const packages = paymentService.listPackages()
      return c.json(creditPackageListResponseSchema.parse({ packages }), 200)
    } catch (error) {
      return toPaymentErrorResponse(c, error)
    }
  })

  app.post('/api/payments/create-intent', async function createIntentHandler(c) {
    const session = await options.resolveSession(c)
    if (!session) {
      return c.json({ error: 'Authentication is required.' }, 401)
    }
    const paymentService = options.createService({ bindings: c.env })
    const jsonBody = await readRequestBody(c)
    if (jsonBody === null) {
      return c.json({ error: 'Request body must be valid JSON.' }, 400)
    }
    try {
      const parsedBody = createPaymentIntentRequestSchema.parse(jsonBody)
      const result = await paymentService.createPaymentIntent(session, parsedBody.package_id)
      return c.json(createPaymentIntentResponseSchema.parse(result), 200)
    } catch (error) {
      return toPaymentErrorResponse(c, error)
    }
  })

  app.post('/api/payments/webhook', async function webhookHandler(c) {
    const paymentService = options.createService({ bindings: c.env })
    const signature = c.req.header('stripe-signature')
    if (!signature) {
      return c.json({ error: 'Missing stripe-signature header.' }, 400)
    }
    const webhookSecret = options.getWebhookSecret(c.env)
    if (!webhookSecret) {
      return c.json({ error: 'Webhook secret is not configured.' }, 500)
    }
    const rawBody = await c.req.raw.text()
    try {
      await paymentService.handleWebhook(rawBody, signature, webhookSecret)
      return c.json({ received: true }, 200)
    } catch (error) {
      return toPaymentErrorResponse(c, error)
    }
  })
}

async function readRequestBody(context: Context): Promise<unknown | null> {
  try {
    return await context.req.json()
  } catch {
    return null
  }
}

function toPaymentErrorResponse(context: Context, error: unknown) {
  if (isZodError(error)) {
    return context.json({ error: 'Invalid request payload', details: error.issues }, 400)
  }
  if (error instanceof PaymentUnauthorizedError) {
    return context.json({ error: error.message }, 401)
  }
  if (error instanceof PaymentPackageNotFoundError) {
    return context.json({ error: error.message }, 400)
  }
  if (error instanceof PaymentValidationError) {
    return context.json({ error: error.message }, 400)
  }
  if (error instanceof PaymentWebhookSignatureError) {
    return context.json({ error: error.message }, 400)
  }
  return context.json({ error: 'Unexpected payment error.' }, 500)
}

function isZodError(error: unknown): error is { issues: unknown[] } {
  if (error instanceof ZodError) {
    return true
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as Record<string, unknown>).issues)
  )
}
