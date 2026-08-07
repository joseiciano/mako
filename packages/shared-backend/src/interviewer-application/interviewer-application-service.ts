import type { InterviewerApplication } from '@mako/shared'
import { interviewerApplicationRequestSchema } from '@mako/shared'
import { InterviewerApplicationRepository } from './interviewer-application-repository'
import {
  InterviewerApplicationForbiddenError,
  InterviewerApplicationUnauthorizedError,
  authenticatedUserIdSchema,
  toInterviewerApplication,
  type InterviewerApplicationSession,
} from './types'

export class InterviewerApplicationService {
  constructor(
    private readonly repository: InterviewerApplicationRepository,
  ) {}

  async submitApplication(
    session: InterviewerApplicationSession | null,
    requestBody: unknown,
  ): Promise<InterviewerApplication> {
    const userSession = this.requireSession(session)
    const userId = authenticatedUserIdSchema.parse(userSession.userId)
    const payload = interviewerApplicationRequestSchema.parse(requestBody)

    const row = await this.repository.submitApplication({
      userId,
      email: payload.email,
      employmentRecordIds: payload.employmentRecordIds,
    })

    return toInterviewerApplication(row)
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
