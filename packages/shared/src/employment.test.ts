import { describe, expect, it } from 'vitest'
import {
  employmentHistorySnapshotReadSchema,
  employmentHistorySnapshotSchema,
  employmentRecordCompatibilityResponseSchema,
  employmentRecordInputSchema,
  employmentRecordSchema,
} from './employment'

const companyUuid = '11111111-1111-4111-8111-111111111111'
const userIdUuid = '22222222-2222-4222-8222-222222222222'

describe('employment shared contracts', function employmentSharedContractsSuite() {
  it('normalizes company to lowercase and trims whitespace', function run() {
    const payload = employmentRecordInputSchema.parse({
      company: '  Acme Corp  ',
      role: 'Engineer',
      start: '2026-01-01',
      end: null,
    })

    expect(payload.company).toBe('acme corp')
    expect(payload.role).toBe('Engineer')
  })

  it('rejects blank role', function run() {
    expect(function parseInvalidPayload() {
      employmentRecordInputSchema.parse({
        company: 'acme corp',
        role: '   ',
        start: '2026-01-01',
        end: null,
      })
    }).toThrow()
  })

  it('rejects missing company', function run() {
    expect(function parseInvalidPayload() {
      employmentRecordInputSchema.parse({
        company: '   ',
        role: 'Engineer',
        start: '2026-01-01',
        end: null,
      })
    }).toThrow()
  })

  it('parses current employment with end null', function run() {
    const payload = employmentRecordInputSchema.parse({
      company: 'acme corp',
      role: 'Engineer',
      start: '2026-01-01',
      end: null,
    })

    expect(payload.end).toBeNull()
  })

  it('parses completed employment with end date', function run() {
    const payload = employmentRecordInputSchema.parse({
      company: 'acme corp',
      role: 'Engineer',
      start: '2026-01-01',
      end: '2026-06-01',
    })

    expect(payload.end).toBe('2026-06-01')
  })

  it('rejects end date before start date', function run() {
    expect(function parseInvalidPayload() {
      employmentRecordInputSchema.parse({
        company: 'acme corp',
        role: 'Engineer',
        start: '2026-06-01',
        end: '2026-01-01',
      })
    }).toThrow()
  })

  it('accepts end date equal to start date', function run() {
    const payload = employmentRecordInputSchema.parse({
      company: 'acme corp',
      role: 'Engineer',
      start: '2026-01-01',
      end: '2026-01-01',
    })

    expect(payload.end).toBe('2026-01-01')
  })

  it('rejects unknown fields in strict mode', function run() {
    expect(function parseInvalidPayload() {
      employmentRecordInputSchema.parse({
        company: 'acme corp',
        role: 'Engineer',
        start: '2026-01-01',
        end: null,
        joined: '2026-01-01T00:00:00.000Z',
      })
    }).toThrow()
  })

  it('parses canonical employment record with correct field types', function run() {
    const payload = employmentRecordSchema.parse({
      id: companyUuid,
      userId: userIdUuid,
      company: 'acme corp',
      role: 'Engineer',
      start: '2026-01-01',
      end: '2026-06-01',
      isComplete: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(payload.id).toBe(companyUuid)
    expect(payload.userId).toBe(userIdUuid)
    expect(payload.company).toBe('acme corp')
    expect(payload.role).toBe('Engineer')
    expect(payload.start).toBe('2026-01-01')
    expect(payload.end).toBe('2026-06-01')
    expect(payload.isComplete).toBe(true)
    expect(payload.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(payload.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('allows null role on canonical employment record', function run() {
    const payload = employmentRecordSchema.parse({
      id: companyUuid,
      userId: userIdUuid,
      company: 'acme corp',
      role: null,
      start: '2026-01-01',
      end: null,
      isComplete: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(payload.role).toBeNull()
    expect(payload.isComplete).toBe(false)
  })

  it('rejects canonical record with non-boolean isComplete', function run() {
    expect(function parseInvalidPayload() {
      employmentRecordSchema.parse({
        id: companyUuid,
        userId: userIdUuid,
        company: 'acme corp',
        role: 'Engineer',
        start: '2026-01-01',
        end: null,
        isComplete: 'yes',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
    }).toThrow()
  })

  it('parses compatibility response with required non-null joined field', function run() {
    const payload = employmentRecordCompatibilityResponseSchema.parse({
      id: companyUuid,
      userId: userIdUuid,
      company: 'acme corp',
      role: 'Engineer',
      start: '2026-01-01',
      end: null,
      isComplete: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      joined: '2026-01-01T00:00:00.000Z',
    })

    expect(payload.joined).toBe('2026-01-01T00:00:00.000Z')
  })

  it('rejects compatibility response missing joined field', function run() {
    expect(function parseInvalidPayload() {
      employmentRecordCompatibilityResponseSchema.parse({
        id: companyUuid,
        userId: userIdUuid,
        company: 'acme corp',
        role: 'Engineer',
        start: '2026-01-01',
        end: null,
        isComplete: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
    }).toThrow()
  })

  it('requires non-null sourceCompanyId UUID on new submission snapshot', function run() {
    const payload = employmentHistorySnapshotSchema.parse({
      sourceCompanyId: companyUuid,
      company: 'acme corp',
      role: 'Engineer',
      start: '2026-01-01',
      end: null,
    })

    expect(payload.sourceCompanyId).toBe(companyUuid)
  })

  it('rejects null sourceCompanyId on new submission snapshot', function run() {
    expect(function parseInvalidPayload() {
      employmentHistorySnapshotSchema.parse({
        sourceCompanyId: null,
        company: 'acme corp',
        role: 'Engineer',
        start: '2026-01-01',
        end: null,
      })
    }).toThrow()
  })

  it('accepts null sourceCompanyId on legacy-compatible read snapshot', function run() {
    const payload = employmentHistorySnapshotReadSchema.parse({
      sourceCompanyId: null,
      company: 'acme corp',
      role: 'Engineer',
      start: '2026-01-01',
      end: null,
    })

    expect(payload.sourceCompanyId).toBeNull()
  })

  it('accepts non-null sourceCompanyId on legacy-compatible read snapshot', function run() {
    const payload = employmentHistorySnapshotReadSchema.parse({
      sourceCompanyId: companyUuid,
      company: 'acme corp',
      role: 'Engineer',
      start: '2026-01-01',
      end: null,
    })

    expect(payload.sourceCompanyId).toBe(companyUuid)
  })

  it('rejects non-YYYY-MM-DD start date string', function run() {
    expect(function parseInvalidPayload() {
      employmentRecordInputSchema.parse({
        company: 'acme corp',
        role: 'Engineer',
        start: '2026/01/01',
        end: null,
      })
    }).toThrow()
  })

  it('rejects malformed date-only string', function run() {
    expect(function parseInvalidPayload() {
      employmentRecordInputSchema.parse({
        company: 'acme corp',
        role: 'Engineer',
        start: '2026-1-1',
        end: null,
      })
    }).toThrow()
  })

  it('rejects non-date end value', function run() {
    expect(function parseInvalidPayload() {
      employmentRecordInputSchema.parse({
        company: 'acme corp',
        role: 'Engineer',
        start: '2026-01-01',
        end: 'not-a-date',
      })
    }).toThrow()
  })
})
