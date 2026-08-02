import { describe, expect, it, vi } from 'vitest'
import { CREDIT_PACKAGES } from './credit-packages'
import { PaymentService } from './payment-service'
import { CreditIdempotencyConflictError } from '../credit/types'
import {
  PaymentPackageNotFoundError,
  PaymentUnauthorizedError,
  PaymentWebhookSignatureError,
} from './types'
import type { CreditService } from '../credit/credit-service'
import type { Stripe } from 'stripe'

function createMockStripe(overrides: Partial<Stripe> = {}): Stripe {
  return {
    paymentIntents: { create: vi.fn() },
    webhooks: { constructEventAsync: vi.fn() },
    ...overrides,
  } as unknown as Stripe
}

function createMockCreditService(): CreditService {
  return { grantCredits: vi.fn() } as unknown as CreditService
}

const noopLogger = { info() {}, error() {} }
const session = { userId: 'user-123', email: 'a@b.com' }

describe('PaymentService', function paymentServiceSuite() {
  describe('listPackages', function listPackagesSuite() {
    it('returns all packages with correct shapes', function testListPackages() {
      const stripe = createMockStripe()
      const creditService = createMockCreditService()
      const service = new PaymentService(stripe, creditService, CREDIT_PACKAGES, noopLogger)

      const packages = service.listPackages()

      expect(packages).toHaveLength(3)
      expect(packages[0]).toEqual({
        package_id: 'credits_5',
        display_name: '5 Credits',
        amount_cents: 2500,
        credits_granted: 5,
      })
    })
  })

  describe('createPaymentIntent', function createPaymentIntentSuite() {
    it('throws PaymentUnauthorizedError when session is null', async function testUnauthorized() {
      const stripe = createMockStripe()
      const creditService = createMockCreditService()
      const service = new PaymentService(stripe, creditService, CREDIT_PACKAGES, noopLogger)

      await expect(service.createPaymentIntent(null, 'credits_5')).rejects.toBeInstanceOf(PaymentUnauthorizedError)
    })

    it('throws PaymentPackageNotFoundError for unknown package_id', async function testUnknownPackage() {
      const stripe = createMockStripe()
      const creditService = createMockCreditService()
      const service = new PaymentService(stripe, creditService, CREDIT_PACKAGES, noopLogger)

      await expect(service.createPaymentIntent(session, 'unknown')).rejects.toBeInstanceOf(PaymentPackageNotFoundError)
    })

    it('calls stripe.paymentIntents.create with correct amount, currency, and metadata', async function testCreateIntent() {
      const stripe = createMockStripe()
      const creditService = createMockCreditService()
      const service = new PaymentService(stripe, creditService, CREDIT_PACKAGES, noopLogger)

      const mockPaymentIntent = { id: 'pi_123', client_secret: 'secret_123' }
      vi.mocked(stripe.paymentIntents.create).mockResolvedValue(mockPaymentIntent as any)

      const result = await service.createPaymentIntent(session, 'credits_5')

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 2500,
        currency: 'usd',
        metadata: {
          package_id: 'credits_5',
          user_id: 'user-123',
        },
      })
      expect(result).toEqual({ client_secret: 'secret_123' })
    })
  })

  describe('handleWebhook', function handleWebhookSuite() {
    it('payment_intent.succeeded calls creditService.grantCredits with correct args', async function testSucceededGrantsCredits() {
      const stripe = createMockStripe()
      const creditService = createMockCreditService()
      const service = new PaymentService(stripe, creditService, CREDIT_PACKAGES, noopLogger)

      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_1',
            amount_received: 2500,
            metadata: { package_id: 'credits_5', user_id: 'user-123' },
          },
        },
      }
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue(event as unknown as Stripe.Event)

      await service.handleWebhook('raw-body', 'sig', 'whsec')

      expect(creditService.grantCredits).toHaveBeenCalledWith({
        userId: 'user-123',
        amount: 2500,
        creditsGranted: 5,
        stripePaymentIntentId: 'pi_1',
      })
    })

    it('idempotent duplicate does not rethrow and does not double-grant', async function testIdempotentDuplicate() {
      const stripe = createMockStripe()
      const creditService = createMockCreditService()
      const logger = { info: vi.fn(), error: vi.fn() }
      const service = new PaymentService(stripe, creditService, CREDIT_PACKAGES, logger)

      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_1',
            amount_received: 2500,
            metadata: { package_id: 'credits_5', user_id: 'user-123' },
          },
        },
      }
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue(event as unknown as Stripe.Event)
      vi.mocked(creditService.grantCredits).mockRejectedValue(new CreditIdempotencyConflictError())

      await service.handleWebhook('raw-body', 'sig', 'whsec')

      expect(creditService.grantCredits).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(
        'payment_intent.succeeded.idempotent_duplicate',
        { stripePaymentIntentId: 'pi_1' },
      )
    })

    it('missing metadata logs error and returns without granting', async function testMissingMetadata() {
      const stripe = createMockStripe()
      const creditService = createMockCreditService()
      const logger = { info: vi.fn(), error: vi.fn() }
      const service = new PaymentService(stripe, creditService, CREDIT_PACKAGES, logger)

      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_1',
            amount_received: 2500,
            metadata: {},
          },
        },
      }
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue(event as unknown as Stripe.Event)

      await service.handleWebhook('raw-body', 'sig', 'whsec')

      expect(creditService.grantCredits).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledWith(
        'payment_intent.succeeded.missing_metadata',
        { stripePaymentIntentId: 'pi_1' },
      )
    })

    it('unknown package logs error and returns without granting', async function testUnknownPackage() {
      const stripe = createMockStripe()
      const creditService = createMockCreditService()
      const logger = { info: vi.fn(), error: vi.fn() }
      const service = new PaymentService(stripe, creditService, CREDIT_PACKAGES, logger)

      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_1',
            amount_received: 2500,
            metadata: { package_id: 'unknown', user_id: 'user-123' },
          },
        },
      }
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue(event as unknown as Stripe.Event)

      await service.handleWebhook('raw-body', 'sig', 'whsec')

      expect(creditService.grantCredits).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledWith(
        'payment_intent.succeeded.unknown_package',
        { stripePaymentIntentId: 'pi_1', packageId: 'unknown' },
      )
    })

    it('payment_intent.payment_failed does not call grantCredits and logs error', async function testPaymentFailed() {
      const stripe = createMockStripe()
      const creditService = createMockCreditService()
      const logger = { info: vi.fn(), error: vi.fn() }
      const service = new PaymentService(stripe, creditService, CREDIT_PACKAGES, logger)

      const event = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_1',
            metadata: { user_id: 'user-123' },
          },
        },
      }
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue(event as unknown as Stripe.Event)

      await service.handleWebhook('raw-body', 'sig', 'whsec')

      expect(creditService.grantCredits).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledWith(
        'payment_intent.payment_failed',
        { stripePaymentIntentId: 'pi_1', userId: 'user-123' },
      )
    })

    it('invalid signature throws PaymentWebhookSignatureError', async function testInvalidSignature() {
      const stripe = createMockStripe()
      const creditService = createMockCreditService()
      const service = new PaymentService(stripe, creditService, CREDIT_PACKAGES, noopLogger)

      vi.mocked(stripe.webhooks.constructEventAsync).mockRejectedValue(new Error('bad signature'))

      await expect(service.handleWebhook('raw-body', 'sig', 'whsec')).rejects.toBeInstanceOf(PaymentWebhookSignatureError)
    })
  })
})
