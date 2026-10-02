import {
  ArtifactValidationError,
  DEFAULT_ARTIFACT_STORAGE_CONFIG,
  type ArtifactStorageConfig,
  type ArtifactStoragePort,
} from '../interview-assets'
import { InterviewRepository } from './interview-repository'
import { ScreenshotRepository } from './screenshot-repository'
import {
  authenticatedInterviewUserIdSchema,
  InterviewBusinessRuleError,
  InterviewConflictError,
  InterviewNotFoundError,
  InterviewUnauthorizedError,
  type InterviewSession,
} from './types'

export class ScreenshotService {
  constructor(
    private readonly screenshotRepository: ScreenshotRepository,
    private readonly interviewRepository: InterviewRepository,
    private readonly storagePort: ArtifactStoragePort,
    private readonly config: ArtifactStorageConfig = DEFAULT_ARTIFACT_STORAGE_CONFIG,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async uploadScreenshot(
    session: InterviewSession | null,
    input: {
      interview_id: string
      idempotency_key: string
      content_type: string
      capture_timestamp: string
      body: ArrayBuffer
    },
  ): Promise<{ capture_id: string }> {
    const userSession = this.requireSession(session)
    const participantUserId = authenticatedInterviewUserIdSchema.parse(
      userSession.userId,
    )

    const interview = await this.interviewRepository.getParticipantInterviewById({
      interview_id: input.interview_id,
      participant_user_id: participantUserId,
    })

    if (!interview) {
      throw new InterviewNotFoundError(
        'Interview was not found for the active participant.',
      )
    }

    if (interview.status !== 'ongoing') {
      throw new InterviewConflictError(
        'Screenshot uploads are only accepted for ongoing interviews.',
      )
    }

    if (interview.screenshots_finalized_at !== null) {
      throw new InterviewConflictError(
        'Screenshot uploads are disabled for this interview.',
      )
    }

    if (input.content_type !== 'image/png') {
      throw new ArtifactValidationError(
        `Unsupported screenshot content type: ${input.content_type}`,
      )
    }

    if (input.body.byteLength === 0) {
      throw new ArtifactValidationError('Screenshot body must not be empty.')
    }

    if (input.body.byteLength > this.config.maxScreenshotBytes) {
      throw new ArtifactValidationError(
        `Screenshot body exceeds maximum size of ${this.config.maxScreenshotBytes} bytes`,
      )
    }

    const currentCount = await this.screenshotRepository.countScreenshots(
      input.interview_id,
    )
    if (currentCount >= this.config.maxScreenshotsPerInterview) {
      throw new InterviewBusinessRuleError(
        `Screenshot limit of ${this.config.maxScreenshotsPerInterview} reached for this interview.`,
      )
    }

    const now = this.now()
    const captureId = this.createId()
    const expiresAt = addRetentionDays(now, this.config.retentionDays)

    const stored = await this.storagePort.storeScreenshot({
      interviewId: input.interview_id,
      screenshotId: captureId,
      contentType: input.content_type,
      body: input.body,
      captureTimestamp: input.capture_timestamp,
    })

    try {
      const insertResult = await this.screenshotRepository.insertScreenshot({
        id: captureId,
        interview_id: input.interview_id,
        object_key: stored.key,
        idempotency_key: input.idempotency_key,
        content_type: input.content_type,
        content_size_bytes: input.body.byteLength,
        capture_timestamp: input.capture_timestamp,
        created_at: now,
        updated_at: now,
        max_screenshots: this.config.maxScreenshotsPerInterview,
        expires_at: expiresAt,
      })

      if (insertResult.outcome === 'duplicate') {
        // Retried upload for an existing idempotency key. The redundant R2
        // object is not referenced by any artifact row, so remove it and
        // resolve to the original stable capture id.
        await this.deleteArtifactSafely(stored.key)

        if (!insertResult.row) {
          // The insert's WHERE EXISTS guard failed (interview was finalized
          // between the check and the insert) and no existing artifact
          // matched the idempotency key. The screenshot was never persisted
          // and its R2 object has been cleaned up. Surface the conflict
          // rather than fabricating a capture id that resolves to nothing.
          throw new InterviewConflictError(
            'Screenshot uploads are disabled for this interview.',
          )
        }

        return { capture_id: insertResult.row.id }
      }

      return { capture_id: captureId }
    } catch (error) {
      // The R2 object was written but the artifact row could not be persisted.
      // Remove the orphaned object so no unindexed bytes are retained.
      await this.deleteArtifactSafely(stored.key)
      throw error
    }
  }

  private requireSession(session: InterviewSession | null): InterviewSession {
    if (!session) {
      throw new InterviewUnauthorizedError()
    }

    return session
  }

  private async deleteArtifactSafely(key: string): Promise<void> {
    try {
      await this.storagePort.deleteArtifact(key)
    } catch (error) {
      // Cleanup must never mask the original failure, but log for observability.
      console.warn('screenshot_cleanup_failed', {
        key,
        error_message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/**
 * Computes the raw-media retention expiry tombstone (Story 5.15) from a
 * capture timestamp. The scheduled artifact-retention sweep clears the
 * object once `expires_at` has passed.
 */
function addRetentionDays(fromIso: string, retentionDays: number): string {
  const fromMillis = new Date(fromIso).getTime()
  const retentionMillis = retentionDays * 24 * 60 * 60 * 1000
  return new Date(fromMillis + retentionMillis).toISOString()
}
