import { describe, expect, it } from 'vitest'
import { AdminApplicationReviewService } from './admin-application-review-service'
import {
  AdminReviewConflictError,
  AdminReviewForbiddenError,
  AdminReviewNotFoundError,
} from './types'
import {
  adminId,
  applicantId,
  applicationId,
  buildDetailRow,
  createFakeRepository,
  createRecordingLogger,
  secondApplicationId,
} from './test-support'

function setup(rows = [buildDetailRow()]) {
  const { repository, state } = createFakeRepository(rows)
  const { logger, events } = createRecordingLogger()

  return { service: new AdminApplicationReviewService(repository, logger), state, events }
}

describe('AdminApplicationReviewService.listApplications', function () {
  it('defaults to pending, limit 25, offset 0 and omits detail-only fields', async function () {
    const { service } = setup()
    const response = await service.listApplications({})

    expect(response.pagination).toEqual({ limit: 25, offset: 0, hasMore: false })
    expect(response.applications).toHaveLength(1)
    expect(response.applications[0]).not.toHaveProperty('employmentHistory')
    expect(response.applications[0]).not.toHaveProperty('reviewedBy')
    expect(response.applications[0]?.applicant).toEqual({
      userId: applicantId,
      name: 'Ada Applicant',
      email: 'applicant@example.com',
      isAccountDeleted: false,
    })
  })

  it('filters by status and orders oldest-first with id tiebreak', async function () {
    const { service } = setup([
      buildDetailRow({ id: secondApplicationId, created_at: '2026-08-07T00:00:00.000Z' }),
      buildDetailRow({ id: applicationId, created_at: '2026-08-07T00:00:00.000Z' }),
      buildDetailRow({
        id: '55555555-5555-4555-8555-555555555555',
        created_at: '2026-08-01T00:00:00.000Z',
      }),
      buildDetailRow({
        id: '66666666-6666-4666-8666-666666666666',
        status: 'approved',
        reviewed_at: '2026-08-09T00:00:00.000Z',
      }),
    ])

    const pending = await service.listApplications({ status: 'pending' })
    expect(pending.applications.map((a) => a.applicationId)).toEqual([
      '55555555-5555-4555-8555-555555555555',
      applicationId,
      secondApplicationId,
    ])

    const approved = await service.listApplications({ status: 'approved' })
    expect(approved.applications).toHaveLength(1)
    expect(approved.applications[0]?.reviewedAt).toBe('2026-08-09T00:00:00.000Z')
  })

  it('computes hasMore with limit + 1 and honors offset', async function () {
    const { service } = setup([
      buildDetailRow({ id: applicationId, created_at: '2026-08-01T00:00:00.000Z' }),
      buildDetailRow({ id: secondApplicationId, created_at: '2026-08-02T00:00:00.000Z' }),
    ])

    const first = await service.listApplications({ limit: '1' })
    expect(first.applications).toHaveLength(1)
    expect(first.pagination).toEqual({ limit: 1, offset: 0, hasMore: true })

    const second = await service.listApplications({ limit: '1', offset: '1' })
    expect(second.applications[0]?.applicationId).toBe(secondApplicationId)
    expect(second.pagination.hasMore).toBe(false)

    const beyond = await service.listApplications({ offset: '50' })
    expect(beyond.applications).toEqual([])
  })

  it.each([
    { limit: '0' },
    { limit: '101' },
    { limit: 'ten' },
    { offset: '-1' },
    { offset: '1.5' },
    { status: 'nope' },
  ])('rejects invalid query %o', async function (query) {
    const { service } = setup()
    await expect(service.listApplications(query)).rejects.toMatchObject({ name: 'ZodError' })
  })
})

describe('AdminApplicationReviewService.getApplication', function () {
  it('returns detail with employment history and reviewer', async function () {
    const { service } = setup([
      buildDetailRow({
        status: 'approved',
        reviewed_by: adminId,
        reviewed_at: '2026-08-08T00:00:00.000Z',
        reviewer_name: 'Admin',
        reviewer_email: 'admin@example.com',
      }),
    ])
    const { application } = await service.getApplication(applicationId)

    expect(application.employmentHistory).toHaveLength(1)
    expect(application.reviewedBy).toEqual({
      userId: adminId,
      name: 'Admin',
      email: 'admin@example.com',
    })
  })

  it('throws not found for an unknown id and validation for a malformed id', async function () {
    const { service } = setup()
    await expect(service.getApplication(secondApplicationId)).rejects.toBeInstanceOf(
      AdminReviewNotFoundError,
    )
    await expect(service.getApplication('not-a-uuid')).rejects.toMatchObject({
      name: 'ZodError',
    })
  })
})

