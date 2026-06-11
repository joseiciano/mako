import { describe, expect, it } from 'vitest'
import {
  availabilityRequestSchema,
  availabilitySlotInputSchema,
  availabilitySlotSchema,
  createAvailabilityRequestSchema,
  createAvailabilityResponseSchema,
} from './availability'

describe('availability shared contracts', function availabilitySharedContractsSuite() {
  it('parses valid availability request with single slot', function run() {
    const payload = createAvailabilityRequestSchema.parse({
      interview_type: 'system_design',
      max_matches: 2,
      slots: [
        {
          start_time: '2026-04-10T10:00:00.000Z',
          end_time: '2026-04-10T11:00:00.000Z',
        },
      ],
    })

    expect(payload.interview_type).toBe('system_design')
    expect(payload.max_matches).toBe(2)
    expect(payload.slots).toHaveLength(1)
    expect(payload.slots[0]?.start_time).toBe('2026-04-10T10:00:00.000Z')
    expect(payload.slots[0]?.end_time).toBe('2026-04-10T11:00:00.000Z')
  })

  it('parses valid availability request with multiple slots', function run() {
    const payload = createAvailabilityRequestSchema.parse({
      interview_type: 'coding',
      max_matches: 1,
      slots: [
        {
          start_time: '2026-04-10T10:00:00.000Z',
          end_time: '2026-04-10T11:00:00.000Z',
        },
        {
          start_time: '2026-04-10T14:00:00.000Z',
          end_time: '2026-04-10T15:00:00.000Z',
        },
      ],
    })

    expect(payload.slots).toHaveLength(2)
  })

  it('rejects invalid interview_type', function run() {
    expect(function parseInvalidPayload() {
      createAvailabilityRequestSchema.parse({
        interview_type: 'invalid_type',
        max_matches: 1,
        slots: [
          {
            start_time: '2026-04-10T10:00:00.000Z',
            end_time: '2026-04-10T11:00:00.000Z',
          },
        ],
      })
    }).toThrow()
  })

  it('rejects non-positive max_matches', function run() {
    expect(function parseInvalidPayload() {
      createAvailabilityRequestSchema.parse({
        interview_type: 'system_design',
        max_matches: 0,
        slots: [
          {
            start_time: '2026-04-10T10:00:00.000Z',
            end_time: '2026-04-10T11:00:00.000Z',
          },
        ],
      })
    }).toThrow()
  })

  it('rejects empty slots array', function run() {
    expect(function parseInvalidPayload() {
      createAvailabilityRequestSchema.parse({
        interview_type: 'system_design',
        max_matches: 1,
        slots: [],
      })
    }).toThrow()
  })

  it('rejects slot shorter than 60 minutes', function run() {
    expect(function parseInvalidPayload() {
      createAvailabilityRequestSchema.parse({
        interview_type: 'system_design',
        max_matches: 1,
        slots: [
          {
            start_time: '2026-04-10T10:00:00.000Z',
            end_time: '2026-04-10T10:30:00.000Z',
          },
        ],
      })
    }).toThrow()
  })

  it('rejects slot longer than 60 minutes', function run() {
    expect(function parseInvalidPayload() {
      createAvailabilityRequestSchema.parse({
        interview_type: 'system_design',
        max_matches: 1,
        slots: [
          {
            start_time: '2026-04-10T10:00:00.000Z',
            end_time: '2026-04-10T12:00:00.000Z',
          },
        ],
      })
    }).toThrow()
  })

  it('rejects slot where start_time equals end_time', function run() {
    expect(function parseInvalidPayload() {
      createAvailabilityRequestSchema.parse({
        interview_type: 'system_design',
        max_matches: 1,
        slots: [
          {
            start_time: '2026-04-10T10:00:00.000Z',
            end_time: '2026-04-10T10:00:00.000Z',
          },
        ],
      })
    }).toThrow()
  })

  it('rejects slot where start_time is after end_time', function run() {
    expect(function parseInvalidPayload() {
      createAvailabilityRequestSchema.parse({
        interview_type: 'system_design',
        max_matches: 1,
        slots: [
          {
            start_time: '2026-04-10T11:00:00.000Z',
            end_time: '2026-04-10T10:00:00.000Z',
          },
        ],
      })
    }).toThrow()
  })

  it('rejects request with extra fields', function run() {
    expect(function parseInvalidPayload() {
      createAvailabilityRequestSchema.parse({
        interview_type: 'system_design',
        max_matches: 1,
        slots: [
          {
            start_time: '2026-04-10T10:00:00.000Z',
            end_time: '2026-04-10T11:00:00.000Z',
          },
        ],
        tier: 'premium',
      })
    }).toThrow()
  })

  it('parses create availability response', function run() {
    const payload = createAvailabilityResponseSchema.parse({
      request: {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        interview_type: 'system_design',
        max_matches: 2,
        current_matches: 0,
        status: 'active',
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
      },
      slots: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          request_id: '11111111-1111-4111-8111-111111111111',
          start_time: '2026-04-10T10:00:00.000Z',
          end_time: '2026-04-10T11:00:00.000Z',
          status: 'available',
          created_at: '2026-04-01T10:00:00.000Z',
          updated_at: '2026-04-01T10:00:00.000Z',
        },
      ],
    })

    expect(payload.request.status).toBe('active')
    expect(payload.slots).toHaveLength(1)
    expect(payload.slots[0]?.status).toBe('available')
  })

  it('rejects response with missing request fields', function run() {
    expect(function parseInvalidPayload() {
      createAvailabilityResponseSchema.parse({
        request: {
          id: '11111111-1111-4111-8111-111111111111',
          user_id: '22222222-2222-4222-8222-222222222222',
          interview_type: 'system_design',
          max_matches: 2,
          current_matches: 0,
          status: 'active',
          created_at: '2026-04-01T10:00:00.000Z',
        },
        slots: [],
      })
    }).toThrow()
  })

  it('rejects response with invalid slot status', function run() {
    expect(function parseInvalidPayload() {
      createAvailabilityResponseSchema.parse({
        request: {
          id: '11111111-1111-4111-8111-111111111111',
          user_id: '22222222-2222-4222-8222-222222222222',
          interview_type: 'system_design',
          max_matches: 2,
          current_matches: 0,
          status: 'active',
          created_at: '2026-04-01T10:00:00.000Z',
          updated_at: '2026-04-01T10:00:00.000Z',
        },
        slots: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            request_id: '11111111-1111-4111-8111-111111111111',
            start_time: '2026-04-10T10:00:00.000Z',
            end_time: '2026-04-10T11:00:00.000Z',
            status: 'pending',
            created_at: '2026-04-01T10:00:00.000Z',
            updated_at: '2026-04-01T10:00:00.000Z',
          },
        ],
      })
    }).toThrow()
  })

  it('parses slot input with explicit UTC offset', function run() {
    const payload = availabilitySlotInputSchema.parse({
      start_time: '2026-04-10T10:00:00.000+00:00',
      end_time: '2026-04-10T11:00:00.000+00:00',
    })

    expect(payload.start_time).toBe('2026-04-10T10:00:00.000+00:00')
    expect(payload.end_time).toBe('2026-04-10T11:00:00.000+00:00')
  })

  it('parses availability request schema independently', function run() {
    const payload = availabilityRequestSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      interview_type: 'behavioral',
      max_matches: 3,
      current_matches: 1,
      status: 'fulfilled',
      created_at: '2026-04-01T10:00:00.000Z',
      updated_at: '2026-04-01T10:00:00.000Z',
    })

    expect(payload.interview_type).toBe('behavioral')
    expect(payload.status).toBe('fulfilled')
  })

  it('parses availability slot schema independently', function run() {
    const payload = availabilitySlotSchema.parse({
      id: '33333333-3333-4333-8333-333333333333',
      request_id: '11111111-1111-4111-8111-111111111111',
      start_time: '2026-04-10T10:00:00.000Z',
      end_time: '2026-04-10T11:00:00.000Z',
      status: 'matched',
      created_at: '2026-04-01T10:00:00.000Z',
      updated_at: '2026-04-01T10:00:00.000Z',
    })

    expect(payload.status).toBe('matched')
  })
})