import type { AccountSession } from '../account/types'

export type { AccountSession }

export class PaymentUnauthorizedError extends Error {
  constructor(message = 'Authentication is required for this payment operation.') {
    super(message)
    this.name = 'PaymentUnauthorizedError'
  }
}

export class PaymentPackageNotFoundError extends Error {
  constructor(message = 'The requested credit package was not found.') {
    super(message)
    this.name = 'PaymentPackageNotFoundError'
  }
}

export class PaymentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentValidationError'
  }
}

export class PaymentWebhookSignatureError extends Error {
  constructor(message = 'Stripe webhook signature verification failed.') {
    super(message)
    this.name = 'PaymentWebhookSignatureError'
  }
}

export type PaymentServiceLogger = {
  info(event: string, context?: Record<string, unknown>): void
  error(event: string, context?: Record<string, unknown>): void
}
