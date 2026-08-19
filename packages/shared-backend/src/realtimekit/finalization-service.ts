import type { ArtifactStoragePort } from '../interview-assets'
import type {
  RealtimeKitRecordingClientPort,
  RealtimeKitRecordingStatusResult,
} from './recording-client'
import {
  REALTIMEKIT_SAFE_ERROR_CODES,
  type RealtimeKitWebhookLogger,
} from './types'
import type {
  InsertArtifactInput,
  RecordingFinalizationRepositoryPort,
  RecordingJobWithInterview,
} from './finalization-repository'

export {
  RealtimeKitRecordingClientError,
  type RealtimeKitRecordingAsset,
  type RealtimeKitRecordingStatusResult,
} from './recording-client'
export type {
  ExistingArtifactRow,
  InsertArtifactInput,
  RecordingFinalizationRepositoryPort,
  RecordingJobWithInterview,
  RequiredRecordingArtifact,
  SweepCandidateRow,
} from './finalization-repository'
export class RealtimeKitInvalidProviderAssetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RealtimeKitInvalidProviderAssetError'
  }
}

export class RealtimeKitProviderDownloadTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RealtimeKitProviderDownloadTimeoutError'
  }
}

export type RecordingFinalizationConfig = {
  sweepDelayMs: number
  artifactExpiryDays: number
  maxArtifactBytes: number
  allowedDownloadHosts: readonly string[]
  providerDownloadTimeoutMs: number
}

export const DEFAULT_RECORDING_FINALIZATION_CONFIG: RecordingFinalizationConfig = {
  sweepDelayMs: 5 * 60 * 1000,
  artifactExpiryDays: 30,
  maxArtifactBytes: 2 * 1024 * 1024 * 1024,
  allowedDownloadHosts: ['api.realtime.cloudflare.com'],
  providerDownloadTimeoutMs: 5 * 60 * 1000,
}

export type RecordingFinalizationServiceDependencies = {
  repository: RecordingFinalizationRepositoryPort
  storage: ArtifactStoragePort
  providerClient: RealtimeKitRecordingClientPort
  fetch: typeof globalThis.fetch
  config?: Partial<RecordingFinalizationConfig>
  logger?: RealtimeKitWebhookLogger
}

export type RecordingFinalizationResult = {
  status: 'finalized' | 'already_finalized' | 'awaiting_provider' | 'failed' | 'skipped'
  reason?: string
  error_code?: string
}

export class RecordingFinalizationService {
  private readonly repository: RecordingFinalizationRepositoryPort
  private readonly storage: ArtifactStoragePort
  private readonly providerClient: RealtimeKitRecordingClientPort
  private readonly fetch: typeof globalThis.fetch
  private readonly config: RecordingFinalizationConfig
  private readonly logger: RealtimeKitWebhookLogger

  constructor(dependencies: RecordingFinalizationServiceDependencies) {
    this.repository = dependencies.repository
    this.storage = dependencies.storage
    this.providerClient = dependencies.providerClient
    this.fetch = dependencies.fetch
    this.config = {
      ...DEFAULT_RECORDING_FINALIZATION_CONFIG,
      ...dependencies.config,
    }
    this.logger = dependencies.logger ?? noopLogger
  }

