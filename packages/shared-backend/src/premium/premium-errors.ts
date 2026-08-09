import { z } from 'zod'

export type PremiumSession = {
  userId: string
  email: string
}

export class PremiumUnauthorizedError extends Error {
  constructor(message = 'You must be authenticated to access this resource.') {
    super(message)
    this.name = 'PremiumUnauthorizedError'
  }
}

export class PremiumForbiddenError extends Error {
  constructor(message = 'ACCOUNT_INACTIVE') {
    super(message)
    this.name = 'PremiumForbiddenError'
  }
}

export class PremiumValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PremiumValidationError'
  }
}

export class PremiumConflictError extends Error {
  constructor(message = 'The premium slot window conflicts with existing availability.') {
    super(message)
    this.name = 'PremiumConflictError'
  }
}

export class PremiumNotFoundError extends Error {
  constructor(message = 'Premium slot was not found for the active session.') {
    super(message)
    this.name = 'PremiumNotFoundError'
  }
}

export const authenticatedPremiumUserIdSchema = z.string().uuid()

export const premiumSlotIdSchema = z.string().uuid()

export class PremiumIdempotencyKeyConflictError extends Error {
  constructor(message = 'IDEMPOTENCY_KEY_CONFLICT') {
    super(message)
    this.name = 'PremiumIdempotencyKeyConflictError'
  }
}

export class PremiumSlotAlreadyClaimedError extends Error {
  constructor(message = 'PREMIUM_SLOT_ALREADY_CLAIMED') {
    super(message)
    this.name = 'PremiumSlotAlreadyClaimedError'
  }
}

export class PremiumInterviewerIneligibleError extends Error {
  constructor(message = 'PREMIUM_INTERVIEWER_INELIGIBLE') {
    super(message)
    this.name = 'PremiumInterviewerIneligibleError'
  }
}

export class PremiumSchedulingConflictError extends Error {
  constructor(message = 'PREMIUM_SCHEDULING_CONFLICT') {
    super(message)
    this.name = 'PremiumSchedulingConflictError'
  }
}

export class PremiumInsufficientCreditsError extends Error {
  constructor(message = 'INSUFFICIENT_CREDITS') {
    super(message)
    this.name = 'PremiumInsufficientCreditsError'
  }
}

export class PremiumSelfClaimError extends Error {
  constructor(message = 'Cannot claim your own premium slot.') {
    super(message)
    this.name = 'PremiumSelfClaimError'
  }
}

export class PremiumDataIntegrityError extends Error {
  constructor(message = 'PREMIUM_DATA_INTEGRITY') {
    super(message)
    this.name = 'PremiumDataIntegrityError'
  }
}
