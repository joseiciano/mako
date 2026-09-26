import { describe, expect, it, vi } from 'vitest'
import {
  ALLOWLISTED_PROVIDER_ERROR_CODES,
  createCloudflareVerificationEmailSender,
} from './auth-verification-email'

const SENDER = 'noreply@mako.test'
const RECIPIENT = 'candidate+mako@example.com'
const SIMPLE_VERIFICATION_URL =
  'https://mako-backend.icianojn.workers.dev/api/auth/verify-email?token=abc123'
const HOSTILE_VERIFICATION_URL =
  'https://mako-backend.icianojn.workers.dev/api/auth/verify-email?token=abc123&expires=4102444800&sig=a\'b"c<d>e'
const PII_SENTINEL = 'sentinel-pii-7f3a'

type CapturedTelemetryEvent = {
  event: string
  provider?: string
  outcome?: string
  errorCode?: string
}
type CapturedEmailMessage = {
  to: string
  from: { email: string; name: string }
  subject: string
  text?: string
  html?: string
}

function createHarness(overrides: {
  sendImplementation?: () => Promise<EmailSendResult>
} = {}) {
  const messages: CapturedEmailMessage[] = []
  let sendImplementation =
    overrides.sendImplementation ?? (async () => ({ messageId: 'cf-message-1' }))

  const email = {
    send: vi.fn(async function send(message: unknown) {
      messages.push(message as unknown as CapturedEmailMessage)
      return sendImplementation()
    }),
  } as unknown as SendEmail

  const observedPromises: Promise<void>[] = []
  const waitUntil = vi.fn(function waitUntil(promise: Promise<void>) {
    observedPromises.push(promise)
  })

  const events: CapturedTelemetryEvent[] = []
  const logger = vi.fn(function logger(event: CapturedTelemetryEvent) {
    events.push(event)
  })

  const sendVerificationEmail = createCloudflareVerificationEmailSender({
    email,
    from: SENDER,
    waitUntil,
    logger,
  })

  return {
    email,
    messages,
    observedPromises,
    waitUntil,
    events,
    logger,
    sendVerificationEmail,
    setSendImplementation(implementation: () => Promise<EmailSendResult>) {
      sendImplementation = implementation
    },
  }
}

