import { describe, expect, it } from 'vitest'
import {
  cancelInterviewParamsSchema,
  cancelInterviewResponseSchema,
  createInterviewRequestSchema,
  createInterviewResponseSchema,
  defaultInterviewListLimit,
  interviewDetailResponseSchema,
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
    expect(parsed.interviews[0]).not.toHaveProperty('realtime_session_id')
    expect(parsed.interviews[0]).not.toHaveProperty('excalidraw_room_id')
    expect(parsed.interviews[0]).not.toHaveProperty('excalidraw_key')
    expect(parsed.interviews[0]).not.toHaveProperty('recording_url')
    expect(parsed.interviews[0]).not.toHaveProperty('screenshot_urls')
    expect(parsed.interviews[0]).not.toHaveProperty('feedback')
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

  it('parses scheduled_at with explicit UTC offset (+00:00)', function run() {
    const payload = createInterviewRequestSchema.parse({
      type: 'coding',
      mode: 'ai_led',
      scheduled_at: '2026-04-10T10:30:00.000+00:00',
    })

    expect(payload.scheduled_at).toBe('2026-04-10T10:30:00.000+00:00')
  })

  it('parses scheduled_at with explicit negative UTC offset', function run() {
    const payload = createInterviewRequestSchema.parse({
      type: 'coding',
      mode: 'ai_led',
      scheduled_at: '2026-04-10T10:30:00.000-05:00',
    })

    expect(payload.scheduled_at).toBe('2026-04-10T10:30:00.000-05:00')
  })

  it('parses interview response with explicit UTC offset in scheduled_at', function run() {
    const payload = interviewListResponseSchema.parse({
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
          scheduled_at: '2026-04-10T10:30:00.000+00:00',
          created_at: '2026-04-01T10:00:00.000Z',
          updated_at: '2026-04-01T10:00:00.000Z',
        },
      ],
    })

    expect(payload.interviews[0]?.scheduled_at).toBe('2026-04-10T10:30:00.000+00:00')
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
        realtime_session_id: null,
        excalidraw_room_id: null,
        excalidraw_key: null,
        recording_url: null,
        screenshot_urls: null,
        feedback: null,
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
      },
    })

    expect(payload.interview.mode).toBe('ai_led')
  })

  it('strips collaboration credential fields from create responses', function run() {
    const parsed = createInterviewResponseSchema.parse({
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
        realtime_session_id: 'sess_abc123',
        excalidraw_room_id: 'room_def456',
        excalidraw_key: 'key_ghi789',
        recording_url: null,
        screenshot_urls: null,
        feedback: null,
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
      },
    })

    expect(parsed.interview).not.toHaveProperty('realtime_session_id')
    expect(parsed.interview).not.toHaveProperty('excalidraw_room_id')
    expect(parsed.interview).not.toHaveProperty('excalidraw_key')
  })

  it('parses create response with timestamptz offset in created_at and updated_at', function run() {
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
        realtime_session_id: null,
        excalidraw_room_id: null,
        excalidraw_key: null,
        recording_url: null,
        screenshot_urls: null,
        feedback: null,
        created_at: '2026-04-01T10:00:00.000+00:00',
        updated_at: '2026-04-01T10:00:00.000-05:00',
      },
    })

    expect(payload.interview.created_at).toBe('2026-04-01T10:00:00.000+00:00')
    expect(payload.interview.updated_at).toBe('2026-04-01T10:00:00.000-05:00')
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

  it('parses interview detail response with non-credential detail fields populated', function run() {
    const payload = {
      interview: {
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
        recording_url: 'https://r2.example.com/recording.mp4',
        screenshot_urls: ['https://r2.example.com/ss1.png', 'https://r2.example.com/ss2.png'],
        feedback: {
          overall_score: 85,
          strengths: ['Good communication'],
          improvements: ['System design depth'],
        },
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
      },
    }

    const parsed = interviewDetailResponseSchema.parse(payload)

    expect(parsed.interview).not.toHaveProperty('realtime_session_id')
    expect(parsed.interview).not.toHaveProperty('excalidraw_room_id')
    expect(parsed.interview).not.toHaveProperty('excalidraw_key')
    expect(parsed.interview.recording_url).toBe('https://r2.example.com/recording.mp4')
    expect(parsed.interview.screenshot_urls).toEqual([
      'https://r2.example.com/ss1.png',
      'https://r2.example.com/ss2.png',
    ])
    expect(parsed.interview.feedback).toEqual({
      overall_score: 85,
      strengths: ['Good communication'],
      improvements: ['System design depth'],
    })
  })

  it('parses created_at and updated_at with explicit UTC offset matching Postgres timestamptz', function run() {
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
          created_at: '2026-04-01T10:00:00.000+00:00',
          updated_at: '2026-04-01T10:00:00.000-05:00',
        },
      ],
    }

    const parsed = interviewListResponseSchema.parse(payload)

    expect(parsed.interviews[0]?.created_at).toBe('2026-04-01T10:00:00.000+00:00')
    expect(parsed.interviews[0]?.updated_at).toBe('2026-04-01T10:00:00.000-05:00')
  })

  it('parses interview list items without optional session fields', function run() {
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

    expect(parsed.interviews[0]).not.toHaveProperty('realtime_session_id')
    expect(parsed.interviews[0]).not.toHaveProperty('excalidraw_room_id')
    expect(parsed.interviews[0]).not.toHaveProperty('excalidraw_key')
    expect(parsed.interviews[0]).not.toHaveProperty('recording_url')
    expect(parsed.interviews[0]).not.toHaveProperty('screenshot_urls')
    expect(parsed.interviews[0]).not.toHaveProperty('feedback')
  })

  it('rejects non-object feedback payloads in detail response while allowing null and object', function run() {
    expect(function parseInvalidPayload() {
      interviewDetailResponseSchema.parse({
        interview: {
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
          recording_url: null,
          screenshot_urls: null,
          feedback: 'not-an-object',
          created_at: '2026-04-01T10:00:00.000Z',
          updated_at: '2026-04-01T10:00:00.000Z',
        },
      })
    }).toThrow()
  })


  it('rejects feedback objects with non-json-serializable values', function run() {
    expect(function parseInvalidPayload() {
      interviewDetailResponseSchema.parse({
        interview: {
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
          recording_url: null,
          screenshot_urls: null,
          feedback: {
            strengths: ['Good communication'],
            callback: function callback() {
              return 'not-json'
            },
          },
          created_at: '2026-04-01T10:00:00.000Z',
          updated_at: '2026-04-01T10:00:00.000Z',
        },
      })
    }).toThrow()
  })
})
