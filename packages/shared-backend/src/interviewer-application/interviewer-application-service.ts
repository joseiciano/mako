import type { InterviewerApplication } from '@mako/shared'
import { interviewerApplicationRequestSchema } from '@mako/shared'
import { InterviewerApplicationRepository } from './interviewer-application-repository'
import {
  InterviewerApplicationConflictError,
  InterviewerApplicationForbiddenError,
  InterviewerApplicationUnauthorizedError,
  InterviewerApplicationValidationError,
  authenticatedUserIdSchema,
  toInterviewerApplication,
  type InterviewerApplicationServiceLogger,
  type InterviewerApplicationSession,
} from './types'

const noOpLogger: InterviewerApplicationServiceLogger = {
  info: function noOpInfo() {},
  error: function noOpError() {},
}

export class InterviewerApplicationService {
  constructor(
    private readonly repository: InterviewerApplicationRepository,
    private readonly logger: InterviewerApplicationServiceLogger = noOpLogger,
  ) {}

  async submitApplication(
    session: InterviewerApplicationSession | null,
    requestBody: unknown,
  ): Promise<InterviewerApplication> {
    const userSession = this.requireSession(session)
    const userId = authenticatedUserIdSchema.parse(userSession.userId)

    const isActive = await this.repository.isUserActive(userId)
    if (!isActive) {
      throw new InterviewerApplicationForbiddenError()
    }

    const payload = interviewerApplicationRequestSchema.parse(requestBody)

    const selectedRecordCount = payload.employmentRecordIds.length

    this.logger.info('interviewer_application.requested', {
      userId,
      selectedRecordCount,
    })

    try {
      const row = await this.repository.submitApplication({
        userId,
        email: payload.email,
        employmentRecordIds: payload.employmentRecordIds,
      })

      this.logger.info('interviewer_application.succeeded', {
        applicationId: row.id,
        userId,
        selectedRecordCount,
      })

      return toInterviewerApplication(row)
    } catch (error) {
      if (error instanceof InterviewerApplicationConflictError) {
        this.logger.info('interviewer_application.conflicted', {
          userId,
          selectedRecordCount,
        })
      } else if (!(error instanceof InterviewerApplicationValidationError)) {
        this.logger.error('interviewer_application.failed', {
          userId,
          selectedRecordCount,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      throw error
    }
  }

  async getApplicationStatus(
    session: InterviewerApplicationSession | null,
  ): Promise<InterviewerApplication | null> {
    const userSession = this.requireSession(session)
    const userId = authenticatedUserIdSchema.parse(userSession.userId)

    const isActive = await this.repository.isUserActive(userId)
    if (!isActive) {
      throw new InterviewerApplicationForbiddenError()
    }

    const row = await this.repository.getLatestApplication(userId)

    if (!row) {
      return null
    }

    return toInterviewerApplication(row)
  }

  private requireSession(
    session: InterviewerApplicationSession | null,
  ): InterviewerApplicationSession {
    if (!session) {
      throw new InterviewerApplicationUnauthorizedError()
    }

    return session
  }
}
