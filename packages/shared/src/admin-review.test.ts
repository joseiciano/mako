import { describe, expect, it } from 'vitest'
import {
  adminApplicationDetailSchema,
  adminApplicationSummarySchema,
  adminDecisionBodySchema,
  adminListQuerySchema,
} from './admin-review'

const id = '11111111-1111-4111-8111-111111111111'
const applicant = { userId: id, name: 'Ada', email: 'ada@example.com', isAccountDeleted: false }

describe('admin review contracts', function () {
  it('applies list query defaults', function () {
    expect(adminListQuerySchema.parse({})).toEqual({ status: 'pending', limit: 25, offset: 0 })
  })

  it.each([
    { limit: '0' },
    { limit: '101' },
    { limit: 'abc' },
    { limit: '1.5' },
    { offset: '-1' },
    { offset: '1.2' },
    { offset: 'x' },
    { status: 'done' },
  ])('rejects invalid list query %o', function (query) {
    expect(adminListQuerySchema.safeParse(query).success).toBe(false)
  })

  it('accepts boundary limits', function () {
    expect(adminListQuerySchema.parse({ limit: '1' }).limit).toBe(1)
    expect(adminListQuerySchema.parse({ limit: '100', offset: '40' })).toMatchObject({
      limit: 100,
      offset: 40,
    })
  })

  it('decision body only allows approved or rejected', function () {
    expect(adminDecisionBodySchema.safeParse({ decision: 'approved' }).success).toBe(true)
    expect(adminDecisionBodySchema.safeParse({ decision: 'pending' }).success).toBe(false)
    expect(
      adminDecisionBodySchema.safeParse({ decision: 'approved', reason: 'x' }).success,
    ).toBe(false)
  })

  it('summary strips employmentHistory and reviewedBy', function () {
    const parsed = adminApplicationSummarySchema.parse({
      applicationId: id,
      applicant,
      status: 'pending',
      createdAt: '2026-08-07T00:00:00.000Z',
      reviewedAt: null,
      employmentHistory: [],
      reviewedBy: null,
    })
    expect(parsed).not.toHaveProperty('employmentHistory')
    expect(parsed).not.toHaveProperty('reviewedBy')
  })

  it('detail allows legacy null sourceCompanyId and nullable reviewer', function () {
    const parsed = adminApplicationDetailSchema.parse({
      applicationId: id,
      applicant,
      employmentHistory: [
        { sourceCompanyId: null, company: 'acme', role: 'Eng', start: '2020-01-01', end: null },
      ],
      status: 'approved',
      reviewedBy: { userId: id, name: 'Admin', email: 'admin@example.com' },
      createdAt: '2026-08-07T00:00:00.000Z',
      reviewedAt: '2026-08-08T00:00:00.000Z',
    })
    expect(parsed.reviewedBy?.name).toBe('Admin')
  })
})
