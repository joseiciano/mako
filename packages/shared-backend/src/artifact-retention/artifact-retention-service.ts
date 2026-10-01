import type { ArtifactStoragePort } from '../interview-assets'
import { ArtifactRetentionRepository } from './artifact-retention-repository'
import {
  createEmptyCleanupCounters,
  DEFAULT_RETENTION_BATCH_LIMIT,
  type ArtifactCleanupCounters,
  type RetentionArtifactRow,
} from './types'

export type ArtifactRetentionServiceLogger = {
  error(event: string, context: Record<string, unknown>): void | Promise<void>
}

const noOpLogger: ArtifactRetentionServiceLogger = {
  error: () => undefined,
}

/**
 * Story 5.15 raw-artifact retention and account-deletion cleanup. Deletes
 * known recording/screenshot R2 objects directly (never lists buckets),
 * then clears the object key and sets a deletion tombstone with
 * retry-safe updates so a single failed object never blocks the rest of a
 * cleanup run.
 */
export class ArtifactRetentionService {
  constructor(
    private readonly repository: ArtifactRetentionRepository,
    private readonly storagePort: ArtifactStoragePort,
    private readonly now: () => string = defaultNow,
    private readonly logger: ArtifactRetentionServiceLogger = noOpLogger,
  ) {}

  /**
   * Scheduled retention sweep: clears raw artifacts whose explicit
   * `expires_at` has passed, bounded by `limit` per run. Transcript and
   * feedback are left untouched; only raw media is governed by the
   * retention window.
   */
  async runScheduledRetentionSweep(
    limit: number = DEFAULT_RETENTION_BATCH_LIMIT,
  ): Promise<ArtifactCleanupCounters> {
    const counters = createEmptyCleanupCounters()
    const nowIso = this.now()

    const rows = await this.repository.listExpiredArtifacts(limit, nowIso)
    counters.scannedArtifacts = rows.length

    const scannedInterviewIds = new Set<string>()
    for (const row of rows) {
      scannedInterviewIds.add(row.interview_id)
      await this.cleanupArtifactRow(row, nowIso, counters)
    }
    counters.scannedInterviews = scannedInterviewIds.size

    return counters
  }

  /**
   * Account-deletion privacy cleanup: removes every shared raw artifact,
   * transcript, and feedback for interviews where the deleted user is a
   * recorded participant, regardless of the retention window. Because the
   * interview row (and its artifacts) is shared rather than duplicated per
   * participant, this also removes the counterpart's access per Story 5.2.
   */
  async runPrivacyCleanupForUser(userId: string): Promise<ArtifactCleanupCounters> {
    const counters = createEmptyCleanupCounters()
    const nowIso = this.now()

    const interviewIds = await this.repository.listParticipantInterviewIds(userId)
    counters.scannedInterviews = interviewIds.length

    if (interviewIds.length === 0) {
      return counters
    }

    const rows = await this.repository.listArtifactsForInterviews(interviewIds)
    counters.scannedArtifacts = rows.length

    for (const row of rows) {
      await this.cleanupArtifactRow(row, nowIso, counters)
    }

    for (const interviewId of interviewIds) {
      try {
        await this.repository.clearInterviewPrivacyFields(interviewId, nowIso)
      } catch (error) {
        counters.failures += 1
        await this.logSafely('artifact_retention.privacy_fields_clear_failed', {
          error_message: toErrorMessage(error),
        })
      }
    }

    return counters
  }

  /**
   * Deletes one artifact's R2 object (when present) and clears its row.
   * Isolated per-row try/catch: a single failure is counted and logged
   * without blocking the rest of the batch or run.
   */
  private async cleanupArtifactRow(
    row: RetentionArtifactRow,
    nowIso: string,
    counters: ArtifactCleanupCounters,
  ): Promise<void> {
    try {
      if (row.object_key === null) {
        // Already cleared out-of-band; treat as already-missing so the row
        // still gets its tombstone.
        counters.alreadyMissingObjects += 1
      } else {
        // HEAD first so an object already removed by the mandatory R2
        // lifecycle rule (Story 5.6) is reconciled as idempotent success
        // rather than reported as a deletion.
        const existing = await this.storagePort.headArtifact(row.object_key)

        if (existing === null) {
          counters.alreadyMissingObjects += 1
        } else {
          await this.storagePort.deleteArtifact(row.object_key)

          if (row.artifact_kind === 'screenshot') {
            counters.screenshotDeletions += 1
          } else {
            counters.recordingDeletions += 1
          }
        }
      }

      const cleared = await this.repository.clearArtifactObjectKey(row.id, nowIso)

      if (cleared) {
        counters.clearedRows += 1
      }
    } catch (error) {
      counters.failures += 1
      await this.logSafely('artifact_retention.cleanup_row_failed', {
        error_message: toErrorMessage(error),
      })
    }
  }

  private async logSafely(event: string, context: Record<string, unknown>): Promise<void> {
    try {
      await this.logger.error(event, context)
    } catch {
      // Observability must never block cleanup.
    }
  }
}

function defaultNow(): string {
  return new Date().toISOString()
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
