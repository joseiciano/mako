export type VerifyResult = 'valid' | 'invalid' | 'unavailable'

export class RealtimeKitWebhookSignatureVerifier {
  private cachedKey: CryptoKey | null = null
  private cachedPem: string | null = null

  constructor(private readonly publicKeyUrl: string) {}

  async verify(rawBytes: Uint8Array, signatureBase64: string): Promise<VerifyResult> {
    let signatureBytes: Uint8Array
    try {
      signatureBytes = base64ToBytes(signatureBase64)
    } catch {
      return 'invalid'
    }

    if (signatureBytes.length === 0) {
      return 'invalid'
    }

    if (this.cachedKey) {
      const ok = await tryVerify(this.cachedKey, signatureBytes, rawBytes)
      if (ok) return 'valid'
      const refreshed = await this.fetchAndImport()
      if (!refreshed) return 'unavailable'
      this.cachedKey = refreshed.key
      this.cachedPem = refreshed.pem
      const retryOk = await tryVerify(refreshed.key, signatureBytes, rawBytes)
      return retryOk ? 'valid' : 'invalid'
    }

    const fetched = await this.fetchAndImport()
    if (!fetched) return 'unavailable'
    this.cachedKey = fetched.key
    this.cachedPem = fetched.pem
    const ok = await tryVerify(fetched.key, signatureBytes, rawBytes)
    if (ok) return 'valid'
    const refreshed = await this.fetchAndImport()
    if (!refreshed) return 'unavailable'
    if (refreshed.pem === fetched.pem) {
      return 'invalid'
    }
    this.cachedKey = refreshed.key
    this.cachedPem = refreshed.pem
    const retryOk = await tryVerify(refreshed.key, signatureBytes, rawBytes)
    return retryOk ? 'valid' : 'invalid'
  }

  private async fetchAndImport(): Promise<{ key: CryptoKey; pem: string } | null> {
    let pem: string | null = null
    try {
      const res = await fetch(this.publicKeyUrl)
      if (!res.ok) return null
      const json = (await res.json()) as unknown
      pem = extractPemFromResponse(json)
      if (!pem) return null
    } catch {
      return null
    }

    if (!pem) return null

    const key = await importPublicKey(pem)
    if (!key) return null
    return { key, pem }
  }
}

function extractPemFromResponse(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  if (!('data' in json)) return null
  const dataContainer = (json as { data?: unknown }).data
  if (!dataContainer || typeof dataContainer !== 'object') return null
  if (!('publicKey' in dataContainer)) return null
  const publicKey = (dataContainer as { publicKey?: unknown }).publicKey
  if (typeof publicKey === 'string' && publicKey.trim().length > 0) {
    return publicKey.trim()
  }
  if (publicKey && typeof publicKey === 'object') {
    return JSON.stringify(publicKey)
  }
  return null
}

async function importPublicKey(pemOrJwk: string): Promise<CryptoKey | null> {
  const trimmed = pemOrJwk.trim()
  if (trimmed.startsWith('{')) {
    try {
      const jwk = JSON.parse(trimmed) as JsonWebKey
      return await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    } catch {
      // fall through
    }
  }
  try {
    const b64 = trimmed
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s+/g, '')
    if (!b64) return null
    const der = base64ToBytes(b64)
    return await crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  } catch {
    return null
  }
}

async function tryVerify(key: CryptoKey, signature: Uint8Array, data: Uint8Array): Promise<boolean> {
  try {
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)
  } catch {
    return false
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.trim()
  if (!clean) throw new Error('empty base64')
  if (!/^[A-Za-z0-9+/=]+$/.test(clean)) throw new Error('invalid base64')
  try {
    if (typeof atob === 'function') {
      const binary = atob(clean)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return bytes
    }
  } catch {
    throw new Error('invalid base64')
  }
  const holder = globalThis as unknown as { Buffer?: { from(s: string, enc: string): Uint8Array } }
  const maybeBuffer = holder.Buffer
  if (maybeBuffer) {
    const buf = maybeBuffer.from(clean, 'base64')
    if (buf.length === 0) throw new Error('invalid base64')
    return new Uint8Array(buf)
  }
  throw new Error('invalid base64')
}