  async finalizeRecording(
    providerRecordingId: string,
    now: string = new Date().toISOString(),
  ): Promise<RecordingFinalizationResult> {
    const loaded = await this.repository.getJobWithInterview(providerRecordingId)

    if (!loaded) {
      return { status: 'skipped', reason: 'not_found' }
    }

    if (loaded.job.finalization_status === 'finalized') {
      // Duplicate workflow delivery or sweep retry after success.
      await this.repository.markEventProcessed(providerRecordingId, now)
      return { status: 'already_finalized' }
    }

    const claimed = await this.repository.claimJob(providerRecordingId, now)

    if (!claimed) {
      // The atomic claim was refused: either the job was finalized by another
      // workflow between load and claim, or another workflow is actively
      // processing it. A finalized job is done; an in-progress job must stay
      // sweep-eligible so the scheduled retry resumes once the claim is free.
      const current = await this.repository.getJobWithInterview(providerRecordingId)

      if (current?.job.finalization_status === 'finalized') {
        await this.repository.markEventProcessed(providerRecordingId, now)
        return { status: 'already_finalized' }
      }

      await this.repository.markEventAwaiting(
        providerRecordingId,
        addMilliseconds(now, this.config.sweepDelayMs),
      )
      this.logger.warn('realtimekit.finalization.claim_busy', {
        provider_recording_id: providerRecordingId,
        finalization_status: current?.job.finalization_status ?? null,
      })
      return { status: 'skipped', reason: 'already_processing' }
    }

    // Always refresh provider state by recording id; the webhook payload and
    // any persisted URLs are never trusted inside the workflow.
    const providerStatus = await this.providerClient.getRecordingStatus(
      providerRecordingId,
    )

    if (providerStatus.state !== 'UPLOADED') {
      if (providerStatus.state === 'ERRORED') {
        await this.repository.failJob(
          providerRecordingId,
          REALTIMEKIT_SAFE_ERROR_CODES.provider_upload_failed,
          'provider_errored',
          now,
        )
        await this.repository.markEventFailed(
          providerRecordingId,
          REALTIMEKIT_SAFE_ERROR_CODES.provider_upload_failed,
          addMilliseconds(now, this.config.sweepDelayMs),
        )
        return {
          status: 'failed',
          error_code: REALTIMEKIT_SAFE_ERROR_CODES.provider_upload_failed,
        }
      }

      // Recording is still finalizing on the provider side. Release the claim
      // back to pending so a later retry can claim it again, and keep the
      // checkpoint sweep-eligible so the scheduled sweeper retries later.
      await this.repository.releaseClaim(providerRecordingId, now)
      await this.repository.markEventAwaiting(
        providerRecordingId,
        addMilliseconds(now, this.config.sweepDelayMs),
      )
      return { status: 'awaiting_provider' }
    }

    // R2 downloads/stores happen outside the transaction: streaming bytes
    // through a network fetch must not hold the Postgres transaction open.
    // Keys successfully stored by this run are tracked so a failure anywhere
    // before commit can compensate them (see deleteStoredArtifacts).
    const storedKeys: string[] = []

    try {
      const artifactInputs = await this.copyAssets(loaded, providerStatus, now, storedKeys)

      // Core database finalization is atomic: artifact rows, the job status, and
      // the webhook checkpoint commit together or roll back together.
      await this.repository.withTransaction(async () => {
        for (const input of artifactInputs) {
          await this.repository.insertArtifact(input)
        }

        await this.repository.finalizeJob(providerRecordingId, now)
        await this.repository.markEventProcessed(providerRecordingId, now)
      })
    } catch (error) {
      // A failed asset copy or a rolled-back core transaction leaves freshly
      // stored R2 objects orphaned: no artifact row references them, so a retry
      // would download and upload the same bytes again. Delete exactly the keys
      // this run stored; pre-existing rows/objects are never touched.
      await this.deleteStoredArtifacts(storedKeys, error)

      if (error instanceof RealtimeKitProviderDownloadTimeoutError) {
        // A provider download timeout is a transient provider stall, not a
        // failure: the object(s) stored by this run are compensated above, the
        // claim returns to pending, and the checkpoint stays sweep-eligible so
        // the scheduled retry re-downloads once the provider resumes. The event
        // completes successfully (awaiting_provider) instead of consuming a
        // bounded retry on an unrecoverable re-run.
        await this.repository.releaseClaim(providerRecordingId, now)
        await this.repository.markEventAwaiting(
          providerRecordingId,
          addMilliseconds(now, this.config.sweepDelayMs),
        )
        this.logger.warn('realtimekit.finalization.provider_download_timeout', {
          provider_recording_id: providerRecordingId,
          stored_artifact_count: storedKeys.length,
        })
        return { status: 'awaiting_provider' }
      }

      // Any other failure always propagates unchanged.
      throw error
    }

    await this.deriveAggregateReadiness(loaded, now)

    return { status: 'finalized' }
  }

