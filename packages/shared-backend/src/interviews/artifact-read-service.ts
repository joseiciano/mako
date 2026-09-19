import type { ArtifactAvailability } from '@mako/shared'
import type { ArtifactStoragePort } from '../interview-assets'
import {
  parseRangeHeader,
  type ParsedRangeRequest,
} from '../interview-assets/range-request'
import { ArtifactReadRepository, type ReadableArtifactRow } from './artifact-read-repository'
import {
  InterviewNotFoundError,
  authenticatedInterviewUserIdSchema,
  type InterviewSession,
} from './types'
import type { InterviewRepository } from './interview-repository'

export type ArtifactStreamRequest = {
  rangeHeader?: string
  ifNoneMatch?: string
}

export type ArtifactStreamResult =
  | {
      outcome: 'stream'
      body: ReadableStream
      contentType: string
      contentLength: number
      etag: string | null
      contentRange: string | null
      status: number
    }
  | { outcome: 'not_modified'; etag: string | null }
  | { outcome: 'unavailable'; availability: ArtifactAvailability }

const DEFAULT_CONTENT_TYPES: Record<string, string> = {
  playback_recording: 'video/webm',
  screenshot: 'image/png',
}

function contentTypeFromMetadata(
  metadata: Record<string, unknown> | null,
  fallback: string,
): string {
  const contentType = metadata?.contentType
  return typeof contentType === 'string' && contentType !== ''
    ? contentType
    : fallback
}

function isExpired(artifact: { expires_at: string | null; deleted_at: string | null }, now: Date): boolean {
  if (artifact.deleted_at !== null) {
    return true
  }

  if (artifact.expires_at === null) {
    return false
  }

  const expiresAt = new Date(artifact.expires_at)
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()
}

/**
 * Participant-authorized artifact reads. Resolves normalized artifact rows
 * through `ArtifactReadRepository` and streams private R2 objects through the
 * `ArtifactStoragePort`; object keys and bucket identities never leave this
 * boundary.
 */
export class ArtifactReadService {
  constructor(
    private readonly artifactRepository: ArtifactReadRepository,
    private readonly interviewRepository: InterviewRepository,
    private readonly storagePort: ArtifactStoragePort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async streamRecording(
    session: InterviewSession | null,
    interviewId: string,
    request: ArtifactStreamRequest = {},
  ): Promise<ArtifactStreamResult> {
    const participantUserId = this.requireParticipant(session)
    const interview = await this.interviewRepository.getParticipantInterviewById({
      interview_id: interviewId,
      participant_user_id: participantUserId,
    })

    if (!interview) {
      throw new InterviewNotFoundError(
        'Interview was not found for the active participant.',
      )
    }

    const artifact = await this.artifactRepository.getRecordingArtifact(interviewId)

    if (!artifact || artifact.object_key === null) {
      const finalization = await this.artifactRepository.getRecordingFinalizationStatus(
        interviewId,
      )
      const availability: ArtifactAvailability =
        finalization === null
          ? 'not_created'
          : finalization.finalization_status === 'failed'
            ? 'failed'
            : 'processing'

      return { outcome: 'unavailable', availability }
    }

    if (isExpired(artifact, this.now())) {
      return { outcome: 'unavailable', availability: 'expired' }
    }

    if (artifact.finalized_at === null) {
      return { outcome: 'unavailable', availability: 'processing' }
    }

    return this.streamArtifact(artifact, request, 'failed')
  }

  async streamScreenshot(
    session: InterviewSession | null,
    interviewId: string,
    captureId: string,
    request: ArtifactStreamRequest = {},
  ): Promise<ArtifactStreamResult> {
    const participantUserId = this.requireParticipant(session)
    const interview = await this.interviewRepository.getParticipantInterviewById({
      interview_id: interviewId,
      participant_user_id: participantUserId,
    })

    if (!interview) {
      throw new InterviewNotFoundError(
        'Interview was not found for the active participant.',
      )
    }

    const artifact = await this.artifactRepository.getScreenshotArtifact(
      interviewId,
      captureId,
    )

    if (!artifact || artifact.object_key === null) {
      return { outcome: 'unavailable', availability: 'not_created' }
    }

    if (isExpired(artifact, this.now())) {
      return { outcome: 'unavailable', availability: 'expired' }
    }

    return this.streamArtifact(artifact, request, 'not_created')
  }

  private async streamArtifact(
    artifact: { object_key: string; artifact_kind: string; content_metadata: Record<string, unknown> | null },
    request: ArtifactStreamRequest,
    missingObjectAvailability: ArtifactAvailability,
  ): Promise<ArtifactStreamResult> {
    const fallbackContentType =
      DEFAULT_CONTENT_TYPES[artifact.artifact_kind] ?? 'application/octet-stream'
    const head = await this.storagePort.headArtifact(artifact.object_key)

    if (!head) {
      return { outcome: 'unavailable', availability: missingObjectAvailability }
    }

    const contentType = contentTypeFromMetadata(
      artifact.content_metadata,
      head.contentType ?? fallbackContentType,
    )
    const etag = head.etag ?? null

    if (etag !== null && request.ifNoneMatch !== undefined) {
      if (matchesEtag(request.ifNoneMatch, etag)) {
        return { outcome: 'not_modified', etag }
      }
    }

    const parsedRange: ParsedRangeRequest = parseRangeHeader(
      request.rangeHeader,
      head.size,
    )

    if (parsedRange.outcome === 'unsatisfiable') {
      throw new ArtifactRangeNotSatisfiable(`bytes */${head.size}`)
    }


    const object = await this.storagePort.getObject(
      artifact.object_key,
      parsedRange.outcome === 'range' ? parsedRange.range : undefined,
    )

    if (!object) {
      return { outcome: 'unavailable', availability: 'not_created' }
    }

    // R2 reports the total object size on ranged reads; the streamed body
    // length is the validated requested range length.
    const bodySize =
      parsedRange.outcome === 'range'
        ? parsedRange.range.length
        : object.size ?? head.size
    const contentRange =
      parsedRange.outcome === 'range'
        ? `bytes ${parsedRange.range.offset}-${parsedRange.range.offset + bodySize - 1}/${head.size}`
        : null

    return {
      outcome: 'stream',
      body: object.body,
      contentType,
      contentLength: bodySize,
      etag,
      contentRange,
      status: contentRange === null ? 200 : 206,
    }
  }

  private requireParticipant(session: InterviewSession | null): string {
    if (session === null) {
      throw new InterviewNotFoundError(
        'Interview was not found for the active participant.',
      )
    }

    return authenticatedInterviewUserIdSchema.parse(session.userId)
  }
}

export class ArtifactRangeNotSatisfiable extends Error {
  readonly contentRange: string

