import { describe, expect, it } from 'vitest'
import {
  cancelInterviewParamsSchema,
  cancelInterviewResponseSchema,
  createInterviewRequestSchema,
  createInterviewResponseSchema,
  defaultInterviewListLimit,
  interviewListQuerySchema,
  interviewListResponseSchema,
} from './interviews'

describe('interview shared contracts', function interviewSharedContractsSuite() {
  it('parses interview list payloads from documented API fields', function run() {
    const payload = {
      interviews: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          scheduler_id: '22222222-2222-4222-8222-222222222222',
          scheduler_alias: 'Candidate-Blue',
          interviewer_id: null,
          interviewer_alias: 'Interviewer-Red',
          type: 'system_design',
          mode: 'peer_to_peer',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
          created_at: '2026-04-01T10:00:00.000Z',
          updated_at: '2026-04-01T10:00:00.000Z',
        },
      ],
    }

    const parsed = interviewListResponseSchema.parse(payload)

    expect(parsed.interviews).toHaveLength(1)
    expect(parsed.interviews[0]?.scheduler_alias).toBe('Candidate-Blue')
  })

  it('rejects payloads missing alias/scheduling contract fields', function run() {
    expect(function parseInvalidPayload() {
      interviewListResponseSchema.parse({
        interviews: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            scheduler_id: '22222222-2222-4222-8222-222222222222',
            interviewer_id: null,
            type: 'system_design',
            mode: 'peer_to_peer',
            tier: 'standard',
            status: 'scheduled',
            scheduled_at: '2026-04-10T10:30:00.000Z',
            created_at: '2026-04-01T10:00:00.000Z',
            updated_at: '2026-04-01T10:00:00.000Z',
          },
        ],
      })
    }).toThrow()
  })

  it('parses interview list query params using documented defaults and coercion', function run() {
    const payload = interviewListQuerySchema.parse({
      status: 'scheduled',
      limit: '25',
      offset: '5',
    })

    expect(payload).toEqual({
      status: 'scheduled',
      limit: 25,
      offset: 5,
    })
  })

  it('defaults optional interview list query params when omitted', function run() {
    const payload = interviewListQuerySchema.parse({})

    expect(payload).toEqual({
      limit: defaultInterviewListLimit,
      offset: 0,
    })
  })

  it('rejects invalid interview list query params', function run() {
    expect(function parseInvalidPayload() {
      interviewListQuerySchema.parse({
        status: 'pending',
        limit: '',
      })
    }).toThrow()
  })

  it('parses accepted direct AI-led create payloads for quota-backed scheduling', function run() {
    const payload = createInterviewRequestSchema.parse({
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })

    expect(payload).toEqual({
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: 'now',
    })
  })

  it('parses accepted direct AI-led create payloads for scheduled sessions', function run() {
    const payload = createInterviewRequestSchema.parse({
      type: 'coding',
      mode: 'ai_led',
      scheduled_at: '2026-04-10T10:30:00.000Z',
    })

    expect(payload.scheduled_at).toBe('2026-04-10T10:30:00.000Z')
  })

  it('rejects unsupported direct peer-to-peer create payloads', function run() {
    expect(function parseInvalidPayload() {
      createInterviewRequestSchema.parse({
        type: 'behavioral',
        mode: 'peer_to_peer',
        scheduled_at: '2026-04-10T10:30:00.000Z',
      })
    }).toThrow()
  })

  it('rejects direct create payloads that try to set tier client-side', function run() {
    expect(function parseInvalidPayload() {
      createInterviewRequestSchema.parse({
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
        tier: 'premium',
      })
    }).toThrow()
  })

  it('rejects direct create payloads that try to provide interviewer_id', function run() {
    expect(function parseInvalidPayload() {
      createInterviewRequestSchema.parse({
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
        interviewer_id: '33333333-3333-4333-8333-333333333333',
      })
    }).toThrow()
  })

  it('parses create responses using the shared interview response contract', function run() {
    const payload = createInterviewResponseSchema.parse({
      interview: {
        id: '11111111-1111-4111-8111-111111111111',
        scheduler_id: '22222222-2222-4222-8222-222222222222',
        scheduler_alias: 'Candidate-Blue',
        interviewer_id: null,
        interviewer_alias: 'Interviewer-Red',
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-10T10:30:00.000Z',
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
      },
    })

    expect(payload.interview.mode).toBe('ai_led')
  })

  it('parses cancel route params using the shared contract', function run() {
    const payload = cancelInterviewParamsSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
    })

    expect(payload.id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('parses cancel route success responses using the shared contract', function run() {
    const payload = cancelInterviewResponseSchema.parse({
      success: true,
    })

    expect(payload.success).toBe(true)
  })
})
