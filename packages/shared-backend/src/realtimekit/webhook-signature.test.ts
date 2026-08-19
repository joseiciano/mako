import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  createRealtimeKitSignatureVerifier,
  parsePemPublicKey,
} from './webhook-signature'
import {
  RealtimeKitPublicKeyUnavailableError,
  clearRealtimeKitPublicKeyCache,
  createRealtimeKitPublicKeyProvider,
} from './public-key-provider'
import {
  encodeText,
  generateRsaKeyPair,
  signWithKey,
  toBase64,
} from './test-utils'

describe('parsePemPublicKey', function pemSuite() {
  it('decodes a PEM public key to the matching SPKI DER bytes', async function run() {
    const { publicKeyPem, publicKeyDer } = await generateRsaKeyPair()

    const der = parsePemPublicKey(publicKeyPem)

    expect(new Uint8Array(der)).toEqual(new Uint8Array(publicKeyDer))
  })

  it('rejects malformed PEM input', function run() {
    expect(() => parsePemPublicKey('not-a-pem')).toThrow()
    expect(() => parsePemPublicKey('-----BEGIN PUBLIC KEY-----\n%%%bad%%%\n-----END PUBLIC KEY-----')).toThrow()
  })
})

describe('createRealtimeKitSignatureVerifier', function verifierSuite() {
  it('accepts a valid RSA-SHA256 signature over the raw body bytes', async function run() {
    const { keyPair, publicKeyDer } = await generateRsaKeyPair()
    const rawBody = encodeText('{"type":"recording.statusUpdate"}')
    const signature = await signWithKey(keyPair.privateKey, rawBody)

    const verifier = createRealtimeKitSignatureVerifier({
      publicKeyProvider: { getPublicKeyDer: async () => publicKeyDer },
      subtle: crypto.subtle,
    })

    await expect(
      verifier.verify({ rawBody, signatureBase64: signature }),
    ).resolves.toBe(true)
  })

  it('rejects a tampered body', async function run() {
    const { keyPair, publicKeyDer } = await generateRsaKeyPair()
    const rawBody = encodeText('{"type":"recording.statusUpdate"}')
    const signature = await signWithKey(keyPair.privateKey, rawBody)

    const verifier = createRealtimeKitSignatureVerifier({
      publicKeyProvider: { getPublicKeyDer: async () => publicKeyDer },
      subtle: crypto.subtle,
    })

    const tamperedBody = encodeText('{"type":"recording.statusUpdate","tampered":true}')
    await expect(
      verifier.verify({ rawBody: tamperedBody, signatureBase64: signature }),
    ).resolves.toBe(false)
  })

  it('rejects a signature produced by a different key', async function run() {
    const first = await generateRsaKeyPair()
    const second = await generateRsaKeyPair()
    const rawBody = encodeText('payload')
    const signature = await signWithKey(first.keyPair.privateKey, rawBody)

    const verifier = createRealtimeKitSignatureVerifier({
      publicKeyProvider: { getPublicKeyDer: async () => second.publicKeyDer },
      subtle: crypto.subtle,
    })

    await expect(
      verifier.verify({ rawBody, signatureBase64: signature }),
    ).resolves.toBe(false)
  })

  it('rejects a malformed base64 signature', async function run() {
    const { publicKeyDer } = await generateRsaKeyPair()

    const verifier = createRealtimeKitSignatureVerifier({
      publicKeyProvider: { getPublicKeyDer: async () => publicKeyDer },
      subtle: crypto.subtle,
    })

    await expect(
      verifier.verify({
        rawBody: encodeText('payload'),
        signatureBase64: 'not-base64!!!',
      }),
    ).resolves.toBe(false)
  })

  it('propagates public-key unavailability as an error', async function run() {
    const verifier = createRealtimeKitSignatureVerifier({
      publicKeyProvider: {
        getPublicKeyDer: async () => {
          throw new RealtimeKitPublicKeyUnavailableError('key unavailable')
        },
      },
      subtle: crypto.subtle,
    })

    await expect(
      verifier.verify({
        rawBody: encodeText('payload'),
        signatureBase64: toBase64(new Uint8Array([1, 2, 3])),
      }),
    ).rejects.toThrow(RealtimeKitPublicKeyUnavailableError)
  })
})

