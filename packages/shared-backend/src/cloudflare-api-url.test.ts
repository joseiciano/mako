import { describe, expect, it } from 'vitest'
import { buildCloudflareApiUrl } from './cloudflare-api-url'

describe('buildCloudflareApiUrl', function suite() {
  it('uses the production base when the setting is unset or blank', function run() {
    expect(buildCloudflareApiUrl(undefined, '/accounts/a/x')).toBe(
      'https://api.cloudflare.com/client/v4/accounts/a/x',
    )
    expect(buildCloudflareApiUrl('', '/accounts/a/x')).toBe(
      'https://api.cloudflare.com/client/v4/accounts/a/x',
    )
    expect(buildCloudflareApiUrl('  ', '/accounts/a/x')).toBe(
      'https://api.cloudflare.com/client/v4/accounts/a/x',
    )
  })

  it('uses the override base', function run() {
    expect(buildCloudflareApiUrl('http://fakes:9000/client/v4', '/accounts/a/x')).toBe(
      'http://fakes:9000/client/v4/accounts/a/x',
    )
  })

  it('strips trailing slashes from the override', function run() {
    expect(buildCloudflareApiUrl('http://fakes:9000/client/v4///', '/accounts/a/x')).toBe(
      'http://fakes:9000/client/v4/accounts/a/x',
    )
  })

  it.each(['not a url', 'ftp://fakes/client/v4', 'javascript:alert(1)', '/relative'])(
    'throws for invalid override %s',
    function run(value) {
      expect(() => buildCloudflareApiUrl(value, '/accounts/a/x')).toThrow(
        'CLOUDFLARE_API_BASE_URL',
      )
    },
  )
})
