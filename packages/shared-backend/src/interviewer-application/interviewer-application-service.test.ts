import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { InterviewerApplicationRepository } from './interviewer-application-repository'
import { InterviewerApplicationService } from './interviewer-application-service'
import {
  InterviewerApplicationConflictError,
  InterviewerApplicationForbiddenError,
  InterviewerApplicationUnauthorizedError,
  type InterviewerApplicationSession,
} from './types'

const activeSession: InterviewerApplicationSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@mako.dev',
}

const applicationId = '22222222-2222-4222-8222-222222222222'
const companyId = '33333333-3333-4333-8333-333333333333'

describe('InterviewerApplicationService', function suite() {
  describe('submitApplication', function submitSuite() {
    it('returns the created application with contact email', async function run() {
      const service = createService()

      const result = await service.submitApplication(activeSession, {
        email: 'contact@example.com',
        employmentRecordIds: [companyId],
      })

      expect(result.applicationId).toBe(applicationId)
      expect(result.email).toBe('contact@example.com')
      expect(result.status).toBe('pending')
      expect(result.employmentHistory).toHaveLength(1)
    })

    it('contact email differs from account email', async function run() {
      const service = createService()

      const result = await service.submitApplication(activeSession, {
        email: 'different@example.com',
        employmentRecordIds: [companyId],
      })

      expect(result.email).toBe('different@example.com')
      expect(result.email).not.toBe(activeSession.email)
    })

    it('rejects empty employmentRecordIds', async function run() {
      const service = createService()

      await expect(
        service.submitApplication(activeSession, {
          email: 'contact@example.com',
          employmentRecordIds: [],
        }),
      ).rejects.toBeInstanceOf(Error)
    })

    it('rejects over-limit employmentRecordIds', async function run() {
      const service = createService()

      await expect(
        service.submitApplication(activeSession, {
          email: 'contact@example.com',
          employmentRecordIds: Array.from({ length: 11 }, function (_, i) {
            return `${String(i + 1).padStart(8, '0')}-0000-4000-8000-000000000000`
          }),
        }),
      ).rejects.toBeInstanceOf(Error)
    })

    it('rejects duplicate employmentRecordIds', async function run() {
      const service = createService()

      await expect(
        service.submitApplication(activeSession, {
          email: 'contact@example.com',
          employmentRecordIds: [companyId, companyId],
        }),
      ).rejects.toBeInstanceOf(Error)
    })

    it('rejects unauthenticated request', async function run() {
      const service = createService()

      await expect(
        service.submitApplication(null, {
          email: 'contact@example.com',
          employmentRecordIds: [companyId],
        }),
      ).rejects.toBeInstanceOf(InterviewerApplicationUnauthorizedError)
    })

    it('rejects request with invalid email', async function run() {
      const service = createService()

      await expect(
        service.submitApplication(activeSession, {
          email: 'not-an-email',
          employmentRecordIds: [companyId],
        }),
      ).rejects.toBeInstanceOf(Error)
    })

    it('throws forbidden when user is inactive', async function run() {
      const service = createService({ userActive: false })

      await expect(
        service.submitApplication(activeSession, {
          email: 'contact@example.com',
          employmentRecordIds: [companyId],
        }),
      ).rejects.toBeInstanceOf(InterviewerApplicationForbiddenError)
    })

    it('throws conflict when an active application exists', async function run() {
      const service = createService({ activeApplication: true })

      await expect(
        service.submitApplication(activeSession, {
          email: 'contact@example.com',
          employmentRecordIds: [companyId],
        }),
      ).rejects.toBeInstanceOf(InterviewerApplicationConflictError)
    })
  })

  describe('getApplicationStatus', function statusSuite() {
    it('returns the latest application', async function run() {
      const service = createService({ hasLatestApplication: true })

      const result = await service.getApplicationStatus(activeSession)

      expect(result).not.toBeNull()
      expect(result?.applicationId).toBe(applicationId)
      expect(result?.status).toBe('pending')
    })

    it('returns null when no application exists', async function run() {
      const service = createService({ hasLatestApplication: false })

      const result = await service.getApplicationStatus(activeSession)

      expect(result).toBeNull()
    })

    it('rejects unauthenticated request', async function run() {
      const service = createService()

      await expect(service.getApplicationStatus(null)).rejects.toBeInstanceOf(
        InterviewerApplicationUnauthorizedError,
      )
    })

    it('throws forbidden when user is inactive', async function run() {
      const service = createService({ userActive: false })

      await expect(service.getApplicationStatus(activeSession)).rejects.toBeInstanceOf(
        InterviewerApplicationForbiddenError,
      )
    })
  })
})

type ServiceTestOptions = {
  userActive?: boolean
  activeApplication?: boolean
  hasLatestApplication?: boolean
}

function createService(options: ServiceTestOptions = {}) {
  const userActive = options.userActive ?? true
  const activeApplication = options.activeApplication ?? false
  const hasLatestApplication = options.hasLatestApplication ?? false

  return new InterviewerApplicationService(
    new InterviewerApplicationRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        const text = queryInput.text

        if (text.includes('BEGIN') || text.includes('COMMIT') || text.includes('ROLLBACK')) {
          return { rows: [] as Row[] }
        }

        if (text.includes('FOR UPDATE') && text.includes('FROM "user"')) {
          return {
            rows: (userActive ? [{ id: activeSession.userId }] : []) as Row[],
          }
        }

        if (text.includes('SELECT 1 FROM "user"')) {
          return {
            rows: (userActive ? [{ exists: 1 }] : []) as Row[],
          }
        }

        if (text.includes('status IN') && text.includes('LIMIT 1')) {
          return {
            rows: (activeApplication ? [{ id: applicationId }] : []) as Row[],
          }
        }

        if (text.includes('FROM user_companies')) {
          return {
            rows: [
              {
                id: companyId,
                user_id: activeSession.userId,
                company: 'mako',
                role: 'backend engineer',
                joined: '2023-01-01T00:00:00.000Z',
                ended_at: null,
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
                deleted_at: null,
              },
            ] as Row[],
          }
        }

        if (text.includes('INSERT INTO user_interviewer_applications')) {
          const [, userId, email, employmentHistory] = queryInput.values
          return {
            rows: [
              {
                id: applicationId,
                user_id: userId,
                email,
                employment_history:
                  typeof employmentHistory === 'string'
                    ? JSON.parse(employmentHistory)
                    : employmentHistory,
                status: 'pending',
                reviewed_by: null,
                reviewed_at: null,
                created_at: '2026-08-07T00:00:00.000Z',
                updated_at: '2026-08-07T00:00:00.000Z',
              },
            ] as Row[],
          }
        }

        if (text.includes('ORDER BY created_at DESC') && text.includes('user_interviewer_applications')) {
          if (!hasLatestApplication) {
            return { rows: [] as Row[] }
          }

          return {
            rows: [
              {
                id: applicationId,
                user_id: activeSession.userId,
                email: 'contact@example.com',
                employment_history: [
                  {
                    sourceCompanyId: companyId,
                    company: 'mako',
                    role: 'backend engineer',
                    start: '2023-01-01',
                    end: null,
                  },
                ],
                status: 'pending',
                reviewed_by: null,
                reviewed_at: null,
                created_at: '2026-08-07T00:00:00.000Z',
                updated_at: '2026-08-07T00:00:00.000Z',
              },
            ] as Row[],
          }
        }

        return { rows: [] as Row[] }
      },
    }),
  )
}
