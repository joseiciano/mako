import type { SendVerificationEmail } from '@mako/shared-backend'

export type VerificationEmailTelemetryEvent = {
  event: 'auth.verification_email.accepted' | 'auth.verification_email.rejected'
  provider: 'cloudflare'
  outcome: 'accepted' | 'rejected'
  errorCode?: string
}

export type VerificationEmailLogger = (
  event: VerificationEmailTelemetryEvent,
) => void

export type VerificationEmailWaitUntil = (promise: Promise<void>) => void

export type CloudflareVerificationEmailSenderOptions = {
  email: SendEmail
  from: string
  waitUntil: VerificationEmailWaitUntil
  logger: VerificationEmailLogger
}

const SENDER_NAME = 'Mako'
const EMAIL_SUBJECT = 'Verify your Mako email'

/**
 * Cloudflare Email Service error codes that are safe to emit in telemetry.
 * Any other thrown value maps to UNKNOWN so raw provider messages and
 * payload fields never reach application logs.
 */
const ALLOWLISTED_ERROR_CODES: Record<string, true> = {
  E_VALIDATION_ERROR: true,
  E_FIELD_MISSING: true,
  E_TOO_MANY_RECIPIENTS: true,
  E_TOO_MANY_ATTACHMENTS: true,
  E_SENDER_NOT_VERIFIED: true,
  E_RECIPIENT_NOT_ALLOWED: true,
  E_RECIPIENT_SUPPRESSED: true,
  E_SENDER_DOMAIN_NOT_AVAILABLE: true,
  E_CONTENT_TOO_LARGE: true,
  E_DELIVERY_FAILED: true,
  E_RATE_LIMIT_EXCEEDED: true,
  E_DAILY_LIMIT_EXCEEDED: true,
  E_INTERNAL_SERVER_ERROR: true,
  E_HEADER_NOT_ALLOWED: true,
  E_HEADER_USE_API_FIELD: true,
  E_HEADER_VALUE_INVALID: true,
  E_HEADER_VALUE_TOO_LONG: true,
  E_HEADER_NAME_INVALID: true,
  E_HEADERS_TOO_LARGE: true,
  E_HEADERS_TOO_MANY: true,
}
export const ALLOWLISTED_PROVIDER_ERROR_CODES: readonly string[] = Object.keys(
  ALLOWLISTED_ERROR_CODES,
)

/**
 * Escapes a string for safe interpolation into HTML text and
 * double-quoted attribute values. The verification URL contains a signed
 * JWT that may include characters meaningful to HTML parsers, so every
 * attribute boundary must be escaped.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function resolveProviderErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code

    if (
      typeof code === 'string' &&
      ALLOWLISTED_ERROR_CODES[code]
    ) {
      return code
    }
  }

  return 'UNKNOWN'
}

export function createCloudflareVerificationEmailSender(
  options: CloudflareVerificationEmailSenderOptions,
): SendVerificationEmail {
  const { email, from, waitUntil, logger } = options

  return function sendVerificationEmail(
    input: Parameters<SendVerificationEmail>[0],
  ): Promise<void> {
    const escapedUrl = escapeHtml(input.url)

    const message = {
      to: input.email,
      from: { email: from, name: SENDER_NAME },
      subject: EMAIL_SUBJECT,
      text: [
        'Verify your Mako email',
        '',
        'Open this link to verify your email address:',
        input.url,
        '',
        'If you did not create a Mako account, you can ignore this message.',
      ].join('\n'),
      html: [
        '<!doctype html>',
        '<html>',
        '<body>',
        '<p>Verify your Mako email</p>',
        '<p>Open this link to verify your email address:</p>',
        `<p><a href="${escapedUrl}">Verify your email</a></p>`,
        '<p>If you did not create a Mako account, you can ignore this message.</p>',
        '</body>',
        '</html>',
      ].join('\n'),
    }

    const observedDelivery = (async function observeDelivery(): Promise<void> {
      try {
        await email.send(message)

        logger({
          event: 'auth.verification_email.accepted',
          provider: 'cloudflare',
          outcome: 'accepted',
        })
      } catch (error) {
        logger({
          event: 'auth.verification_email.rejected',
          provider: 'cloudflare',
          outcome: 'rejected',
          errorCode: resolveProviderErrorCode(error),
        })
      }
    })()

    waitUntil(observedDelivery)

    return Promise.resolve()
  }
}
