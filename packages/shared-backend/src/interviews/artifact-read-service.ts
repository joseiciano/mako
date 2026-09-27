import type { ArtifactAvailability } from '@mako/shared'
import {
  DEFAULT_ARTIFACT_STORAGE_CONFIG,
  type ArtifactStoragePort,
} from '../interview-assets'
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
  ifRange?: string
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

type ReadableArtifactKind = ReadableArtifactRow['artifact_kind']

const DEFAULT_CONTENT_TYPES: Record<ReadableArtifactKind, string> = {
  playback_recording: 'video/webm',
  screenshot: 'image/png',
}

const ALLOWED_CONTENT_TYPES: Record<ReadableArtifactKind, readonly string[]> = {
  playback_recording:
    DEFAULT_ARTIFACT_STORAGE_CONFIG.allowedRecordingContentTypes,
  screenshot: DEFAULT_ARTIFACT_STORAGE_CONFIG.allowedScreenshotContentTypes,
}

function contentTypeForArtifact(
  artifactKind: ReadableArtifactKind,
  metadata: Record<string, unknown> | null,
  storedContentType: string | undefined,
): string {
  const allowedContentTypes = ALLOWED_CONTENT_TYPES[artifactKind]
  const metadataContentType = metadata?.contentType

  if (
    typeof metadataContentType === 'string' &&
    allowedContentTypes.includes(metadataContentType)
  ) {
    return metadataContentType
  }

  if (
    storedContentType !== undefined &&
    allowedContentTypes.includes(storedContentType)
  ) {
    return storedContentType
  }

  return DEFAULT_CONTENT_TYPES[artifactKind]
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

    if (artifact !== null && isExpired(artifact, this.now())) {
      return { outcome: 'unavailable', availability: 'expired' }
    }

    const objectKey = artifact?.object_key ?? null

    if (artifact === null || objectKey === null) {
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

    if (artifact.finalized_at === null) {
      return { outcome: 'unavailable', availability: 'processing' }
    }

    return this.streamArtifact(artifact, objectKey, request, 'failed')
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

    if (artifact !== null && isExpired(artifact, this.now())) {
      return { outcome: 'unavailable', availability: 'expired' }
    }

    const objectKey = artifact?.object_key ?? null

    if (artifact === null || objectKey === null) {
      return { outcome: 'unavailable', availability: 'not_created' }
    }

    return this.streamArtifact(artifact, objectKey, request, 'not_created')
  }

  private async streamArtifact(
    artifact: {
      artifact_kind: ReadableArtifactKind
      content_metadata: Record<string, unknown> | null
    },
    objectKey: string,
    request: ArtifactStreamRequest,
    missingObjectAvailability: ArtifactAvailability,
  ): Promise<ArtifactStreamResult> {
    const head = await this.storagePort.headArtifact(objectKey)

    if (!head) {
      return { outcome: 'unavailable', availability: missingObjectAvailability }
    }

    const contentType = contentTypeForArtifact(
      artifact.artifact_kind,
      artifact.content_metadata,
      head.contentType,
    )
    const etag = head.etag ?? null

    if (etag !== null && request.ifNoneMatch !== undefined) {
      if (matchesEtag(request.ifNoneMatch, etag)) {
        return { outcome: 'not_modified', etag }
      }
    }

    const rangeHeader =
      request.ifRange === undefined || matchesIfRange(request.ifRange, etag)
        ? request.rangeHeader
        : undefined
    const parsedRange: ParsedRangeRequest = parseRangeHeader(
      rangeHeader,
      head.size,
    )

    if (parsedRange.outcome === 'unsatisfiable') {
      throw new ArtifactRangeNotSatisfiable(`bytes */${head.size}`)
    }

    const object = await this.storagePort.getObject(
      objectKey,
      parsedRange.outcome === 'range' ? parsedRange.range : undefined,
    )

    if (!object) {
      return { outcome: 'unavailable', availability: missingObjectAvailability }
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

function matchesIfRange(ifRange: string, etag: string | null): boolean {
  if (etag === null) {
    return false
  }

  const candidate = ifRange.trim()
  return isStrongEtag(candidate) && isStrongEtag(etag) && candidate === etag
}

function isStrongEtag(value: string): boolean {
  return value.startsWith('"') && value.endsWith('"') && !value.startsWith('W/')
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
      return (
        row.object_key !== null &&
        row.deleted_at === null &&
        !isExpired(row, current) &&
        (row.artifact_kind !== 'playback_recording' ||
          row.finalized_at !== null)
      )
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
