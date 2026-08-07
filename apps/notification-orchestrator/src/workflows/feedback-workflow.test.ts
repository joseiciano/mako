import { describe, expect, it } from 'vitest'
import { feedbackWorkflowPayloadSchema } from './feedback-workflow'

const VALID_PAYLOAD = {
  interview_id: '11111111-1111-4111-8111-111111111111',
  schema_version: 1,
}

describe('feedbackWorkflowPayloadSchema', function () {
  it('accepts a valid payload', function () {
    const parsed = feedbackWorkflowPayloadSchema.parse(VALID_PAYLOAD)

    expect(parsed).toEqual(VALID_PAYLOAD)
  })

  it('rejects a payload missing interview_id', function () {
    const { interview_id: _interviewId, ...missingInterviewId } = VALID_PAYLOAD

    const result = feedbackWorkflowPayloadSchema.safeParse(missingInterviewId)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1)
      expect(result.error.issues[0].path).toEqual(['interview_id'])
      expect(result.error.issues[0].message).toContain('Required')
    }
  })

  it('rejects a non-uuid interview_id', function () {
    const result = feedbackWorkflowPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      interview_id: 'not-a-uuid',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1)
      expect(result.error.issues[0].path).toEqual(['interview_id'])
      expect(result.error.issues[0].message).toContain('uuid')
    }
  })

  it('rejects a payload missing schema_version', function () {
    const { schema_version: _schemaVersion, ...missingSchemaVersion } = VALID_PAYLOAD

    const result = feedbackWorkflowPayloadSchema.safeParse(missingSchemaVersion)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1)
      expect(result.error.issues[0].path).toEqual(['schema_version'])
      expect(result.error.issues[0].message).toContain('Required')
    }
  })

  it('rejects a non-positive schema_version', function () {
    const result = feedbackWorkflowPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      schema_version: 0,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1)
      expect(result.error.issues[0].path).toEqual(['schema_version'])
      expect(result.error.issues[0].message).toContain('greater than 0')
    }
  })

  it('rejects unknown keys (strict)', function () {
    const result = feedbackWorkflowPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      unexpected_key: 'should not be allowed',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1)
      expect(result.error.issues[0].message).toContain('Unrecognized')
      expect(result.error.issues[0].message).toContain('unexpected_key')
    }
  })
})
