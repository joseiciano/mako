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

export type RecordingFinalizationConfig = {
  sweepDelayMs: number
  artifactExpiryDays: number
  maxArtifactBytes: number
  allowedDownloadHosts: readonly string[]
}

export const DEFAULT_RECORDING_FINALIZATION_CONFIG: RecordingFinalizationConfig = {
  sweepDelayMs: 5 * 60 * 1000,
  artifactExpiryDays: 30,
  maxArtifactBytes: 2 * 1024 * 1024 * 1024,
  allowedDownloadHosts: ['api.realtime.cloudflare.com'],
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

    await this.copyAssets(loaded, providerStatus, now)

    await this.repository.finalizeJob(providerRecordingId, now)
    await this.repository.markEventProcessed(providerRecordingId, now)

    await this.deriveAggregateReadiness(loaded, now)

    return { status: 'finalized' }
  }

  private async copyAssets(
    loaded: RecordingJobWithInterview,
    providerStatus: RealtimeKitRecordingStatusResult,
    now: string,
  ): Promise<void> {
    const job = loaded.job
    const artifactKind: 'playback_recording' | 'transcription_audio' =
      job.recording_type === 'composite' ? 'playback_recording' : 'transcription_audio'

    const expectedAssetKind = job.recording_type

    // Finalization must persist (or find already persisted) at least one asset
    // of the job's expected kind. An empty or mismatched asset list means the
    // provider published status before its asset was visible; treating it as a
    // successful copy would permanently lose the recording.
    let persistedAssetCount = 0

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

      // Redirects are never followed: a redirect from an allowlisted endpoint
      // could point the Worker at an arbitrary host and bypass the SSRF
      // boundary assertSafeProviderUrl() enforces. Any redirect is rejected.
      const response = await this.fetch(asset.downloadUrl, { redirect: 'manual' })

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

      const stored = await this.storage.storeRecording({
        interviewId: loaded.interview.id,
        recordingId,
        contentType,
        body: boundedBody,
        captureTimestamp: capturedAt,
        artifactKind,
        participantId: job.participant_id ?? undefined,
        participantRole: job.participant_role ?? undefined,
      })

      await this.repository.insertArtifact({
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
          size_bytes: parseContentLength(response.headers) ?? 0,
        },
        captured_at: capturedAt,
        finalized_at: now,
        expires_at: expiresAt,
        created_at: now,
      })

      // Whether the row was inserted now or is a duplicate from a concurrent
      // finalization, the provider asset is durably present in storage.
      persistedAssetCount += 1
    }

    if (persistedAssetCount === 0) {
      throw new RealtimeKitInvalidProviderAssetError(
        'Provider upload status contained no expected recording asset.',
      )
    }
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
    // the playback object are visible in R2.
    for (const job of readiness) {
      if (!job.artifact_object_key) {
        return
      }

      const head = await this.storage.headArtifact(job.artifact_object_key)

      if (!head) {
        return
      }
    }

    await this.repository.setInterviewRecordingReady(loaded.interview.id, now)
  }
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