  constructor(contentRange: string) {
    super('Requested range is not satisfiable.')
    this.name = 'ArtifactRangeNotSatisfiable'
    this.contentRange = contentRange
  }
}

function matchesEtag(ifNoneMatch: string, etag: string): boolean {
  return ifNoneMatch
    .split(',')
    .some(function isMatchingTag(candidate) {
      const trimmed = candidate.trim()
      if (trimmed === '*') {
        return true
      }
      return trimmed.replace(/^W\//, '') === etag
    })
}

export type InterviewArtifactUrlSource = (
  interviewId: string,
) => Promise<{ recording_url: string | null; screenshot_urls: string[] }>

export function recordingRouteUrl(interviewId: string): string {
  return `/api/interviews/${interviewId}/artifacts/recording`
}

export function screenshotRouteUrl(interviewId: string, captureId: string): string {
  return `/api/interviews/${interviewId}/artifacts/screenshots/${captureId}`
}

/**
 * Builds the detail-payload URL mapping from normalized artifact rows. Legacy
 * `interviews.recording_url` / `screenshot_urls` database columns are ignored:
 * only available (non-expired, non-deleted) normalized artifacts map to
 * same-origin route URLs.
 */
export function createInterviewArtifactUrlSource(
  repository: ArtifactReadRepository,
  now: () => Date = () => new Date(),
): InterviewArtifactUrlSource {
  return async function loadArtifactUrls(interviewId) {
    const [recording, screenshots] = await Promise.all([
      repository.getRecordingArtifact(interviewId),
      repository.listScreenshotArtifacts(interviewId),
    ])

    const current = now()
    const isLiveRow = function isLiveRow(row: ReadableArtifactRow): boolean {
      return row.deleted_at === null && !isExpired(row, current)
    }

    return {
      recording_url:
        recording && isLiveRow(recording)
          ? recordingRouteUrl(interviewId)
          : null,
      screenshot_urls: screenshots.filter(isLiveRow).map(function toUrl(row) {
        return screenshotRouteUrl(interviewId, row.id)
      }),
    }
  }
}
