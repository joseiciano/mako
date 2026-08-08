import { describe, expect, it } from 'vitest'
import {
  interviewFeedbackV1Schema,
  feedbackDimensionSchema,
  feedbackStrengthSchema,
  feedbackImprovementSchema,
  feedbackStatusSchema,
  feedbackUnavailableReasonSchema,
  feedbackErrorCodeSchema,
  recordingStatusSchema,
  artifactKindSchema,
  artifactAvailabilitySchema,
  interviewFeedbackStatusResponseSchema,
  interviewDetailSchema,
  interviewListItemSchema,
} from '../interviews'

describe('interviewFeedbackV1Schema', function feedbackV1Suite() {
  const validFeedback = {
    schema_version: 1,
    overall_score: 85,
    summary: 'Strong performance with good communication and solid technical depth.',
    dimensions: {
      communication: {
        score: 90,
        summary: 'Clear and concise explanations throughout the session.',
      },
      problem_solving: {
        score: 82,
        summary: 'Methodical approach to breaking down the system design problem.',
      },
      technical_depth: {
        score: 83,
        summary: 'Good understanding of caching and database scaling tradeoffs.',
      },
    },
    strengths: [
      {
        title: 'Structured problem decomposition',
        evidence: 'Candidate broke the system into load balancer, API, and storage layers within the first 5 minutes.',
      },
    ],
    improvements: [
      {
        title: 'Cache invalidation strategy',
        evidence: 'Candidate did not address cache invalidation between services A and B.',
        action: 'Practice cache-aside and write-through patterns for distributed systems.',
      },
    ],
  }

  it('accepts a complete valid feedback v1 payload', function run() {
    const result = interviewFeedbackV1Schema.parse(validFeedback)
    expect(result.overall_score).toBe(85)
    expect(result.dimensions.communication.score).toBe(90)
    expect(result.strengths).toHaveLength(1)
    expect(result.improvements).toHaveLength(1)
  })

  it('rejects unknown keys at the top level', function run() {
    expect(() =>
      interviewFeedbackV1Schema.parse({ ...validFeedback, unknown_field: 'bad' }),
    ).toThrow()
  })

  it('rejects unknown keys in dimensions', function run() {
    expect(() =>
      interviewFeedbackV1Schema.parse({
        ...validFeedback,
        dimensions: {
          ...validFeedback.dimensions,
          extra_dimension: { score: 50, summary: 'extra' },
        },
      }),
    ).toThrow()
  })

  it('rejects missing evidence in strengths', function run() {
    expect(() =>
      interviewFeedbackV1Schema.parse({
        ...validFeedback,
        strengths: [{ title: 'Good thing' }],
      }),
    ).toThrow()
  })

  it('rejects missing action in improvements', function run() {
    expect(() =>
      interviewFeedbackV1Schema.parse({
        ...validFeedback,
        improvements: [{ title: 'Bad thing', evidence: 'proof' }],
      }),
    ).toThrow()
  })

  it('rejects out-of-range scores', function run() {
    expect(() =>
      interviewFeedbackV1Schema.parse({ ...validFeedback, overall_score: 101 }),
    ).toThrow()
    expect(() =>
      interviewFeedbackV1Schema.parse({ ...validFeedback, overall_score: -1 }),
    ).toThrow()
  })

  it('rejects out-of-range dimension scores', function run() {
    expect(() =>
      interviewFeedbackV1Schema.parse({
        ...validFeedback,
        dimensions: {
          ...validFeedback.dimensions,
          communication: { score: 101, summary: 'too high' },
        },
      }),
    ).toThrow()
  })

  it('rejects unsupported schema versions', function run() {
    expect(() =>
      interviewFeedbackV1Schema.parse({ ...validFeedback, schema_version: 2 }),
    ).toThrow()
  })

  it('accepts empty strengths and improvements arrays', function run() {
    const result = interviewFeedbackV1Schema.parse({
      ...validFeedback,
      strengths: [],
      improvements: [],
    })
    expect(result.strengths).toHaveLength(0)
    expect(result.improvements).toHaveLength(0)
  })

  it('rejects excessively large arrays', function run() {
    const tooManyStrengths = Array.from({ length: 21 }, function makeStrength(_, i) {
      return { title: `Strength ${i}`, evidence: `Evidence ${i}` }
    })
    expect(() =>
      interviewFeedbackV1Schema.parse({ ...validFeedback, strengths: tooManyStrengths }),
    ).toThrow()
  })
})