describe('AdminApplicationReviewService.decide', function () {
  const admin = { userId: adminId }

  it.each(['approved', 'rejected'] as const)('%s happy path attributes the admin', async function (decision) {
    const { service, state } = setup()
    const { application } = await service.decide(admin, applicationId, { decision })

    expect(application.status).toBe(decision)
    expect(application.reviewedBy?.userId).toBe(adminId)
    expect(application.reviewedBy?.userId).not.toBe(application.applicant.userId)
    expect(application.reviewedAt).not.toBeNull()
    expect(state.eligibleUserIds.has(applicantId)).toBe(decision === 'approved')
  })

  it('returns 403 semantics for self-review without mutation', async function () {
    const { service, state } = setup()
    await expect(
      service.decide({ userId: applicantId }, applicationId, { decision: 'approved' }),
    ).rejects.toBeInstanceOf(AdminReviewForbiddenError)
    expect(state.decideCalls).toHaveLength(0)
    expect(state.rows[0]?.status).toBe('pending')
  })

  it('throws not found for an unknown application', async function () {
    const { service } = setup()
    await expect(
      service.decide(admin, secondApplicationId, { decision: 'approved' }),
    ).rejects.toBeInstanceOf(AdminReviewNotFoundError)
  })

  it('conflicts on a non-pending application and first decision wins', async function () {
    const { service } = setup()
    await service.decide(admin, applicationId, { decision: 'approved' })

    await expect(
      service.decide(admin, applicationId, { decision: 'rejected' }),
    ).rejects.toBeInstanceOf(AdminReviewConflictError)
    await expect(
      service.decide(admin, applicationId, { decision: 'approved' }),
    ).rejects.toBeInstanceOf(AdminReviewConflictError)
  })

  it('blocks approval of a deleted applicant but allows rejection', async function () {
    const { service, state } = setup([buildDetailRow({ applicant_is_deleted: true })])

    await expect(
      service.decide(admin, applicationId, { decision: 'approved' }),
    ).rejects.toBeInstanceOf(AdminReviewConflictError)
    expect(state.rows[0]?.status).toBe('pending')
    expect(state.eligibleUserIds.size).toBe(0)

    const { application } = await service.decide(admin, applicationId, { decision: 'rejected' })
    expect(application.status).toBe('rejected')
    expect(application.applicant.isAccountDeleted).toBe(true)
    expect(state.eligibleUserIds.size).toBe(0)
  })

  it('rejects an invalid body or id before touching the repository', async function () {
    const { service, state } = setup()
    for (const body of [undefined, {}, { decision: 'pending' }, { decision: 'approved', x: 1 }]) {
      await expect(service.decide(admin, applicationId, body)).rejects.toMatchObject({
        name: 'ZodError',
      })
    }
    await expect(
      service.decide(admin, 'bad-id', { decision: 'approved' }),
    ).rejects.toMatchObject({ name: 'ZodError' })
    expect(state.decideCalls).toHaveLength(0)
  })

  it('retries 40001/40P01 up to three attempts total and then succeeds', async function () {
    const { service, state, events } = setup()
    let calls = 0
    const realDecide = state.decideImpl
    state.decideImpl = async (input) => {
      calls += 1
      if (calls === 1) throw Object.assign(new Error('serialization'), { code: '40001' })
      if (calls === 2) throw Object.assign(new Error('deadlock'), { code: '40P01' })
      state.decideImpl = realDecide
      return {
        outcome: 'decided',
        application: buildDetailRow({
          status: input.decision,
          reviewed_by: input.adminId,
          reviewed_at: '2026-08-08T00:00:00.000Z',
          reviewer_name: 'Admin',
          reviewer_email: 'admin@example.com',
        }),
      }
    }

    const { application } = await service.decide(admin, applicationId, { decision: 'approved' })
    expect(application.status).toBe('approved')
    expect(calls).toBe(3)
    expect(events.filter((e) => e.event === 'admin.application.decision.retry')).toHaveLength(2)
  })

  it('surfaces a deterministic conflict after three exhausted attempts', async function () {
    const { service, state, events } = setup()
    state.decideImpl = async () => {
      throw Object.assign(new Error('serialization'), { code: '40001' })
    }

    await expect(
      service.decide(admin, applicationId, { decision: 'approved' }),
    ).rejects.toBeInstanceOf(AdminReviewConflictError)
    expect(state.decideCalls).toHaveLength(3)
    expect(events.some((e) => e.event === 'admin.application.decision.retries_exhausted')).toBe(true)
  })

  it('does not retry non-retryable errors', async function () {
    const { service, state, events } = setup()
    state.decideImpl = async () => {
      throw Object.assign(new Error('boom'), { code: '23503' })
    }

    await expect(service.decide(admin, applicationId, { decision: 'approved' })).rejects.toThrow('boom')
    expect(state.decideCalls).toHaveLength(1)
    expect(events.some((e) => e.event === 'admin.application.decision.failed')).toBe(true)
  })

  it('emits lifecycle audit logs with ids and decision but no PII', async function () {
    const { service, events } = setup()
    await service.decide(admin, applicationId, { decision: 'approved' })
    await service
      .decide(admin, applicationId, { decision: 'rejected' })
      .catch(() => undefined)
    await service
      .decide({ userId: applicantId }, secondApplicationId, { decision: 'approved' })
      .catch(() => undefined)

    expect(events.map((e) => e.event)).toEqual(
      expect.arrayContaining([
        'admin.application.decision.requested',
        'admin.application.decision.succeeded',
        'admin.application.decision.conflicted',
        'admin.application.decision.failed',
      ]),
    )

    for (const entry of events) {
      expect(entry.context).toMatchObject({ applicationId: expect.any(String), adminId: expect.any(String) })
      expect(entry.context).toHaveProperty('decision')
    }

    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('applicant@example.com')
    expect(serialized).not.toContain('admin@example.com')
    expect(serialized).not.toContain('Engineer')
    expect(serialized).not.toContain('employment')
  })
})
