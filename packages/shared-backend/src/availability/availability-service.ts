import type { CreateAvailabilityRequest, CreateAvailabilityResponse } from '@mako/shared'
import { AvailabilityRepository } from './availability-repository'
import {
  AvailabilityBusinessRuleError,
  AvailabilityUnauthorizedError,
  authenticatedAvailabilityUserIdSchema,
  type AvailabilitySession,
} from './types'

export class AvailabilityService {
  constructor(
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly createId: () => string = defaultCreateId,
    private readonly now: () => string = defaultNow,
  ) {}

  async createAvailability(
    session: AvailabilitySession | null,
    input: CreateAvailabilityRequest,
  ): Promise<CreateAvailabilityResponse> {
    const userSession = this.requireSession(session)
    const userIdResult = authenticatedAvailabilityUserIdSchema.safeParse(userSession.userId)

    if (!userIdResult.success) {
      throw new AvailabilityUnauthorizedError()
    }

    const userId = userIdResult.data

    const duplicateWindow = this.findDuplicateSlotWindow(input.slots)

    if (duplicateWindow) {
      throw new AvailabilityBusinessRuleError(
        'Duplicate slot windows are not allowed in the same request.',
      )
    }

    const timestamp = this.now()
    const requestId = this.createId()

    const request = {
      id: requestId,
      user_id: userId,
      interview_type: input.interview_type,
      max_matches: input.max_matches,
      current_matches: 0,
      status: 'active' as const,
      created_at: timestamp,
      updated_at: timestamp,
    }

    const slots = input.slots.map((slot) => {
      return {
        id: this.createId(),
        request_id: requestId,
        start_time: slot.start_time,
        end_time: slot.end_time,
        status: 'available' as const,
        created_at: timestamp,
        updated_at: timestamp,
      }
    })

    const result = await this.availabilityRepository.createAvailability({ request, slots })

    return {
      request: result.request,
      slots: [...result.slots].sort(compareSlotOrder),
    }
  }

  private requireSession(session: AvailabilitySession | null): AvailabilitySession {
    if (!session) {
      throw new AvailabilityUnauthorizedError()
    }

    return session
  }

  private findDuplicateSlotWindow(
    slots: CreateAvailabilityRequest['slots'],
  ): { start_time: string; end_time: string } | null {
    const seen = new Set<string>()

    for (const slot of slots) {
      const startMs = new Date(slot.start_time).getTime()
      const endMs = new Date(slot.end_time).getTime()
      const key = `${startMs}\0${endMs}`

      if (seen.has(key)) {
        return { start_time: slot.start_time, end_time: slot.end_time }
      }

      seen.add(key)
    }

    return null
  }
}

function defaultCreateId(): string {
  return crypto.randomUUID()
}

function defaultNow(): string {
  return new Date().toISOString()
}

function compareSlotOrder(
  left: { start_time: string; id: string },
  right: { start_time: string; id: string },
): number {
  const leftTime = new Date(left.start_time).getTime()
  const rightTime = new Date(right.start_time).getTime()

  if (leftTime < rightTime) {
    return -1
  }

  if (leftTime > rightTime) {
    return 1
  }

  if (left.id < right.id) {
    return -1
  }

  if (left.id > right.id) {
    return 1
  }

  return 0
}