describe('feedbackDimensionSchema', function dimensionSuite() {
  it('accepts valid dimension', function run() {
    expect(feedbackDimensionSchema.parse({ score: 75, summary: 'Good.' })).toMatchObject({
      score: 75,
      summary: 'Good.',
    })
  })

  it('rejects unknown keys', function run() {
    expect(() =>
      feedbackDimensionSchema.parse({ score: 75, summary: 'Good.', extra: 'bad' }),
    ).toThrow()
  })

  it('rejects non-integer scores', function run() {
    expect(() => feedbackDimensionSchema.parse({ score: 75.5, summary: 'Good.' })).toThrow()
  })
})

describe('feedbackStrengthSchema', function strengthSuite() {
  it('accepts valid strength', function run() {
    expect(feedbackStrengthSchema.parse({ title: 'Title', evidence: 'Evidence' })).toMatchObject({
      title: 'Title',
      evidence: 'Evidence',
    })
  })

  it('rejects missing evidence', function run() {
    expect(() => feedbackStrengthSchema.parse({ title: 'Title' })).toThrow()
  })
})

describe('feedbackImprovementSchema', function improvementSuite() {
  it('accepts valid improvement', function run() {
    expect(
      feedbackImprovementSchema.parse({ title: 'Title', evidence: 'Evidence', action: 'Action' }),
    ).toMatchObject({ title: 'Title', evidence: 'Evidence', action: 'Action' })
  })

  it('rejects missing action', function run() {
    expect(() =>
      feedbackImprovementSchema.parse({ title: 'Title', evidence: 'Evidence' }),
    ).toThrow()
  })
})

describe('processing state schemas', function processingStateSuite() {
  it('feedbackStatusSchema accepts all documented values', function run() {
    for (const status of ['not_started', 'pending', 'processing', 'ready', 'failed'] as const) {
      expect(feedbackStatusSchema.parse(status)).toBe(status)
    }
  })

  it('feedbackStatusSchema rejects unknown values', function run() {
    expect(() => feedbackStatusSchema.parse('unknown')).toThrow()
  })

  it('recordingStatusSchema accepts all documented values', function run() {
    for (const status of ['not_started', 'pending', 'recording', 'processing', 'ready', 'failed'] as const) {
      expect(recordingStatusSchema.parse(status)).toBe(status)
    }
  })

  it('feedbackUnavailableReasonSchema accepts all documented values', function run() {
    for (const reason of ['no_consent', 'unsupported_format', 'no_recording'] as const) {
      expect(feedbackUnavailableReasonSchema.parse(reason)).toBe(reason)
    }
  })

  it('feedbackErrorCodeSchema accepts all documented values', function run() {
    for (const code of ['assets_not_ready', 'transcription_failed', 'analysis_failed', 'invalid_feedback', 'internal_error'] as const) {
      expect(feedbackErrorCodeSchema.parse(code)).toBe(code)
    }
  })

  it('artifactKindSchema accepts all documented values', function run() {
    for (const kind of ['playback_recording', 'transcription_audio', 'screenshot'] as const) {
      expect(artifactKindSchema.parse(kind)).toBe(kind)
    }
  })

  it('artifactAvailabilitySchema accepts all documented values', function run() {
    for (const avail of ['not_created', 'processing', 'expired', 'failed'] as const) {
      expect(artifactAvailabilitySchema.parse(avail)).toBe(avail)
    }
  })
})

describe('interviewFeedbackStatusResponseSchema', function statusResponseSuite() {
  it('accepts a valid ready status response', function run() {
    const result = interviewFeedbackStatusResponseSchema.parse({
      feedback_status: 'ready',
      feedback_unavailable_reason: null,
      feedback_error_code: null,
      schema_version: 1,
      prompt_version: 'system-design-feedback-v1',
      updated_at: '2026-08-07T12:00:00.000Z',
    })
    expect(result.feedback_status).toBe('ready')
  })

  it('accepts a not_started status with unavailable reason', function run() {
    const result = interviewFeedbackStatusResponseSchema.parse({
      feedback_status: 'not_started',
      feedback_unavailable_reason: 'no_consent',
      feedback_error_code: null,
      schema_version: null,
      prompt_version: null,
      updated_at: '2026-08-07T12:00:00.000Z',
    })
    expect(result.feedback_unavailable_reason).toBe('no_consent')
  })

  it('accepts a failed status with error code', function run() {
    const result = interviewFeedbackStatusResponseSchema.parse({
      feedback_status: 'failed',
      feedback_unavailable_reason: null,
      feedback_error_code: 'analysis_failed',
      schema_version: null,
      prompt_version: null,
      updated_at: '2026-08-07T12:00:00.000Z',
    })
    expect(result.feedback_error_code).toBe('analysis_failed')
  })

  it('rejects unknown keys', function run() {
    expect(() =>
      interviewFeedbackStatusResponseSchema.parse({
        feedback_status: 'ready',
        feedback_unavailable_reason: null,
        feedback_error_code: null,
        schema_version: 1,
        prompt_version: 'v1',
        updated_at: '2026-08-07T12:00:00.000Z',
        transcript: 'should not be here',
      }),
    ).toThrow()
  })
})