describe('createCloudflareVerificationEmailSender', function () {
  it('sends one structured message with recipient, Mako sender, subject, and both body formats', async function () {
    const harness = createHarness()

    await harness.sendVerificationEmail({
      email: RECIPIENT,
      url: SIMPLE_VERIFICATION_URL,
    })

    expect(harness.email.send).toHaveBeenCalledTimes(1)
    expect(harness.messages).toHaveLength(1)

    const message = harness.messages[0]
    expect(message.to).toBe(RECIPIENT)
    expect(message.from).toEqual({ email: SENDER, name: 'Mako' })
    expect(message.subject).toBe('Verify your Mako email')
    expect(typeof message.text).toBe('string')
    expect(typeof message.html).toBe('string')
    expect(message.text).toContain(SIMPLE_VERIFICATION_URL)
  })

  it('HTML-escapes the full verification URL for every attribute boundary', async function () {
    const harness = createHarness()

    await harness.sendVerificationEmail({
      email: RECIPIENT,
      url: HOSTILE_VERIFICATION_URL,
    })

    const html = harness.messages[0].html ?? ''
    expect(html).toContain(
      'href="https://mako-backend.icianojn.workers.dev/api/auth/verify-email?token=abc123&amp;expires=4102444800&amp;sig=a&#39;b&quot;c&lt;d&gt;e"',
    )
    expect(html).not.toContain('&expires=')
    expect(html).not.toContain("a'b\"c<d>e")

    const text = harness.messages[0].text ?? ''
    expect(text).toContain(HOSTILE_VERIFICATION_URL)
  })

  it('registers exactly one observed promise and returns without awaiting provider delivery', async function () {
    let releaseSend: (result: EmailSendResult) => void = () => {}
    const harness = createHarness({
      sendImplementation() {
        return new Promise<EmailSendResult>(function resolveSend(resolve) {
          releaseSend = resolve
        })
      },
    })

    const completion = harness.sendVerificationEmail({
      email: RECIPIENT,
      url: SIMPLE_VERIFICATION_URL,
    })

    await completion

    expect(harness.waitUntil).toHaveBeenCalledTimes(1)
    expect(harness.observedPromises).toHaveLength(1)

    releaseSend({ messageId: 'cf-message-late' })
    await harness.observedPromises[0]
  })

  it('maps provider acceptance to the fixed accepted telemetry event without PII or provider identifiers', async function () {
    const harness = createHarness()

    await harness.sendVerificationEmail({
      email: RECIPIENT,
      url: SIMPLE_VERIFICATION_URL,
    })
    await harness.observedPromises[0]

    expect(harness.events).toHaveLength(1)
    expect(harness.events[0]).toEqual({
      event: 'auth.verification_email.accepted',
      provider: 'cloudflare',
      outcome: 'accepted',
    })
    expect('messageId' in harness.events[0]).toBe(false)

    const serializedEvents = JSON.stringify(harness.events)
    expect(serializedEvents).not.toContain(RECIPIENT)
    expect(serializedEvents).not.toContain(SIMPLE_VERIFICATION_URL)
  })

  it.each([...ALLOWLISTED_PROVIDER_ERROR_CODES])(
    'maps allowlisted provider failure %s to fixed telemetry without raw errors',
    async function (providerErrorCode) {
      const harness = createHarness({
        sendImplementation: async function rejectSend(): Promise<EmailSendResult> {
          throw {
            code: providerErrorCode,
            message: `provider rejected mailbox ${RECIPIENT} ${PII_SENTINEL}`,
          }
        },
      })

      await harness.sendVerificationEmail({
        email: RECIPIENT,
        url: SIMPLE_VERIFICATION_URL,
      })
      await harness.observedPromises[0]

      expect(harness.events).toHaveLength(1)
      expect(harness.events[0]).toEqual({
        event: 'auth.verification_email.rejected',
        provider: 'cloudflare',
        outcome: 'rejected',
        errorCode: providerErrorCode,
      })

      const serializedEvents = JSON.stringify(harness.events)
      expect(serializedEvents).not.toContain(RECIPIENT)
      expect(serializedEvents).not.toContain(SIMPLE_VERIFICATION_URL)
      expect(serializedEvents).not.toContain(PII_SENTINEL)
      expect(serializedEvents).not.toContain('provider rejected mailbox')
    },
  )

  it('maps unknown provider failures to UNKNOWN without logging the thrown payload', async function () {
    const harness = createHarness({
      sendImplementation: async function rejectSend(): Promise<EmailSendResult> {
        throw new Error(`smtp 550 mailbox unavailable ${PII_SENTINEL}`)
      },
    })

    await harness.sendVerificationEmail({
      email: RECIPIENT,
      url: SIMPLE_VERIFICATION_URL,
    })
    await harness.observedPromises[0]

    expect(harness.events).toHaveLength(1)
    expect(harness.events[0]).toEqual({
      event: 'auth.verification_email.rejected',
      provider: 'cloudflare',
      outcome: 'rejected',
      errorCode: 'UNKNOWN',
    })
    expect(JSON.stringify(harness.events)).not.toContain(PII_SENTINEL)
  })

  it('maps arbitrary non-error provider rejections to UNKNOWN without logging sentinel fields', async function () {
    const harness = createHarness({
      sendImplementation: async function rejectSend(): Promise<EmailSendResult> {
        throw {
          code: 'E_NOT_IN_ALLOWLIST',
          detail: `quota exceeded for ${RECIPIENT} ${PII_SENTINEL}`,
        }
      },
    })

    await harness.sendVerificationEmail({
      email: RECIPIENT,
      url: SIMPLE_VERIFICATION_URL,
    })
    await harness.observedPromises[0]

    expect(harness.events).toHaveLength(1)
    expect(harness.events[0]).toMatchObject({
      event: 'auth.verification_email.rejected',
      provider: 'cloudflare',
      outcome: 'rejected',
      errorCode: 'UNKNOWN',
    })
    expect(JSON.stringify(harness.events)).not.toContain(PII_SENTINEL)
    expect(JSON.stringify(harness.events)).not.toContain('E_NOT_IN_ALLOWLIST')
  })

  it('consumes the provider rejection so the observed promise never rejects', async function () {
    const harness = createHarness({
      sendImplementation: async function rejectSend(): Promise<EmailSendResult> {
        throw { code: 'E_DOMAIN_NOT_VERIFIED', message: 'domain not verified' }
      },
    })

    await expect(
      harness.sendVerificationEmail({
        email: RECIPIENT,
        url: SIMPLE_VERIFICATION_URL,
      }),
    ).resolves.toBeUndefined()

    await expect(harness.observedPromises[0]).resolves.toBeUndefined()
  })
})
