import {
  availabilityRequestSchema,
  availabilitySlotSchema,
  createAvailabilityResponseSchema,
  type AvailabilityRequest,
  type AvailabilitySlot,
  type CreateAvailabilityResponse,
} from '@mako/shared'
import { z } from 'zod'

export type AvailabilitySession = {
  userId: string
  email: string
}

export class AvailabilityUnauthorizedError extends Error {
  constructor(message = 'You must be authenticated to access this resource.') {
    super(message)
    this.name = 'AvailabilityUnauthorizedError'
  }
}


export class AvailabilityBusinessRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AvailabilityBusinessRuleError'
  }
}

export const authenticatedAvailabilityUserIdSchema = z.string().uuid()

export function parseAvailabilityRequest(input: unknown): AvailabilityRequest {
  return availabilityRequestSchema.parse(input)
}

export function parseAvailabilitySlot(input: unknown): AvailabilitySlot {
  return availabilitySlotSchema.parse(input)
}
