import type { Hono } from 'hono'
import { RealtimeKitWebhookService } from './webhook-service'

type ControllerBindings = Record<string, unknown>

export type RealtimeKitWebhookControllerOptions<Bindings extends ControllerBindings> = {
  createService: (context: {
    bindings: Bindings
  }) => RealtimeKitWebhookService | undefined
}

// Provider webhook boundary: intentionally does NOT use browser-session
// authentication. Authenticity is established by the rtk-signature public-key
// verification performed inside the service before any side effects.
export function registerRealtimeKitWebhookController<
  Bindings extends ControllerBindings,
>(
  app: Hono<{ Bindings: Bindings }>,
  options: RealtimeKitWebhookControllerOptions<Bindings>,
): void {
  app.post('/api/webhooks/realtimekit', async function postRealtimeKitWebhookHandler(c) {
    const service = options.createService({ bindings: c.env })

    if (!service) {
      return c.json(
        { error: 'RealtimeKit webhooks are not configured.' },
        503,
      )
    }

    try {
      const rawBody = await c.req.arrayBuffer()

      const result = await service.handleWebhook({
        rawBody,
        signatureBase64: c.req.header('rtk-signature'),
        eventUuid: c.req.header('rtk-uuid'),
      })

      return c.body(null, result.httpStatus)
    } catch (error) {
      return c.json(
        { error: 'RealtimeKit webhook verification is unavailable.' },
        503,
      )
    }
  })
}
