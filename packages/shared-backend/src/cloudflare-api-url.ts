export const CLOUDFLARE_API_DEFAULT_BASE_URL = 'https://api.cloudflare.com/client/v4'

/**
 * Builds a Cloudflare REST API URL. `baseUrl` is the optional
 * `CLOUDFLARE_API_BASE_URL` operator setting; unset or blank returns the
 * production default. A value that is not an http(s) URL throws.
 */
export function buildCloudflareApiUrl(baseUrl: string | undefined, path: string): string {
  const trimmed = baseUrl?.trim()
  if (!trimmed) {
    return `${CLOUDFLARE_API_DEFAULT_BASE_URL}${path}`
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('CLOUDFLARE_API_BASE_URL must be an http or https URL.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('CLOUDFLARE_API_BASE_URL must be an http or https URL.')
  }

  return `${trimmed.replace(/\/+$/, '')}${path}`
}
