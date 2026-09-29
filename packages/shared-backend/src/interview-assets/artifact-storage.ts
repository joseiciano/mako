import type { R2Bucket } from '@cloudflare/workers-types'
import {
  ArtifactValidationError,
  buildRecordingKey,
  buildScreenshotKey,
  DEFAULT_ARTIFACT_STORAGE_CONFIG,
  type ArtifactMetadata,
  type ArtifactStorageConfig,
  type ArtifactStoragePort,
  type R2BucketPort,
  type StoredArtifact,
} from './types'

type R2PutValue = Parameters<R2Bucket['put']>[1]

const RECORDING_KEY_PATTERN = /^interviews\/[a-f0-9-]+\/recording\/[a-f0-9-]+$/
const SCREENSHOT_KEY_PATTERN = /^interviews\/[a-f0-9-]+\/screenshots\/[a-f0-9-]+$/

export function createArtifactStorage(
  recordingsBucket: R2BucketPort | null,
  screenshotsBucket: R2BucketPort,
  config: ArtifactStorageConfig = DEFAULT_ARTIFACT_STORAGE_CONFIG,
): ArtifactStoragePort {
  return {
    async storeRecording(input) {
      if (!config.allowedRecordingContentTypes.includes(input.contentType)) {
        throw new ArtifactValidationError(
          `Unsupported recording content type: ${input.contentType}`,
        )
      }

      const bucket = getRecordingsBucket(recordingsBucket)
      const key = buildRecordingKey(input.interviewId, input.recordingId)
      const kind = input.artifactKind ?? 'playback_recording'
      if (kind !== 'playback_recording' && kind !== 'transcription_audio') {
        throw new ArtifactValidationError(`Unsupported artifact kind for recording: ${kind}`)
      }
        const metadata = toR2Metadata({
          interviewId: input.interviewId,
          artifactKind: kind,
          contentType: input.contentType,
          captureTimestamp: input.captureTimestamp,
          participantId: input.participantId,
          participantRole: input.participantRole,
        })

      await bucket.put({
        key,
        body: input.body,
        contentType: input.contentType,
        metadata,
      })

      return {
        key,
        metadata: fromR2Metadata(metadata),
      }
    },

    async storeScreenshot(input) {
      if (!config.allowedScreenshotContentTypes.includes(input.contentType)) {
        throw new ArtifactValidationError(
          `Unsupported screenshot content type: ${input.contentType}`,
        )
      }

      const bodySize = input.body.byteLength
      if (bodySize > config.maxScreenshotBytes) {
        throw new ArtifactValidationError(
          `Screenshot body exceeds maximum size of ${config.maxScreenshotBytes} bytes`,
        )
      }

      const key = buildScreenshotKey(input.interviewId, input.screenshotId)
      const metadata = toR2Metadata({
        interviewId: input.interviewId,
        artifactKind: 'screenshot',
        contentType: input.contentType,
        captureTimestamp: input.captureTimestamp,
      })

      await screenshotsBucket.put({
        key,
        body: input.body,
        contentType: input.contentType,
        metadata,
      })

      return {
        key,
        metadata: fromR2Metadata(metadata),
      }
    },

    async getRecording(interviewId, recordingId) {
      const bucket = getRecordingsBucket(recordingsBucket)
      const key = buildRecordingKey(interviewId, recordingId)
      const result = await bucket.get(key)

      if (!result) {
        return null
      }

      return {
        body: result.body,
        metadata: fromR2Metadata(result.metadata),
      }
    },

    async getScreenshot(interviewId, screenshotId) {
      const key = buildScreenshotKey(interviewId, screenshotId)
      const result = await screenshotsBucket.get(key)

      if (!result) {
        return null
      }

      return {
        body: result.body,
        metadata: fromR2Metadata(result.metadata),
      }
    },

    async deleteArtifact(key) {
      if (RECORDING_KEY_PATTERN.test(key)) {
        const bucket = getRecordingsBucket(recordingsBucket)
        await bucket.delete(key)
        return
      }

      if (SCREENSHOT_KEY_PATTERN.test(key)) {
        await screenshotsBucket.delete(key)
        return
      }

      throw new ArtifactValidationError(
        'Cannot delete artifact with unrecognized key prefix',
      )
    },

    async headArtifact(key) {
      if (RECORDING_KEY_PATTERN.test(key)) {
        const bucket = getRecordingsBucket(recordingsBucket)
        const result = await bucket.head(key)
        return result ? { size: result.size, contentType: result.contentType, etag: result.etag } : null
      }

      if (SCREENSHOT_KEY_PATTERN.test(key)) {
        const result = await screenshotsBucket.head(key)
        return result ? { size: result.size, contentType: result.contentType, etag: result.etag } : null
      }

      throw new ArtifactValidationError(
        'Cannot head artifact with unrecognized key prefix',
      )
    },

    async getObject(key, range) {
      if (RECORDING_KEY_PATTERN.test(key)) {
        const bucket = getRecordingsBucket(recordingsBucket)
        const result = range
          ? await bucket.get(key, { range })
          : await bucket.get(key)

        if (!result) {
          return null
        }

        return {
          body: result.body,
          metadata: result.metadata,
          size: result.size,
          etag: result.etag,
          contentType: result.contentType,
        }
      }

      if (SCREENSHOT_KEY_PATTERN.test(key)) {
        const result = range
          ? await screenshotsBucket.get(key, { range })
          : await screenshotsBucket.get(key)

        if (!result) {
          return null
        }

        return {
          body: result.body,
          metadata: result.metadata,
          size: result.size,
          etag: result.etag,
          contentType: result.contentType,
        }
      }

      throw new ArtifactValidationError(
        'Cannot get artifact with unrecognized key prefix',
      )
    },
  }
}


