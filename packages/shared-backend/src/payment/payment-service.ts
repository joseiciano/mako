import type { CreditPackage } from '@mako/shared'
import type { Stripe } from 'stripe'
import { CreditIdempotencyConflictError } from '../credit/types'
import type { CreditService } from '../credit/credit-service'
import {
  PaymentPackageNotFoundError,
  PaymentUnauthorizedError,
  PaymentWebhookSignatureError,
  type AccountSession,
  type PaymentServiceLogger,
} from './types'

export class PaymentService {
  constructor(
    private readonly stripe: Stripe,
    private readonly creditService: CreditService,
    private readonly packages: readonly CreditPackage[],
    private readonly logger: PaymentServiceLogger,
  ) {}

  listPackages(): CreditPackage[] {
    return this.packages.map(function clone(pkg) { return { ...pkg } })
  }

  async createPaymentIntent(
    session: AccountSession | null,
    packageId: string,
  ): Promise<{ client_secret: string }> {
    if (!session) {
      throw new PaymentUnauthorizedError()
    }

    const pkg = this.packages.find(function matchId(p) { return p.package_id === packageId })

    if (!pkg) {
      throw new PaymentPackageNotFoundError()
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: pkg.amount_cents,
      currency: 'usd',
      metadata: {
        package_id: pkg.package_id,
        user_id: session.userId,
      },
    })

    if (!paymentIntent.client_secret) {
      throw new Error('Stripe did not return a client secret for the payment intent.')
    }

    return { client_secret: paymentIntent.client_secret }
  }

  async handleWebhook(
    rawBody: string,
    signature: string,
    webhookSecret: string,
  ): Promise<void> {
    let event: Stripe.Event
    try {
      event = await this.stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret,
      )
    } catch (error) {
      throw new PaymentWebhookSignatureError(
        error instanceof Error ? error.message : 'Unknown signature verification error.',
      )
    }

    if (event.type === 'payment_intent.succeeded') {
      await this.handlePaymentIntentSucceeded(event)
      return
    }

    if (event.type === 'payment_intent.payment_failed') {
      this.handlePaymentIntentFailed(event)
      return
    }

    // Acknowledge all other recognized event types without action.
  }

  private async handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    const packageId = paymentIntent.metadata.package_id
    const userId = paymentIntent.metadata.user_id
    const stripePaymentIntentId = paymentIntent.id

    if (!packageId || !userId) {
      this.logger.error('payment_intent.succeeded.missing_metadata', { stripePaymentIntentId })
      return
    }

    const pkg = this.packages.find(function matchId(p) { return p.package_id === packageId })

    if (!pkg) {
      this.logger.error('payment_intent.succeeded.unknown_package', { stripePaymentIntentId, packageId })
      return
    }

    try {
      await this.creditService.grantCredits({
        userId,
        amount: paymentIntent.amount_received,
        creditsGranted: pkg.credits_granted,
        stripePaymentIntentId,
      })
      this.logger.info('payment_intent.succeeded.credits_granted', { stripePaymentIntentId, userId, creditsGranted: pkg.credits_granted })
    } catch (error) {
      if (error instanceof CreditIdempotencyConflictError) {
        this.logger.info('payment_intent.succeeded.idempotent_duplicate', { stripePaymentIntentId })
        return
      }
      throw error
    }
  }

  private handlePaymentIntentFailed(event: Stripe.Event): void {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    this.logger.error('payment_intent.payment_failed', {
      stripePaymentIntentId: paymentIntent.id,
      userId: paymentIntent.metadata.user_id,
    })
  }
}
