export type ArtifactKind = 'playback_recording' | 'transcription_audio' | 'screenshot'

export type ArtifactStorageConfig = {
  maxScreenshotBytes: number
  maxScreenshotsPerInterview: number
  allowedRecordingContentTypes: readonly string[]
  allowedScreenshotContentTypes: readonly string[]
}

export type ArtifactMetadata = {
  interviewId: string
  artifactKind: ArtifactKind
  contentType: string
  captureTimestamp: string
  participantId?: string
  participantRole?: string
}

export type StoredArtifact = {
  key: string
  metadata: ArtifactMetadata
}

export type R2BucketPort = {
  put(input: {
    key: string
    body: ReadableStream | ArrayBuffer | string
    contentType: string
    metadata: Record<string, string>
  }): Promise<void>
  head(key: string): Promise<{ size: number; contentType: string; metadata: Record<string, string> } | null>
  get(key: string): Promise<{ body: ReadableStream; metadata: Record<string, string> } | null>
  delete(key: string): Promise<void>
}

export type ArtifactStoragePort = {
  storeRecording(input: {
    interviewId: string
    recordingId: string
    contentType: string
    body: ReadableStream | ArrayBuffer
    captureTimestamp: string
    artifactKind?: ArtifactKind
    participantId?: string
    participantRole?: string
  }): Promise<StoredArtifact>
  storeScreenshot(input: {
    interviewId: string
    screenshotId: string
    contentType: string
    body: ArrayBuffer
    captureTimestamp: string
  }): Promise<StoredArtifact>
  getRecording(interviewId: string, recordingId: string): Promise<{ body: ReadableStream; metadata: ArtifactMetadata } | null>
  getScreenshot(interviewId: string, screenshotId: string): Promise<{ body: ReadableStream; metadata: ArtifactMetadata } | null>
  deleteArtifact(key: string): Promise<void>
  headArtifact(key: string): Promise<{ size: number; contentType: string } | null>
}

export class ArtifactValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArtifactValidationError'
  }
}

// Scaffolding for future artifact retrieval stories (5.16/5.17).
// Not currently thrown by any production code path.
export class ArtifactNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArtifactNotFoundError'
  }
}

export const DEFAULT_ARTIFACT_STORAGE_CONFIG: ArtifactStorageConfig = {
  maxScreenshotBytes: 5 * 1024 * 1024,
  maxScreenshotsPerInterview: 10,
  allowedRecordingContentTypes: [
    'audio/webm',
    'video/webm',
    'audio/ogg',
    'video/mp4',
    'audio/mp4',
    'audio/m4a',
  ],
  allowedScreenshotContentTypes: ['image/png'],
}

export function buildRecordingKey(interviewId: string, recordingId: string): string {
  return `interviews/${interviewId}/recording/${recordingId}`
}

export function buildScreenshotKey(interviewId: string, screenshotId: string): string {
  return `interviews/${interviewId}/screenshots/${screenshotId}`
}
