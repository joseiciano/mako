import { describe, expect, it } from 'vitest'
import {
  interviewerApplicationRequestSchema,
  interviewerApplicationSchema,
  interviewerApplicationStatusResponseSchema,
} from './interviewer-application'

const recordId1 = '11111111-1111-4111-8111-111111111111'
const recordId2 = '22222222-2222-4222-8222-222222222222'
const applicationId = '33333333-3333-4333-8333-333333333333'

const validApplication = {
  applicationId,
  email: 'applicant@mako.dev',
  employmentHistory: [
    {
      sourceCompanyId: recordId1,
      company: 'mako',
      role: 'backend engineer',
      start: '2024-01-01',
      end: null,
    },
  ],
  status: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('interviewerApplicationRequestSchema', function interviewerApplicationRequestSchemaSuite() {
  it('accepts a valid request with unique employment record ids', function run() {
    const payload = interviewerApplicationRequestSchema.parse({
      email: 'applicant@mako.dev',
      employmentRecordIds: [recordId1, recordId2],
    })

    expect(payload.email).toBe('applicant@mako.dev')
    expect(payload.employmentRecordIds).toEqual([recordId1, recordId2])
  })

  it('rejects an invalid email', function run() {
    expect(function parseInvalidPayload() {
      interviewerApplicationRequestSchema.parse({
        email: 'not-an-email',
        employmentRecordIds: [recordId1],
      })
    }).toThrow()
  })

  it('rejects an empty employment record list', function run() {
    expect(function parseInvalidPayload() {
      interviewerApplicationRequestSchema.parse({
        email: 'applicant@mako.dev',
        employmentRecordIds: [],
      })
    }).toThrow()
  })

  it('rejects more than ten employment record ids', function run() {
    const elevenIds = Array.from(
      { length: 11 },
      function makeId(_element: unknown, index: number) {
        return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
      },
    )

    expect(function parseInvalidPayload() {
      interviewerApplicationRequestSchema.parse({
        email: 'applicant@mako.dev',
        employmentRecordIds: elevenIds,
      })
    }).toThrow()
  })

  it('rejects duplicate employment record ids', function run() {
    expect(function parseInvalidPayload() {
      interviewerApplicationRequestSchema.parse({
        email: 'applicant@mako.dev',
        employmentRecordIds: [recordId1, recordId1],
      })
    }).toThrow()
  })

  it('rejects unknown fields in strict mode', function run() {
    expect(function parseInvalidPayload() {
      interviewerApplicationRequestSchema.parse({
        email: 'applicant@mako.dev',
        employmentRecordIds: [recordId1],
        extraField: 'unexpected',
      })
    }).toThrow()
  })
})

describe('interviewerApplicationSchema', function interviewerApplicationSchemaSuite() {
  it('accepts a valid application', function run() {
    const payload = interviewerApplicationSchema.parse(validApplication)

    expect(payload.applicationId).toBe(applicationId)
    expect(payload.email).toBe('applicant@mako.dev')
    expect(payload.status).toBe('pending')
    expect(payload.employmentHistory).toHaveLength(1)
  })

  it('rejects an invalid application status', function run() {
    expect(function parseInvalidPayload() {
      interviewerApplicationSchema.parse({
        ...validApplication,
        status: 'some-other-status',
      })
    }).toThrow()
  })
})

describe('interviewerApplicationStatusResponseSchema', function interviewerApplicationStatusResponseSchemaSuite() {
  it('accepts a null application', function run() {
    const payload = interviewerApplicationStatusResponseSchema.parse({
      application: null,
    })

    expect(payload.application).toBeNull()
  })

  it('accepts a valid application', function run() {
    const payload = interviewerApplicationStatusResponseSchema.parse({
      application: validApplication,
    })

    expect(payload.application?.applicationId).toBe(applicationId)
    expect(payload.application?.status).toBe('pending')
  })
})