describe('createRealtimeKitPublicKeyProvider', function keyProviderSuite() {
  const defaultUrl = 'https://api.realtime.cloudflare.com/.well-known/webhooks.json'

  beforeEach(function clearKeyCache() {
    clearRealtimeKitPublicKeyCache()
  })

  it('fetches and caches the public key across repeated calls within the TTL', async function run() {
    const { publicKeyPem } = await generateRsaKeyPair()
    const fetchMock = vi.fn(async () => webhookJsonResponse(publicKeyPem))
    let now = 1000

    const provider = createRealtimeKitPublicKeyProvider({
      url: defaultUrl,
      cacheTtlMs: 60_000,
      fetch: fetchMock,
      now: () => now,
    })

    await provider.getPublicKeyDer()
    await provider.getPublicKeyDer()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes the key after the cache TTL elapses', async function run() {
    const { publicKeyPem } = await generateRsaKeyPair()
    const fetchMock = vi.fn(async () => webhookJsonResponse(publicKeyPem))
    let now = 1000

    const provider = createRealtimeKitPublicKeyProvider({
      url: defaultUrl,
      cacheTtlMs: 60_000,
      fetch: fetchMock,
      now: () => now,
    })

    await provider.getPublicKeyDer()
    now = 61_001
    await provider.getPublicKeyDer()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('serves the stale cached key when a refresh fails', async function run() {
    const { publicKeyPem, publicKeyDer } = await generateRsaKeyPair()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(webhookJsonResponse(publicKeyPem))
      .mockRejectedValueOnce(new Error('network down'))
    let now = 1000

    const provider = createRealtimeKitPublicKeyProvider({
      url: defaultUrl,
      cacheTtlMs: 60_000,
      fetch: fetchMock,
      now: () => now,
    })

    const first = await provider.getPublicKeyDer()
    now = 61_001
    const second = await provider.getPublicKeyDer()

    expect(new Uint8Array(second)).toEqual(new Uint8Array(first))
    expect(new Uint8Array(second)).toEqual(new Uint8Array(publicKeyDer))
  })

  it('throws RealtimeKitPublicKeyUnavailableError when no key is cached and fetch fails', async function run() {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down')
    })

    const provider = createRealtimeKitPublicKeyProvider({
      url: defaultUrl,
      cacheTtlMs: 60_000,
      fetch: fetchMock,
    })

    await expect(provider.getPublicKeyDer()).rejects.toThrow(
      RealtimeKitPublicKeyUnavailableError,
    )
  })

  it('falls back to a configured static PEM when fetch fails and no key is cached', async function run() {
    const { publicKeyPem, publicKeyDer } = await generateRsaKeyPair()
    const fetchMock = vi.fn(async () => {
      throw new Error('network down')
    })

    const provider = createRealtimeKitPublicKeyProvider({
      url: defaultUrl,
      fallbackPem: publicKeyPem,
      cacheTtlMs: 60_000,
      fetch: fetchMock,
    })

    const der = await provider.getPublicKeyDer()
    expect(new Uint8Array(der)).toEqual(new Uint8Array(publicKeyDer))
  })

  it('throws when the fetched key document is malformed', async function run() {
    const fetchMock = vi.fn(async () => webhookJsonResponse('not-a-pem'))

    const provider = createRealtimeKitPublicKeyProvider({
      url: defaultUrl,
      cacheTtlMs: 60_000,
      fetch: fetchMock,
    })

    await expect(provider.getPublicKeyDer()).rejects.toThrow()
  })

  it('aborts the key fetch after a 5-second timeout', async function run() {
    const { publicKeyPem } = await generateRsaKeyPair()
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const controller = new AbortController()
    timeoutSpy.mockReturnValue(controller.signal)
    const fetchMock = vi.fn(async () => webhookJsonResponse(publicKeyPem))

    const provider = createRealtimeKitPublicKeyProvider({
      url: defaultUrl,
      cacheTtlMs: 60_000,
      fetch: fetchMock,
    })

    await provider.getPublicKeyDer()

    expect(timeoutSpy).toHaveBeenCalledTimes(1)
    expect(timeoutSpy).toHaveBeenCalledWith(5000)
    expect(fetchMock).toHaveBeenCalledWith(
      defaultUrl,
      expect.objectContaining({ signal: controller.signal }),
    )

    timeoutSpy.mockRestore()
  })
})

function webhookJsonResponse(publicKey: string): Response {
  return new Response(
    JSON.stringify({ public_key: publicKey, algorithm: 'RS256' }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  )
}
