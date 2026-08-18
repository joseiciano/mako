import {
  RealtimeKitInvalidPublicKeyError,
  RealtimeKitPublicKeyUnavailableError,
} from './types'
import { parsePemPublicKey } from './webhook-signature'

export { RealtimeKitInvalidPublicKeyError, RealtimeKitPublicKeyUnavailableError }

export type RealtimeKitPublicKeyProvider = {
  getPublicKeyDer(): Promise<ArrayBuffer>
}

export type RealtimeKitPublicKeyProviderOptions = {
  url: string
  fallbackPem?: string
  cacheTtlMs: number
  fetch: typeof globalThis.fetch
  now?: () => number
}

type CachedKeyEntry = {
  der: ArrayBuffer
  expiresAt: number
}

// Cache lives at module scope so all isolates sharing the same Worker reuse the
// refreshable key instead of fetching on every webhook delivery.
const cachedKeysByUrl = new Map<string, CachedKeyEntry>()

// Test/ops hook: clears the in-memory key cache (e.g. after a key rotation).
export function clearRealtimeKitPublicKeyCache(): void {
  cachedKeysByUrl.clear()
}

export function createRealtimeKitPublicKeyProvider(
  options: RealtimeKitPublicKeyProviderOptions,
): RealtimeKitPublicKeyProvider {
  const now = options.now ?? function defaultNow() {
    return Date.now()
  }

  return {
    async getPublicKeyDer() {
      const cached = cachedKeysByUrl.get(options.url)

      if (cached && now() < cached.expiresAt) {
        return cached.der
      }

      try {
        const der = await fetchPublicKeyFromUrl(options.url, options.fetch)
        cachedKeysByUrl.set(options.url, {
          der,
          expiresAt: now() + options.cacheTtlMs,
        })
        return der
      } catch (error) {
        // Serve the stale cached key during refresh failures so transient
        // network issues never break signature verification for new events.
        if (cached) {
          return cached.der
        }

        if (options.fallbackPem) {
          try {
            const der = parsePemPublicKey(options.fallbackPem)
            cachedKeysByUrl.set(options.url, {
              der,
              expiresAt: now() + options.cacheTtlMs,
            })
            return der
          } catch (fallbackError) {
            throw new RealtimeKitPublicKeyUnavailableError(
              `RealtimeKit webhook public key is unavailable: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          }
        }

        throw new RealtimeKitPublicKeyUnavailableError(
          `RealtimeKit webhook public key is unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    },
  }
}

async function fetchPublicKeyFromUrl(
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    throw new RealtimeKitPublicKeyUnavailableError(
      `RealtimeKit webhook key endpoint returned ${response.status}.`,
    )
  }

  const json = (await response.json()) as Record<string, unknown>
  const publicKey = typeof json.public_key === 'string' ? json.public_key : undefined

  if (!publicKey) {
    throw new RealtimeKitInvalidPublicKeyError(
      'RealtimeKit webhook key document is missing public_key.',
    )
  }

  return parsePemPublicKey(publicKey)
}