describe('interviewDetailSchema and interviewListItemSchema field exclusion', function exclusionSuite() {
  it('interviewDetailSchema includes feedback processing fields', function run() {
    const detailFields = Object.keys(interviewDetailSchema.shape)
    expect(detailFields).toContain('recording_status')
    expect(detailFields).toContain('transcript')
    expect(detailFields).toContain('feedback_status')
    expect(detailFields).toContain('feedback_unavailable_reason')
    expect(detailFields).toContain('feedback_error_code')
    expect(detailFields).toContain('feedback_prompt_version')
    expect(detailFields).toContain('feedback_generated_at')
  })

  it('interviewListItemSchema omits feedback processing and detail-only fields', function run() {
    const listFields = Object.keys(interviewListItemSchema.shape)
    expect(listFields).not.toContain('recording_status')
    expect(listFields).not.toContain('transcript')
    expect(listFields).not.toContain('feedback_status')
    expect(listFields).not.toContain('feedback_unavailable_reason')
    expect(listFields).not.toContain('feedback_error_code')
    expect(listFields).not.toContain('feedback_prompt_version')
    expect(listFields).not.toContain('feedback_generated_at')
    expect(listFields).not.toContain('recording_url')
    expect(listFields).not.toContain('screenshot_urls')
    expect(listFields).not.toContain('feedback')
  })
})

describe('interviewDetailSchema feedback boundary enforcement', function feedbackBoundarySuite() {
  // Base interview fields used across all detail-schema parse tests
  const baseDetailFields = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    scheduler_id: '550e8400-e29b-41d4-a716-446655440001',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'completed',
    scheduled_at: '2026-01-01T12:00:00.000Z',
    recording_url: null,
    screenshot_urls: null,
    started_at: '2026-01-01T12:00:00.000Z',
    expires_at: '2026-01-01T13:00:00.000Z',
    warning_at: '2026-01-01T12:55:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T13:00:00.000Z',
    recording_status: 'not_started',
    transcript: null,
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    screenshots_finalized_at: null,
  }

  const validV1Feedback = {
    schema_version: 1,
    overall_score: 85,
    summary: 'Strong performance with good communication and solid technical depth.',
    dimensions: {
      communication: {
        score: 90,
        summary: 'Clear and concise explanations throughout the session.',
      },
      problem_solving: {
        score: 82,
        summary: 'Methodical approach to breaking down the system design problem.',
      },
      technical_depth: {
        score: 83,
        summary: 'Good understanding of caching and database scaling tradeoffs.',
      },
    },
    strengths: [
      {
        title: 'Structured problem decomposition',
        evidence: 'Candidate broke the system into load balancer, API, and storage layers within the first 5 minutes.',
      },
    ],
    improvements: [
      {
        title: 'Cache invalidation strategy',
        evidence: 'Candidate did not address cache invalidation between services A and B.',
        action: 'Practice cache-aside and write-through patterns for distributed systems.',
      },
    ],
  }

  it('maps legacy freeform feedback JSON to null at the client-detail boundary', function run() {
    const legacyFeedback = {
      overall_score: 85,
      strengths: ['Good communication'],
      improvements: ['System design depth'],
    }

    const detail = interviewDetailSchema.parse({
      ...baseDetailFields,
      feedback: legacyFeedback,
    })

    expect(detail.feedback).toBeNull()
  })

  it('accepts valid v1 feedback at the client-detail boundary', function run() {
    const detail = interviewDetailSchema.parse({
      ...baseDetailFields,
      feedback: validV1Feedback,
      feedback_status: 'ready',
      feedback_prompt_version: 'system-design-feedback-v1',
      feedback_generated_at: '2026-08-07T12:00:00.000Z',
    })

    expect(detail.feedback).not.toBeNull()
    expect(detail.feedback?.schema_version).toBe(1)
    expect(detail.feedback?.overall_score).toBe(85)
  })

  it('maps null feedback to null', function run() {
    const detail = interviewDetailSchema.parse({
      ...baseDetailFields,
      feedback: null,
    })

    expect(detail.feedback).toBeNull()
  })

  it('interviewFeedbackV1Schema still rejects legacy freeform JSON', function run() {
    const legacyFeedback = {
      overall_score: 85,
      strengths: ['Good communication'],
      improvements: ['System design depth'],
    }

    expect(() => interviewFeedbackV1Schema.parse(legacyFeedback)).toThrow()
  })
})
