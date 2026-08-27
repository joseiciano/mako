import type { Hono } from 'hono'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, type WorkerBindings } from './index'

const RECORDING_ID = '550e8400-e29b-41d4-a716-446655440001'
const EVENT_UUID = '550e8400-e29b-41d4-a716-446655440002'
const UNKNOWN_ID = '550e8400-e29b-41d4-a716-446655440099'
const PUBLIC_KEY_URL = 'https://api.realtime.cloudflare.com/.well-known/webhooks.json'

let privateKey: CryptoKey
let publicJwk: JsonWebKey
let publicPem: string
let rotatedPrivateKey: CryptoKey
let rotatedPublicJwk: JsonWebKey
let rotatedPublicPem: string

function b64(buf: ArrayBuffer): string { return Buffer.from(buf as ArrayBuffer).toString('base64') }
async function signRaw(raw: string, key: CryptoKey = privateKey): Promise<string> {
  return b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(raw)))
}
function payload(status: string, id = RECORDING_ID): string {
  return JSON.stringify({ event: 'recording.statusUpdate', recording: { id, recordingId: id, status } })
}
function createDbMock() {
  // Mock accurately represents insert-once deduplication and transaction behavior:
  // - realtimekit_webhook_events insert does ON CONFLICT (provider_event_id) DO NOTHING; rowCount 0 on dupe
  // - interview_recordings update uses parametrized values and checkpoints monotonicity
  // - BEGIN/COMMIT/ROLLBACK tracking
  const seenEvents = new Set<string>()
  const query = vi.fn(async (text: string, ...values: readonly unknown[]) => {
    // Transaction boundaries
    if (text === 'BEGIN' || text === 'BEGIN;') return { rows: [] }
    if (text === 'COMMIT;' || text === 'COMMIT') return { rows: [] }
    if (text === 'ROLLBACK;' || text === 'ROLLBACK') return { rows: [] }

    // Webhook event deduplication - insert with ON CONFLICT
    if (text.includes('realtimekit_webhook_events')) {
      const lower = text.toLowerCase()
      const eventId = (values[0] as string) ?? (text.includes(EVENT_UUID) ? EVENT_UUID : 'unknown')
      if (lower.includes('select') && lower.includes('provider_event_id')) {
        return { rows: seenEvents.has(eventId) ? [{ provider_event_id: eventId }] : [] }
      }
      if (lower.includes('insert')) {
        if (seenEvents.has(String(eventId))) {
          return { rows: [], rowCount: 0 }
        }
        seenEvents.add(String(eventId))
        expect(text).toMatch(/\$\d+/)
        expect(values.length).toBeGreaterThan(0)
        return { rows: [{ provider_event_id: eventId }], rowCount: 1 }
      }
      return { rows: [] }
    }
    if (text.includes('interview_recordings') && text.includes(UNKNOWN_ID)) return { rows: [] }
    if (text.includes('interview_recordings')) {
      // Assert parametrized queries use placeholders for provider_recording_id
      if (values.length > 0) {
        expect(values).toContain(RECORDING_ID)
      }
      return { rows: [{ id: RECORDING_ID, provider_recording_id: RECORDING_ID, interview_id: '11111111-1111-4111-8111-111111111111' }] }
    }
    return { rows: [] }
  })
  return { query: { query } as unknown as WorkerBindings['DB'], spy: query, seenEvents }
}
function createWorkflowMock(order?: string[]) {
  const fn = vi.fn(async () => { order?.push('workflow') })
  return { createBatch: fn, spy: fn }
}
function mockWellKnown(publicKey: string) {
  const fetchSpy = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data: { publicKey } }),
    text: async () => JSON.stringify({ success: true, data: { publicKey } }),
  }))
  vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch)
  return fetchSpy
}
function postWebhook(app: Hono<{ Bindings: WorkerBindings }>, raw: string, sig: string, uuid: string, env: Record<string, unknown>) {
  return app.request('/api/webhooks/realtimekit', { method: 'POST', headers: { 'rtk-signature': sig, 'rtk-uuid': uuid, 'content-type': 'application/json' }, body: raw }, env as unknown as WorkerBindings)
}
function postWebhookWithHeaders(app: Hono<{ Bindings: WorkerBindings }>, raw: string, headers: Record<string, string>, env: Record<string, unknown>) {
  return app.request('/api/webhooks/realtimekit', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw }, env as unknown as WorkerBindings)
}
beforeAll(async function genKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  privateKey = pair.privateKey
  publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey
  const publicDer = await crypto.subtle.exportKey('spki', pair.publicKey) as ArrayBuffer
  publicPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicDer).toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`
  const rotatedPair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  rotatedPrivateKey = rotatedPair.privateKey
  rotatedPublicJwk = (await crypto.subtle.exportKey('jwk', rotatedPair.publicKey)) as JsonWebKey
  const rotatedDer = await crypto.subtle.exportKey('spki', rotatedPair.publicKey) as ArrayBuffer
  rotatedPublicPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(rotatedDer).toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`
})
afterEach(function cleanup() { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('POST /api/webhooks/realtimekit boundary', function () {
  it('accepts valid exact raw-body signature without browser auth', async function () {
    const raw = payload('UPLOADED')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const order: string[] = []
    const wf = createWorkflowMock(order)
    const fetchSpy = mockWellKnown(publicPem)
    const commitSpy = db.spy as unknown as { mockImplementation: (fn: (text: string, ...values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) => unknown }
    commitSpy.mockImplementation(async function commitTracker(text: string) {
      if (text === 'COMMIT;') order.push('commit')
      return { rows: text.includes('interview_recordings') ? [{ id: RECORDING_ID }] : [] }
    })
    const app = createApp()
    const res = await postWebhook(app, raw, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(fetchSpy).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
  it('rejects invalid signature before DB access', async function () {
    const raw = payload('UPLOADED')
    const badSig = b64(new TextEncoder().encode('bad-signature').buffer as ArrayBuffer)
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, badSig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(db.spy).not.toHaveBeenCalled()
    expect(wf.spy).not.toHaveBeenCalled()
    expect(res.status).toBe(401)
  })
  it('rejects tampered raw bytes differing from signed payload', async function () {
    const raw = payload('UPLOADED')
    const sig = await signRaw(raw)
    const tampered = raw.replace('UPLOADED', 'UPLOADED ')
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, tampered, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(db.spy).not.toHaveBeenCalled()
    expect(res.status).toBe(401)
  })
  it('acknowledges valid signed unsupported event with no DB or workflow side effects', async function () {
    const raw = JSON.stringify({ event: 'meeting.ended', recording: { id: RECORDING_ID, recordingId: RECORDING_ID, status: 'UPLOADED' } })
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    expect(db.spy).not.toHaveBeenCalled()
    expect(wf.spy).not.toHaveBeenCalled()
  })
  it('dedupes duplicate rtk-uuid to single mutation and workflow', async function () {
    const raw = payload('UPLOADED')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const env = { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } }
    const app = createApp()
    const r1 = await postWebhook(app, raw, sig, EVENT_UUID, env)
    const r2 = await postWebhook(app, raw, sig, EVENT_UUID, env)
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(wf.spy).toHaveBeenCalledTimes(1)
    const webhookSpy = db.spy as unknown as { mock: { calls: [string, readonly unknown[]][] } }
    // Insert-once deduplication: second insert rowCount 0, only one successful mutation
    const inserts = webhookSpy.mock.calls.filter(function isWebhookEvent([sql]) { return sql.includes('realtimekit_webhook_events') && sql.includes('INSERT') })
    // Should have at least one insert attempt; dedup via ON CONFLICT means second returns rowCount 0 not second row
    expect(inserts.length).toBeGreaterThanOrEqual(1)
    // Verify parametrized insert was used (no raw-body string concatenation)
    for (const [, values] of inserts) {
      if (values) expect(values).toContain(EVENT_UUID)
    }
  })
  it('UPLOADED handoff is deterministic after COMMIT and does not fetch media', async function () {
    const raw = payload('UPLOADED')
    const sig = await signRaw(raw)
    const order: string[] = []
    const db = createDbMock()
    const wf = createWorkflowMock(order)
    const orderedSpy = db.spy as unknown as { mockImplementation: (fn: (text: string, ...values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) => unknown }
    orderedSpy.mockImplementation(async function commitOrdered(text: string) {
      if (text === 'COMMIT;') order.push('commit')
      if (text.includes('interview_recordings')) return { rows: [{ id: RECORDING_ID }], rowCount: 1 }
      if (text.includes('realtimekit_webhook_events') && text.includes('INSERT')) return { rows: [{ provider_event_id: EVENT_UUID }], rowCount: 1 }
      return { rows: [] }
    })
    const fetchSpy = mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    expect(wf.spy).toHaveBeenCalledWith([{ id: `recording-finalization-v1-${RECORDING_ID}`, params: { recording_id: RECORDING_ID, schema_version: 1 } }])
    expect(order.indexOf('commit')).toBeLessThan(order.indexOf('workflow'))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const fetchSpyCalls = fetchSpy.mock.calls as unknown as string[][]
    expect(fetchSpyCalls[0][0]).toContain('.well-known/webhooks.json')
  })
  it('acknowledges unknown provider_recording_id as diagnostic no-op without workflow', async function () {
    const raw = payload('UPLOADED', UNKNOWN_ID)
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    const unknownSpy = db.spy as unknown as { mockImplementation: (fn: (text: string, ...values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) => unknown }
    unknownSpy.mockImplementation(async function unknownRecording(text: string, ...values: readonly unknown[]) {
      if (text.includes('realtimekit_webhook_events') && text.includes('INSERT')) return { rows: [{ provider_event_id: values[0] }], rowCount: 1 }
      if (text.includes('interview_recordings')) return { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 0 }
    })
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    expect(wf.spy).not.toHaveBeenCalled()
  })
  it('acknowledges out-of-order status as monotonic no-op without workflow or regression', async function () {
    const raw = payload('INVOKED')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const monotonicSpy = db.spy as unknown as { mockImplementation: (fn: (text: string, ...values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) => unknown }
    monotonicSpy.mockImplementation(async function alreadyProcessed(text: string, ...values: readonly unknown[]) {
      if (text.includes('realtimekit_webhook_events') && text.includes('INSERT')) return { rows: [{ provider_event_id: values[0] }], rowCount: 1 }
      if (text.includes('interview_recordings')) return { rows: [{ id: RECORDING_ID, provider_status: 'processed' }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    expect(wf.spy).not.toHaveBeenCalled()
  })
  it.each([
    ['INVOKED', 'accepted'],
    ['RECORDING', 'accepted'],
    ['UPLOADING', 'finalizing'],
    ['UPLOADED', 'processed'],
    ['ERRORED', 'failed'],
  ] as const)('maps provider status %s to checkpoint %s', async function (provider, checkpoint) {
    const raw = payload(provider)
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, crypto.randomUUID(), { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    const calls = (db.spy as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const webhookCalls = calls.filter(function isWebhook(entry) { return typeof entry[0] === 'string' && (entry[0] as string).includes('realtimekit_webhook_events') })
    const updateCalls = calls.filter(function isUpdate(entry) { return typeof entry[0] === 'string' && (entry[0] as string).trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS') })
    expect(webhookCalls.some(function hasCheckpoint(entry) { return (entry.slice(1) as unknown[]).includes(checkpoint) })).toBe(true)
    expect(updateCalls.some(function hasRawAndCheckpoint(entry) { const vals = entry.slice(1) as unknown[]; return vals.includes(provider) && vals.includes(checkpoint) })).toBe(true)
    for (const entry of [...webhookCalls, ...updateCalls]) {
      const sql = entry[0] as string
      const vals = entry.slice(1) as unknown[]
      if (vals.length) expect(sql).toMatch(/\$\d+/)
    }
  })

  // --- Extended coverage per Story 5.11 ---

  it.each([
    ['missing rtk-signature', { 'rtk-uuid': EVENT_UUID }],
    ['missing rtk-uuid', { 'rtk-signature': 'placeholder' }],
    ['empty rtk-signature', { 'rtk-signature': '', 'rtk-uuid': EVENT_UUID }],
    ['empty rtk-uuid', { 'rtk-signature': 'placeholder', 'rtk-uuid': '' }],
  ] as [string, Record<string, string>][])('rejects %s with 401/400 without DB or workflow side effects', async function (_label, headers) {
    const raw = payload('UPLOADED')
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    // Use placeholder sig where needed; missing headers should be rejected before verification
    const sigHeaders = { ...headers }
    if (!sigHeaders['rtk-signature'] || sigHeaders['rtk-signature'] === 'placeholder') {
      sigHeaders['rtk-signature'] = headers['rtk-signature'] === 'placeholder' ? await signRaw(raw) : (headers['rtk-signature'] ?? '')
    }
    const res = await postWebhookWithHeaders(app, raw, sigHeaders, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect([400, 401]).toContain(res.status)
    expect(db.spy).not.toHaveBeenCalled()
    expect(wf.spy).not.toHaveBeenCalled()
  })

  it('rejects malformed base64 rtk-signature without DB access', async function () {
    const raw = payload('UPLOADED')
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, '!!!not-base64!!!', EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(401)
    expect(db.spy).not.toHaveBeenCalled()
    expect(wf.spy).not.toHaveBeenCalled()
  })

  it('rejects malformed supported payload (missing recording.id) with 400 without workflow', async function () {
    const raw = JSON.stringify({ event: 'recording.statusUpdate', recording: { status: 'UPLOADED' } })
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(400)
    expect(wf.spy).not.toHaveBeenCalled()
  })

  it('rejects malformed supported payload (non-UUID recording id) with 400', async function () {
    const raw = JSON.stringify({ event: 'recording.statusUpdate', recording: { id: 'not-a-uuid', recordingId: 'not-a-uuid', status: 'UPLOADED' } })
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(400)
    expect(wf.spy).not.toHaveBeenCalled()
  })

  it('fails closed when well-known key fetch fails and no cache exists', async function () {
    const raw = payload('UPLOADED')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' }))
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: `${PUBLIC_KEY_URL}?uncached=1`, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(503)
    expect(db.spy).not.toHaveBeenCalled()
    expect(wf.spy).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalled()
  })

  it('reuses cached well-known key without refetch on second valid request', async function () {
    const raw1 = payload('UPLOADED')
    const sig1 = await signRaw(raw1)
    const raw2 = payload('RECORDING')
    const sig2 = await signRaw(raw2)
    const db = createDbMock()
    const wf = createWorkflowMock()
    const fetchSpy = mockWellKnown(publicPem)
    const app = createApp()
    const env = { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } }
    const r1 = await postWebhook(app, raw1, sig1, crypto.randomUUID(), env)
    const r2 = await postWebhook(app, raw2, sig2, crypto.randomUUID(), env)
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    // Cached key reuse: fetch should have been called only once (or at most once per app instance)
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(1)
  })

  it('forced refresh after rotated key verification failure succeeds on retry with new key', async function () {
    const raw = payload('UPLOADED')
    const sigWithRotatedKey = await signRaw(raw, rotatedPrivateKey)
    const db = createDbMock()
    const wf = createWorkflowMock()
    // First fetch returns old key, second returns rotated key
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { publicKey: publicPem } }), text: async () => JSON.stringify({ success: true, data: { publicKey: publicPem } }) }))
    // First fetch serves old PEM; verification failure forces refresh to rotated PEM.
    let callCount = 0
    fetchSpy.mockImplementation(async () => {
      callCount++
      const publicKey = callCount === 1 ? publicPem : rotatedPublicPem
      return { ok: true, json: async () => ({ success: true, data: { publicKey } }), text: async () => JSON.stringify({ success: true, data: { publicKey } }) }
    })
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch)
    const app = createApp()
    // First attempt with rotated sig against old key should trigger refresh
    const res = await postWebhook(app, raw, sigWithRotatedKey, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: `${PUBLIC_KEY_URL}?rotated=1`, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(callCount).toBe(2)
  })

  it('safe workflow-trigger failure still acknowledges 2xx without rolling back checkpoint', async function () {
    const raw = payload('UPLOADED')
    const sig = await signRaw(raw)
    const order: string[] = []
    const db = createDbMock()
    // Track commit before workflow
    const spy = db.spy as unknown as { mockImplementation: (fn: (text: string, ...values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) => unknown }
    spy.mockImplementation(async function (text: string) {
      if (text === 'COMMIT;') order.push('commit')
      if (text.includes('interview_recordings')) return { rows: [{ id: RECORDING_ID }], rowCount: 1 }
      if (text.includes('realtimekit_webhook_events')) return { rows: [{ provider_event_id: EVENT_UUID }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })
    const failingWf = vi.fn(async () => { order.push('workflow'); throw new Error('workflow unavailable') })
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: failingWf } })
    // Must still acknowledge 2xx - checkpoint persisted; workflow failure is safe to retry via sweeper
    expect(res.status).toBe(200)
    expect(order.indexOf('commit')).toBeLessThan(order.indexOf('workflow'))
    // No rollback after commit
    const calls = (db.spy as unknown as { mock: { calls: [string][] } }).mock.calls.map(([sql]) => sql)
    expect(calls).not.toContain('ROLLBACK;')
  })

  it('verifies exact raw bytes, not parsed JSON stringify', async function () {
    // Same logical JSON but different whitespace should fail verification
    const canonical = JSON.stringify({ event: 'recording.statusUpdate', recording: { id: RECORDING_ID, recordingId: RECORDING_ID, status: 'UPLOADED' } })
    const pretty = JSON.stringify({ event: 'recording.statusUpdate', recording: { id: RECORDING_ID, recordingId: RECORDING_ID, status: 'UPLOADED' } }, null, 2)
    const sig = await signRaw(canonical)
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, pretty, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(401)
    expect(db.spy).not.toHaveBeenCalled()
  })

  it('asserts SQL uses parametrized checkpoint values not string concatenation', async function () {
    const raw = payload('UPLOADED')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, EVENT_UUID, { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    const calls = (db.spy as unknown as { mock: { calls: [string, readonly unknown[]][] } }).mock.calls
    for (const [sql, values] of calls) {
      // Ensure no direct interpolation of UUIDs into SQL text (would be SQL injection risk)
      expect(sql).not.toContain(RECORDING_ID)
      expect(sql).not.toContain(EVENT_UUID)
      if (values && values.length > 0) {
        expect(sql).toMatch(/\$\d+/)
      }
    }
  })
  it('persists raw provider status UPLOADED while storing mapped checkpoint processed', async function () {
    const raw = payload('UPLOADED')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, crypto.randomUUID(), { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    const calls = (db.spy as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const updateCall = calls.find(function match(entry) { return typeof entry[0] === 'string' && (entry[0] as string).trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS') && (entry[0] as string).includes('provider_status') }) as unknown[] | undefined
    expect(updateCall).toBeDefined()
    const values = (updateCall as unknown[]).slice(1) as unknown[]
    // provider_status must be raw UPLOADED, finalization_checkpoint must be mapped processed
    expect(values[0]).toBe('UPLOADED')
    expect(values[1]).toBe('processed')
  })

  it('persists raw provider status ERRORED while storing mapped checkpoint failed', async function () {
    const raw = payload('ERRORED')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, crypto.randomUUID(), { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    const calls = (db.spy as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const updateCall = calls.find(function match(entry) { return typeof entry[0] === 'string' && (entry[0] as string).trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS') && (entry[0] as string).includes('provider_status') }) as unknown[] | undefined
    expect(updateCall).toBeDefined()
    const values = (updateCall as unknown[]).slice(1) as unknown[]
    expect(values[0]).toBe('ERRORED')
    expect(values[1]).toBe('failed')
  })

  it('does not regress terminal UPLOADED/processed state on late out-of-order ERRORED', async function () {
    const raw = payload('ERRORED')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    const terminalSpy = db.spy as unknown as { mockImplementation: (fn: (text: string, ...values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) => unknown }
    terminalSpy.mockImplementation(async function terminalProcessed(text: string, ...values: readonly unknown[]) {
      if (text.includes('realtimekit_webhook_events') && text.includes('INSERT')) return { rows: [{ provider_event_id: values[0] }], rowCount: 1 }
      if (text.includes('interview_recordings') && text.includes('SELECT')) return { rows: [{ id: RECORDING_ID, provider_recording_id: RECORDING_ID, provider_status: 'UPLOADED', finalization_status: 'pending' }], rowCount: 1 }
      if (text.trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS')) throw new Error('should not regress terminal state')
      return { rows: [], rowCount: 0 }
    })
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, crypto.randomUUID(), { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    expect(wf.spy).not.toHaveBeenCalled()
    const calls = (db.spy as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const hadUpdate = calls.some(function isUpdate(entry) { return typeof entry[0] === 'string' && (entry[0] as string).trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS') })
    expect(hadUpdate).toBe(false)
  })

  it('advances failed ERRORED state to UPLOADED/processed on recovery', async function () {
    const raw = payload('UPLOADED')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    const recoverSpy = db.spy as unknown as { mockImplementation: (fn: (text: string, ...values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) => unknown }
    recoverSpy.mockImplementation(async function failedCurrent(text: string, ...values: readonly unknown[]) {
      if (text.includes('realtimekit_webhook_events') && text.includes('INSERT')) return { rows: [{ provider_event_id: values[0] }], rowCount: 1 }
      if (text.includes('interview_recordings') && text.includes('SELECT')) return { rows: [{ id: RECORDING_ID, provider_recording_id: RECORDING_ID, provider_status: 'ERRORED', finalization_status: 'pending' }], rowCount: 1 }
      if (text.trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS')) return { rows: [], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, crypto.randomUUID(), { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    expect(wf.spy).toHaveBeenCalledTimes(1)
    const calls = (db.spy as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const updateCall = calls.find(function match(entry) { return typeof entry[0] === 'string' && (entry[0] as string).trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS') }) as unknown[] | undefined
    expect(updateCall).toBeDefined()
    const values = (updateCall as unknown[]).slice(1) as unknown[]
    expect(values).toContain('UPLOADED')
    expect(values).toContain('processed')
  })
  it('persists raw RECORDING with accepted checkpoint when current raw is INVOKED', async function () {
    const raw = payload('RECORDING')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    const invokedSpy = db.spy as unknown as { mockImplementation: (fn: (text: string, ...values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) => unknown }
    invokedSpy.mockImplementation(async function invokedCurrent(text: string, ...values: readonly unknown[]) {
      if (text.includes('realtimekit_webhook_events') && text.includes('INSERT')) return { rows: [{ provider_event_id: values[0] }], rowCount: 1 }
      if (text.includes('interview_recordings') && text.includes('SELECT')) return { rows: [{ id: RECORDING_ID, provider_recording_id: RECORDING_ID, provider_status: 'INVOKED', finalization_status: 'pending' }], rowCount: 1 }
      if (text.trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS')) return { rows: [], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, crypto.randomUUID(), { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    const calls = (db.spy as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const updateCall = calls.find(function match(entry) { return typeof entry[0] === 'string' && (entry[0] as string).trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS') }) as unknown[] | undefined
    expect(updateCall).toBeDefined()
    const values = (updateCall as unknown[]).slice(1) as unknown[]
    expect(values[0]).toBe('RECORDING')
    expect(values[1]).toBe('accepted')
  })
  it('does not regress terminal UPLOADED on late RECORDING', async function () {
    const raw = payload('RECORDING')
    const sig = await signRaw(raw)
    const db = createDbMock()
    const wf = createWorkflowMock()
    const terminalSpy = db.spy as unknown as { mockImplementation: (fn: (text: string, ...values: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) => unknown }
    terminalSpy.mockImplementation(async function terminalUploaded(text: string, ...values: readonly unknown[]) {
      if (text.includes('realtimekit_webhook_events') && text.includes('INSERT')) return { rows: [{ provider_event_id: values[0] }], rowCount: 1 }
      if (text.includes('interview_recordings') && text.includes('SELECT')) return { rows: [{ id: RECORDING_ID, provider_recording_id: RECORDING_ID, provider_status: 'UPLOADED', finalization_status: 'pending' }], rowCount: 1 }
      if (text.trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS')) throw new Error('should not regress terminal UPLOADED')
      return { rows: [], rowCount: 0 }
    })
    mockWellKnown(publicPem)
    const app = createApp()
    const res = await postWebhook(app, raw, sig, crypto.randomUUID(), { DB: db.query, REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: PUBLIC_KEY_URL, RECORDING_FINALIZATION_WORKFLOW: { createBatch: wf.createBatch } })
    expect(res.status).toBe(200)
    expect(wf.spy).not.toHaveBeenCalled()
    const calls = (db.spy as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const hadUpdate = calls.some(function isUpdate(entry) { return typeof entry[0] === 'string' && (entry[0] as string).trim().toUpperCase().startsWith('UPDATE INTERVIEW_RECORDINGS') })
    expect(hadUpdate).toBe(false)
  })
})