  private async copyAssets(
    loaded: RecordingJobWithInterview,
    providerStatus: RealtimeKitRecordingStatusResult,
    now: string,
    storedKeys: string[],
  ): Promise<InsertArtifactInput[]> {
    const job = loaded.job
    const artifactKind: 'playback_recording' | 'transcription_audio' =
      job.recording_type === 'composite' ? 'playback_recording' : 'transcription_audio'

    const expectedAssetKind = job.recording_type

    // Finalization must persist (or find already persisted) at least one asset
    // of the job's expected kind. An empty or mismatched asset list means the
    // provider published status before its asset was visible; treating it as a
    // successful copy would permanently lose the recording.
    let persistedAssetCount = 0
    const artifactInputs: InsertArtifactInput[] = []

    for (const asset of providerStatus.assets) {
      if (asset.kind !== expectedAssetKind) {
        continue
      }

      const existing = await this.repository.getArtifactByProviderAssetId(
        asset.assetId,
      )

      if (existing && existing.object_key) {
        // One artifact row per finalized provider asset; retries are safe.
        persistedAssetCount += 1
        continue
      }

      assertSafeProviderUrl(asset.downloadUrl, this.config.allowedDownloadHosts)

      // A stalled provider must not pin the workflow step forever, so the
      // download is bounded by a configurable AbortSignal.timeout.
      const timeoutSignal = AbortSignal.timeout(this.config.providerDownloadTimeoutMs)

      // Redirects are never followed: a redirect from an allowlisted endpoint
      // could point the Worker at an arbitrary host and bypass the SSRF
      // boundary assertSafeProviderUrl() enforces. Any redirect is rejected.
      let response: Response
      try {
        response = await this.fetch(asset.downloadUrl, {
          redirect: 'manual',
          signal: timeoutSignal,
        })
      } catch (error) {
        // Only an abort fired by our own timeout signal is a provider stall.
        // Any other fetch failure (network, DNS, TLS) is unrelated and stays a
        // hard workflow failure handled by the caller.
        throwProviderDownloadError(error, timeoutSignal)
      }

      // With redirects disabled, the Workers runtime surfaces a manual
      // redirect as an opaque-redirect response (status 0) while other
      // fetch implementations return the 3xx status; both are rejected.
      const isOpaqueRedirect = (response as { type?: string }).type === 'opaqueredirect'

      if (isOpaqueRedirect || (response.status >= 300 && response.status < 400)) {
        throw new RealtimeKitInvalidProviderAssetError(
          'Provider download redirected to another URL.',
        )
      }

      if (!response.ok) {
        throw new RealtimeKitInvalidProviderAssetError(
          `Provider download failed with status ${response.status}.`,
        )
      }

      const contentType = response.headers.get('content-type') ?? asset.contentType
      const sizeBytes = parseContentLength(response.headers)
      assertAllowedContentType(contentType)

      // Early rejection when the provider declares the size up front.
      assertBoundedContentLength(response.headers, this.config.maxArtifactBytes)

      const body = response.body

      if (!body) {
        throw new RealtimeKitInvalidProviderAssetError(
          'Provider download returned no response body.',
        )
      }

      // Chunked or undeclared responses carry no trusted length; enforce the
      // configured bound by counting bytes as they stream through.
      const boundedBody = createBoundedBodyStream(body, this.config.maxArtifactBytes)

      const capturedAt = providerStatus.capturedAt ?? now
      const expiresAt = addDays(now, this.config.artifactExpiryDays)
      const recordingId = crypto.randomUUID()

      let stored: Awaited<ReturnType<ArtifactStoragePort['storeRecording']>>
      try {
        stored = await this.storage.storeRecording({
          interviewId: loaded.interview.id,
          recordingId,
          contentType,
          body: boundedBody,
          captureTimestamp: capturedAt,
          artifactKind,
          participantId: job.participant_id ?? undefined,
          participantRole: job.participant_role ?? undefined,
        })
      } catch (error) {
        // A timeout firing while the response body streams surfaces from the
        // body read (or the bounded stream) rather than the fetch promise, so
        // the abort is classified here too. The object is added to storedKeys
        // only after a fully successful store.
        throwProviderDownloadError(error, timeoutSignal)
      }

      // Track only keys newly stored by this run: they are the only objects
      // eligible for compensating deletion if a later step fails.
      storedKeys.push(stored.key)

      artifactInputs.push({
        id: crypto.randomUUID(),
        interview_id: loaded.interview.id,
        artifact_kind: artifactKind,
        participant_id: job.participant_id,
        participant_role: job.participant_role,
        object_key: stored.key,
        provider_asset_id: asset.assetId,
        idempotency_key: `finalize:${asset.assetId}`,
        content_metadata: {
          content_type: contentType,
          // Omit the field entirely when the provider did not declare a
          // trusted content-length; recording zero would be a lie.
          ...(sizeBytes !== null ? { size_bytes: sizeBytes } : {}),
        },
        captured_at: capturedAt,
        finalized_at: now,
        expires_at: expiresAt,
        created_at: now,
      })

      // Whether the row is inserted now or is a duplicate from a concurrent
      // finalization, the provider asset is durably present in storage.
      persistedAssetCount += 1
    }

    if (persistedAssetCount === 0) {
      throw new RealtimeKitInvalidProviderAssetError(
        'Provider upload status contained no expected recording asset.',
      )
    }

    return artifactInputs
  }

