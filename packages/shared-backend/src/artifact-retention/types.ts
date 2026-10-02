export type RetentionArtifactKind = 'playback_recording' | 'transcription_audio' | 'screenshot'

export type RetentionArtifactRow = {
  id: string
  interview_id: string
  artifact_kind: RetentionArtifactKind
  object_key: string | null
}

/**
 * Privacy-safe structured counters for a cleanup run (Story 5.15). These are
 * the only values the cleanup paths log; object keys, recording/transcript
 * content, participant identifiers, and provider URLs are never logged.
 */
export type ArtifactCleanupCounters = {
  scannedInterviews: number
  scannedArtifacts: number
  recordingDeletions: number
  screenshotDeletions: number
  alreadyMissingObjects: number
  failures: number
  clearedRows: number
}

export function createEmptyCleanupCounters(): ArtifactCleanupCounters {
  return {
    scannedInterviews: 0,
    scannedArtifacts: 0,
    recordingDeletions: 0,
    screenshotDeletions: 0,
    alreadyMissingObjects: 0,
    failures: 0,
    clearedRows: 0,
  }
}

/** Production default retention window for raw recordings/screenshots (Story 5.2). */
export const DEFAULT_RETENTION_DAYS = 30

/** Deterministic per-run batch limit so one sweep invocation stays bounded. */
export const DEFAULT_RETENTION_BATCH_LIMIT = 100

/**
 * Parses an environment-configured retention window, falling back to the
 * production default when unset or invalid. Keeps the duration
 * environment-configurable per the Story 5.15 implementation notes.
 */
export function resolveRetentionDays(
  rawValue: string | undefined | null,
  fallbackDays: number = DEFAULT_RETENTION_DAYS,
): number {
  if (rawValue === undefined || rawValue === null || rawValue.trim() === '') {
    return fallbackDays
  }

  const parsed = Number.parseInt(rawValue, 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackDays
  }

  return parsed
}

/** Parses an environment-configured cleanup batch limit, falling back to the default. */
export function resolveBatchLimit(
  rawValue: string | undefined | null,
  fallbackLimit: number = DEFAULT_RETENTION_BATCH_LIMIT,
): number {
  if (rawValue === undefined || rawValue === null || rawValue.trim() === '') {
    return fallbackLimit
  }

  const parsed = Number.parseInt(rawValue, 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackLimit
  }

  return parsed
}
