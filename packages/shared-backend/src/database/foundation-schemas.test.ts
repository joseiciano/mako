import { describe, expect, it } from 'vitest'
import {
  interviewerApplicationRowSchema,
  interviewerApplicationStatusSchema,
  persistedEmploymentSnapshotEntrySchema,
} from './foundation-schemas'

describe('interviewerApplicationStatusSchema', function interviewerApplicationStatusSchemaSuite() {
  it('accepts pending, approved, and rejected', function acceptsValidStatuses() {
    for (const status of ['pending', 'approved', 'rejected'] as const) {
      expect(interviewerApplicationStatusSchema.safeParse(status).success).toBe(
        true,
      )
    }
  })

  it('rejects other strings', function rejectsInvalidStatuses() {
    for (const status of ['submitted', 'Pending', '', 'verified']) {
      expect(interviewerApplicationStatusSchema.safeParse(status).success).toBe(
        false,
      )
    }
  })
})

describe('persistedEmploymentSnapshotEntrySchema', function persistedEmploymentSnapshotEntrySchemaSuite() {
  const baseEntry = {
    sourceCompanyId: '7d0f0a5e-3c2b-4a1d-9e8f-6b5a4c3d2e1f',
    company: 'Acme Corp',
    role: 'Senior Engineer',
    start: '2020-01-15',
    end: '2022-06-30',
  }

  it('accepts a valid entry with a non-null sourceCompanyId', function acceptsValidEntry() {
    expect(
      persistedEmploymentSnapshotEntrySchema.safeParse(baseEntry).success,
    ).toBe(true)
  })

  it('accepts a null sourceCompanyId for legacy rows', function acceptsNullSourceCompanyId() {
    expect(
      persistedEmploymentSnapshotEntrySchema.safeParse({
        ...baseEntry,
        sourceCompanyId: null,
      }).success,
    ).toBe(true)
  })

  it('accepts a null end for current roles', function acceptsNullEnd() {
    expect(
      persistedEmploymentSnapshotEntrySchema.safeParse({
        ...baseEntry,
        end: null,
      }).success,
    ).toBe(true)
  })

  it('rejects a blank company', function rejectsBlankCompany() {
    expect(
      persistedEmploymentSnapshotEntrySchema.safeParse({
        ...baseEntry,
        company: '',
      }).success,
    ).toBe(false)
  })

  it('rejects a blank role', function rejectsBlankRole() {
    expect(
      persistedEmploymentSnapshotEntrySchema.safeParse({
        ...baseEntry,
        role: '',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid start dates', function rejectsInvalidStartDate() {
    expect(
      persistedEmploymentSnapshotEntrySchema.safeParse({
        ...baseEntry,
        start: 'not-a-date',
      }).success,
    ).toBe(false)
    expect(
      persistedEmploymentSnapshotEntrySchema.safeParse({
        ...baseEntry,
        start: '2020-1-15',
      }).success,
    ).toBe(false)
    expect(
      persistedEmploymentSnapshotEntrySchema.safeParse({
        ...baseEntry,
        start: '2020/01/15',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid end dates', function rejectsInvalidEndDate() {
    expect(
      persistedEmploymentSnapshotEntrySchema.safeParse({
        ...baseEntry,
        end: 'not-a-date',
      }).success,
    ).toBe(false)
  })

  it('accepts an end date before the start date at the schema level', function acceptsEndBeforeStart() {
    // end >= start is a business rule enforced at the application layer,
    // not by this persisted snapshot schema.
    expect(
      persistedEmploymentSnapshotEntrySchema.safeParse({
        ...baseEntry,
        start: '2022-06-30',
        end: '2020-01-15',
      }).success,
    ).toBe(true)
  })
})

describe('interviewerApplicationRowSchema', function interviewerApplicationRowSchemaSuite() {
  const baseRow = {
    id: '0f7e2b8a-9c4d-4e1f-a2b3-4c5d6e7f8a9b',
    user_id: '7d0f0a5e-3c2b-4a1d-9e8f-6b5a4c3d2e1f',
    email: 'applicant@example.com',
    employment_history: [
      {
        sourceCompanyId: 'c1b2a3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        company: 'Acme Corp',
        role: 'Senior Engineer',
        start: '2020-01-15',
        end: '2022-06-30',
      },
    ],
    status: 'pending',
    reviewed_by: null,
    created_at: '2026-08-07T13:00:00.000Z',
    updated_at: '2026-08-07T13:00:00.000Z',
  }

  it('accepts a valid row with all fields', function acceptsValidRow() {
    expect(interviewerApplicationRowSchema.safeParse(baseRow).success).toBe(
      true,
    )
  })

  it('accepts a null reviewed_by', function acceptsNullReviewedBy() {
    expect(
      interviewerApplicationRowSchema.safeParse({
        ...baseRow,
        reviewed_by: null,
      }).success,
    ).toBe(true)
  })

  it('accepts a populated reviewed_by', function acceptsPopulatedReviewedBy() {
    expect(
      interviewerApplicationRowSchema.safeParse({
        ...baseRow,
        reviewed_by: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      }).success,
    ).toBe(true)
  })

  it('rejects a non-array employment_history', function rejectsNonArrayEmploymentHistory() {
    expect(
      interviewerApplicationRowSchema.safeParse({
        ...baseRow,
        employment_history: { company: 'Acme Corp' },
      }).success,
    ).toBe(false)
  })

  it('rejects an invalid status', function rejectsInvalidStatus() {
    expect(
      interviewerApplicationRowSchema.safeParse({
        ...baseRow,
        status: 'submitted',
      }).success,
    ).toBe(false)
  })

  it('rejects an invalid email', function rejectsInvalidEmail() {
    expect(
      interviewerApplicationRowSchema.safeParse({
        ...baseRow,
        email: 'not-an-email',
      }).success,
    ).toBe(false)
  })

  it('rejects missing timestamps', function rejectsMissingTimestamps() {
    const { created_at: _createdAt, ...withoutCreatedAt } = baseRow
    expect(
      interviewerApplicationRowSchema.safeParse(withoutCreatedAt).success,
    ).toBe(false)

    const { updated_at: _updatedAt, ...withoutUpdatedAt } = baseRow
    expect(
      interviewerApplicationRowSchema.safeParse(withoutUpdatedAt).success,
    ).toBe(false)
  })

  it('accepts Date objects for timestamps', function acceptsDateTimestamps() {
    expect(
      interviewerApplicationRowSchema.safeParse({
        ...baseRow,
        created_at: new Date('2026-08-07T13:00:00.000Z'),
        updated_at: new Date('2026-08-07T13:00:00.000Z'),
      }).success,
    ).toBe(true)
  })
})