  private async deriveAggregateReadiness(
    loaded: RecordingJobWithInterview,
    now: string,
  ): Promise<void> {
    const readiness = await this.repository.getAggregateReadiness(
      loaded.interview.id,
    )

    if (readiness.length === 0) {
      return
    }

    // Aggregate ready only after every required candidate/participant track and
    // the playback object are visible in R2. Head checks are issued
    // concurrently: object visibility is independent per artifact.
    const keys: string[] = []

    for (const job of readiness) {
      if (!job.artifact_object_key) {
        return
      }

      keys.push(job.artifact_object_key)
    }

    const heads = await Promise.all(
      keys.map(async (key) => {
        try {
          return await this.storage.headArtifact(key)
        } catch (error) {
          // The job is already finalized by the time readiness is derived, so
          // a thrown head failure could never be recovered by the retry (it
          // would return already_finalized) and would force a wasteful
          // re-download. A transient R2 failure instead logs a safe error and
          // leaves the interview not-ready; the next derivation attempts again.
          this.logger.error('realtimekit.finalization.readiness_head_failed', {
            interview_id: loaded.interview.id,
            object_key: key,
            error: error instanceof Error ? error.message : String(error),
          })
          return null
        }
      }),
    )

    if (heads.some((head) => !head)) {
      return
    }

    await this.repository.setInterviewRecordingReady(loaded.interview.id, now)
  }

  private async deleteStoredArtifacts(
    storedKeys: string[],
    originalError: unknown,
  ): Promise<void> {
    await Promise.all(
      storedKeys.map(async (key) => {
        try {
          await this.storage.deleteArtifact(key)
        } catch (cleanupError) {
          // Compensating deletion is best-effort: the object is orphaned and will
          // expire via the R2 lifecycle, but the failure must be observable. The
          // original error is never replaced by a cleanup failure.
          this.logger.error('realtimekit.finalization.cleanup_failed', {
            object_key: key,
            original_error:
              originalError instanceof Error
                ? originalError.message
                : String(originalError),
            cleanup_error:
              cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          })
        }
      }),
    )
  }
}

function throwProviderDownloadError(error: unknown, signal: AbortSignal): never {
  // Only an abort fired by the timeout signal we created for this download is
  // treated as a provider stall. The runtime surfaces that abort either as the
  // signal being flagged or as an AbortError/TimeoutError DOMException (both
  // are exclusive to the abort mechanism). Unrelated fetch/stream errors,
  // including network failures, pass through untouched.
  if (signal.aborted || isAbortError(error)) {
    throw new RealtimeKitProviderDownloadTimeoutError(
      'Provider download timed out.',
    )
  }

  throw error
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  )
}

function assertSafeProviderUrl(
  downloadUrl: string,
  allowedDownloadHosts: readonly string[],
): void {
  let url: URL
  try {
    url = new URL(downloadUrl)
  } catch {
    throw new RealtimeKitInvalidProviderAssetError(
      'Provider download URL is not a valid URL.',
    )
  }

  if (url.protocol !== 'https:') {
    throw new RealtimeKitInvalidProviderAssetError(
      'Provider download URL must use HTTPS.',
    )
  }

  const hostname = url.hostname.toLowerCase()

  if (
    !allowedDownloadHosts.some(function isAllowedHost(allowed) {
      return hostname === allowed.toLowerCase()
    })
  ) {
    throw new RealtimeKitInvalidProviderAssetError(
      'Provider download URL host is not allowlisted.',
    )
  }
}

function assertAllowedContentType(contentType: string): void {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? ''

  if (!ALLOWED_DOWNLOAD_CONTENT_TYPES.has(normalized)) {
    throw new RealtimeKitInvalidProviderAssetError(
      `Unsupported provider download content type: ${contentType}`,
    )
  }
}

const ALLOWED_DOWNLOAD_CONTENT_TYPES = new Set([
  'video/mp4',
  'audio/mp4',
  'audio/m4a',
  'audio/webm',
  'video/webm',
  'audio/ogg',
])

function assertBoundedContentLength(
  headers: Headers,
  maxArtifactBytes: number,
): void {
  const contentLength = parseContentLength(headers)

  if (contentLength !== null && contentLength > maxArtifactBytes) {
    throw new RealtimeKitInvalidProviderAssetError(
      'Provider download exceeds the bounded artifact size limit.',
    )
  }
}

function createBoundedBodyStream(
  body: ReadableStream,
  maxArtifactBytes: number,
): ReadableStream {
  let countedBytes = 0

  const bounded = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      countedBytes += chunk.byteLength

      if (countedBytes > maxArtifactBytes) {
        controller.error(
          new RealtimeKitInvalidProviderAssetError(
            'Provider download exceeded the bounded artifact size limit.',
          ),
        )
        return
      }

      controller.enqueue(chunk)
    },
  })

  return body.pipeThrough(bounded)
}

function parseContentLength(headers: Headers): number | null {
  const value = headers.get('content-length')

  if (value === null) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function addMilliseconds(timestamp: string, millis: number): string {
  return new Date(new Date(timestamp).getTime() + millis).toISOString()
}

function addDays(timestamp: string, days: number): string {
  return new Date(new Date(timestamp).getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

const noopLogger: RealtimeKitWebhookLogger = {
  info() {},
  warn() {},
  error() {},
}