function getRecordingsBucket(
  recordingsBucket: R2BucketPort | null,
): R2BucketPort {
  if (!recordingsBucket) {
    throw new ArtifactValidationError(
      'Recording operations require a configured recordings bucket.',
    )
  }

  return recordingsBucket
}

export function createR2BucketPort(bucket: R2Bucket): R2BucketPort {
  return {
    async put(input) {
      await bucket.put(input.key, input.body as unknown as R2PutValue, {
        httpMetadata: { contentType: input.contentType },
        customMetadata: input.metadata,
      })
    },

    async head(key) {
      const object = await bucket.head(key)

      if (!object) {
        return null
      }

      return {
        size: object.size,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        etag: object.httpEtag,
        metadata: object.customMetadata ?? {},
      }
    },

    async get(key, options) {
      const object = options?.range
        ? await bucket.get(key, { range: options.range })
        : await bucket.get(key)

      if (!object) {
        return null
      }

      return {
        body: object.body as unknown as ReadableStream,
        metadata: object.customMetadata ?? {},
        size: object.size,
        etag: object.httpEtag,
        contentType: object.httpMetadata?.contentType,
      }
    },

    async delete(key) {
      await bucket.delete(key)
    },
  }
}

function toR2Metadata(metadata: ArtifactMetadata): Record<string, string> {
  const record: Record<string, string> = {
    interviewId: metadata.interviewId,
    artifactKind: metadata.artifactKind,
    contentType: metadata.contentType,
    captureTimestamp: metadata.captureTimestamp,
  }

  if (metadata.participantId) {
    record.participantId = metadata.participantId
  }

  if (metadata.participantRole) {
    record.participantRole = metadata.participantRole
  }

  return record
}

function fromR2Metadata(record: Record<string, string>): ArtifactMetadata {
  const metadata: ArtifactMetadata = {
    interviewId: record.interviewId,
    artifactKind: record.artifactKind as ArtifactMetadata['artifactKind'],
    contentType: record.contentType,
    captureTimestamp: record.captureTimestamp,
  }

  if (record.participantId) {
    metadata.participantId = record.participantId
  }

  if (record.participantRole) {
    metadata.participantRole = record.participantRole
  }

  return metadata
}
