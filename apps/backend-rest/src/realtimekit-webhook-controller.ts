import type { Context, Hono } from 'hono'
import { RealtimeKitWebhookRepository } from './realtimekit-webhook-repository'
import { RealtimeKitWebhookService } from './realtimekit-webhook-service'
import { RealtimeKitWebhookSignatureVerifier } from './realtimekit-webhook-signature'
import type { WorkerBindings } from './index'

export function registerRealtimeKitWebhookController(
  app: Hono<{ Bindings: WorkerBindings }>,
  verifierMap: Map<string, RealtimeKitWebhookSignatureVerifier>,
): void {
  const repository = new RealtimeKitWebhookRepository()
  const service = new RealtimeKitWebhookService(repository, function getVerifier(url: string) {
    let verifier = verifierMap.get(url)
    if (!verifier) {
      verifier = new RealtimeKitWebhookSignatureVerifier(url)
      verifierMap.set(url, verifier)
    }
    return verifier
  })

  app.post('/api/webhooks/realtimekit', async function handleWebhook(c: Context<{ Bindings: WorkerBindings }>) {
    const signature = c.req.header('rtk-signature')
    const uuid = c.req.header('rtk-uuid')

    if (!signature || signature.trim().length === 0 || !uuid || uuid.trim().length === 0) {
      return c.json({ error: 'missing signature or uuid' }, 400)
    }

    const trimmedSig = signature.trim()
    const trimmedUuid = uuid.trim()

    let rawBytes: Uint8Array
    try {
      const rawBuffer = await c.req.raw.arrayBuffer()
      rawBytes = new Uint8Array(rawBuffer)
    } catch {
      return c.json({ error: 'invalid body' }, 400)
    }

    // Quick base64 validation: if clearly invalid, return 401 without verifier
    // But let verifier handle it for proper 401 vs 503 distinction
    // However malformed base64 test expects 401 without DB – verifier returns invalid

    try {
      const result = await service.handle({
        rawBytes,
        signature: trimmedSig,
        uuid: trimmedUuid,
        bindings: c.env,
      })

      if (result.status === 200) {
        return c.json(result.body, 200)
      }
      if (result.status === 401) {
        return c.json({ error: 'unauthorized' }, 401)
      }
      if (result.status === 503) {
        return c.json({ error: 'service unavailable' }, 503)
      }
      if (result.status === 400) {
        return c.json({ error: 'bad request' }, 400)
      }
      return c.json(result.body, result.status as 200)
    } catch (error) {
      // Do not expose provider bodies
      return c.json({ error: 'internal error' }, 500)
    }
  })
}
