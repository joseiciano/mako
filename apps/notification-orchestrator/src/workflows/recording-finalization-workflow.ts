import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { z } from 'zod'
import type { R2Bucket } from '@cloudflare/workers-types'
import { buildRecordingKey, createArtifactStorage, createPostgresConnectionPool, createR2BucketPort } from '@mako/shared-backend'
import type { R2BucketPort } from '@mako/shared-backend'
import type { WorkerBindings } from '../index'

export const recordingFinalizationPayloadSchema = z
  .object({
    recording_id: z.string().uuid(),
    schema_version: z.literal(1),
  })
  .strict()

export type RecordingFinalizationPayload = z.infer<typeof recordingFinalizationPayloadSchema>

export const STEP_LOAD = 'recording-load'
export const STEP_CLAIM = 'recording-claim'
export const STEP_TRANSFER = 'recording-transfer'
export const STEP_PERSIST_ARTIFACTS = 'recording-persist-artifacts'
export const STEP_VISIBILITY = 'recording-visibility'
export const STEP_FINALIZE = 'recording-finalize'
export const STEP_MARK_FAILED = 'recording-mark-failed'

const ALLOWED_RECORDING_CONTENT_TYPES: readonly string[] = ['audio/webm', 'video/webm', 'audio/ogg', 'video/mp4']
const RECORDING_FINALIZATION_LIMIT_DAYS = 30

type LoadResult = {
  found: boolean
  interview_id?: string
  provider_recording_id?: string
  recording_type?: string
  finalization_status?: string
  scheduler_id?: string
  interviewer_id?: string | null
  mode?: string
}

type TransferArtifact = {
  artifactId: string
  providerAssetId: string
  objectKey: string
  kind: 'playback_recording' | 'transcription_audio'
  participantId?: string
  participantRole?: string
  contentType: string
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

async function hashToUuid(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(hash)
  const hex = [...bytes.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function extractFirstUuid(filename: string): string | null {
  const m = filename.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return m ? m[0].toLowerCase() : null
}

function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

function toSafeCode(category: 'provider' | 'storage' | 'database' | 'mapping' | 'validation'): string {
  if (category === 'provider') return 'provider_error'
  if (category === 'storage') return 'storage_error'
  if (category === 'database') return 'database_error'
  if (category === 'mapping') return 'mapping_error'
  return 'validation_error'
}

function buildRealtimeKitRecordingUrl(env: WorkerBindings, providerId: string): string {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  const appId = env.CLOUDFLARE_REALTIMEKIT_APP_ID
  if (!accountId || !appId) {
    throw new Error('Missing RealtimeKit bindings')
  }
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/realtime/kit/${appId}/recordings/${providerId}`
}

function getSafeCode(err: unknown): string {
  if (err && typeof err === 'object' && 'safeCode' in err) {
    const code = (err as { safeCode?: unknown }).safeCode
    if (typeof code === 'string') return code
  }
  return toSafeCode('provider')
}

export class RecordingFinalizationWorkflow extends WorkflowEntrypoint<WorkerBindings, RecordingFinalizationPayload> {
  async run(event: Readonly<WorkflowEvent<RecordingFinalizationPayload>>, step: WorkflowStep) {
    const payload = recordingFinalizationPayloadSchema.parse(event.payload)
    const env = this.env

    const load = await step.do(STEP_LOAD, async (): Promise<LoadResult> => {
      const connectionString = env.HYPERDRIVE?.connectionString
      if (!connectionString) throw new Error('HYPERDRIVE missing')
      const pool = createPostgresConnectionPool(connectionString)
      const client = await pool.connect()
      try {
        const recResult = await client.query(
          `
          SELECT id, interview_id, provider_recording_id, recording_type, finalization_status, provider_status
          FROM interview_recordings
          WHERE provider_recording_id = $1
          LIMIT 1
        `,
          [payload.recording_id],
        )
        if (recResult.rows.length === 0) {
          return { found: false }
        }
        const recRow = recResult.rows[0] as Record<string, unknown>
        const interviewId = String(recRow.interview_id)
        const interviewResult = await client.query(
          `
          SELECT id, scheduler_id, interviewer_id, mode
          FROM interviews
          WHERE id = $1
          LIMIT 1
        `,
          [interviewId],
        )
        if (interviewResult.rows.length === 0) {
          return { found: false }
        }
        const intRow = interviewResult.rows[0] as Record<string, unknown>
        return {
          found: true,
          interview_id: interviewId,
          provider_recording_id: String(recRow.provider_recording_id),
          recording_type: String(recRow.recording_type),
          finalization_status: String(recRow.finalization_status),
          scheduler_id: String(intRow.scheduler_id),
          interviewer_id: intRow.interviewer_id ? String(intRow.interviewer_id) : null,
          mode: String(intRow.mode),
        }
      } finally {
        await client.release()
      }
    })

    if (!load.found) {
      return { status: 'skipped', reason: 'not_found' }
    }
    if (load.finalization_status === 'finalized') {
      return { status: 'skipped', reason: 'already_finalized' }
    }

    const claim = await step.do(STEP_CLAIM, async (): Promise<{ claimed: boolean }> => {
      const connectionString = env.HYPERDRIVE?.connectionString
      if (!connectionString) throw new Error('HYPERDRIVE missing')
      const pool = createPostgresConnectionPool(connectionString)
      const client = await pool.connect()
      try {
        const result =         await client.query(
          `
          UPDATE interview_recordings
          SET finalization_status = $2,
              finalization_checkpoint = $3,
              error_code = NULL,
              updated_at = NOW()
          WHERE provider_recording_id = $1
            AND finalization_status IN ('pending','failed','processing')
          RETURNING id
        `,
          [payload.recording_id, 'processing', 'processing'],
        )
        const claimed = (result.rowCount ?? result.rows.length) > 0
        return { claimed }
      } finally {
        await client.release()
      }
    })

    if (!claim.claimed) {
      return { status: 'skipped', reason: 'already_claimed' }
    }

    const interviewId = load.interview_id as string
    const schedulerId = load.scheduler_id as string
    const interviewerId = (load.interviewer_id ?? null) as string | null
    const mode = (load.mode ?? 'ai_led') as string

    let artifacts: TransferArtifact[] = []
    let postClaimStage: 'transfer' | 'persist' | 'visibility' | 'finalize' = 'transfer'

    try {
      const transfer = await step.do(STEP_TRANSFER, async (): Promise<{ artifacts: TransferArtifact[] }> => {
        const token = env.CLOUDFLARE_API_TOKEN
        const accountId = env.CLOUDFLARE_ACCOUNT_ID
        const appId = env.CLOUDFLARE_REALTIMEKIT_APP_ID
        if (!accountId || !token || !appId) {
          throw Object.assign(new Error('Missing RealtimeKit config'), { safeCode: toSafeCode('provider') })
        }

        const detailsUrl = buildRealtimeKitRecordingUrl(env, payload.recording_id)
        const detailsResponse = await fetch(detailsUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        })
        if (!detailsResponse.ok) {
          throw Object.assign(new Error(`details fetch failed ${detailsResponse.status}`), { safeCode: toSafeCode('provider') })
        }
        const json = (await detailsResponse.json()) as Record<string, unknown>
        let dataObj: Record<string, unknown> | undefined
        if (json.data && typeof json.data === 'object') dataObj = json.data as Record<string, unknown>
        else if (json.result && typeof json.result === 'object') dataObj = json.result as Record<string, unknown>
        else dataObj = json
        let rec: Record<string, unknown> | undefined
        if (dataObj.recording && typeof dataObj.recording === 'object') rec = dataObj.recording as Record<string, unknown>
        else if (dataObj && typeof dataObj.id === 'string') rec = dataObj
        if (!rec) {
          throw Object.assign(new Error('invalid recording shape'), { safeCode: toSafeCode('provider') })
        }
        const recIdRaw = rec.id ?? rec.recordingId ?? rec.recording_id
        const recId = typeof recIdRaw === 'string' ? recIdRaw : ''
        if (recId.toLowerCase() !== payload.recording_id.toLowerCase()) {
          throw Object.assign(new Error('recording id mismatch'), { safeCode: toSafeCode('validation') })
        }
        const status = String(rec.status ?? '').toUpperCase()
        if (status !== 'UPLOADED') {
          throw Object.assign(new Error(`invalid status ${status}`), { safeCode: toSafeCode('validation') })
        }
        const persistedType = String(load.recording_type ?? '').toLowerCase()
        if (persistedType !== 'composite' && persistedType !== 'participant_track') {
          throw Object.assign(new Error(`unsupported recording_type ${persistedType}`), { safeCode: toSafeCode('validation') })
        }

        const downloadUrlRaw: unknown = rec.download_url ?? rec.downloadUrl ?? (rec as Record<string, unknown>).download_urls
        const collected: Array<{ filename: string; url: string }> = []

        if (persistedType === 'composite') {
          if (typeof downloadUrlRaw !== 'string') {
            throw Object.assign(new Error('missing composite download url'), { safeCode: toSafeCode('validation') })
          }
          if (!isHttpsUrl(downloadUrlRaw)) {
            throw Object.assign(new Error('invalid https url'), { safeCode: toSafeCode('validation') })
          }
          collected.push({ filename: `${payload.recording_id}.webm`, url: downloadUrlRaw })
        } else {
          if (!Array.isArray(downloadUrlRaw)) {
            throw Object.assign(new Error('missing track download urls'), { safeCode: toSafeCode('validation') })
          }
          for (const layer of downloadUrlRaw as Array<Record<string, unknown>>) {
            const urlsDict: unknown = layer.download_urls ?? layer.downloadUrls ?? layer.urls ?? layer.files
            if (!urlsDict || typeof urlsDict !== 'object') continue
            for (const [filename, entry] of Object.entries(urlsDict as Record<string, unknown>)) {
              let url: string | undefined
              if (typeof entry === 'string') url = entry
              else if (entry && typeof entry === 'object') {
                const e = entry as Record<string, unknown>
                if (typeof e.download_url === 'string') url = e.download_url as string
                else if (typeof e.downloadUrl === 'string') url = e.downloadUrl as string
                else if (typeof e.url === 'string') url = e.url as string
              }
              if (!url) continue
              if (!isHttpsUrl(url)) {
                throw Object.assign(new Error('invalid https url'), { safeCode: toSafeCode('validation') })
              }
              collected.push({ filename, url })
            }
          }
          if (collected.length === 0) {
            throw Object.assign(new Error('no track files'), { safeCode: toSafeCode('validation') })
          }
        }

        const nowIso = new Date().toISOString()
        const bucket = env.RECORDINGS_BUCKET as R2Bucket | undefined
        if (!bucket) {
          throw Object.assign(new Error('missing recordings bucket'), { safeCode: toSafeCode('storage') })
        }

        const recordingsPort: R2BucketPort = createR2BucketPort(bucket)
        const dummyScreenshotsPort: R2BucketPort = {
          async put() {},
          async head() { return null },
          async get() { return null },
          async delete() {},
        }
        const storage = createArtifactStorage(recordingsPort, dummyScreenshotsPort)

        const outArtifacts: TransferArtifact[] = []

        if (persistedType === 'composite') {
          const file = collected[0] as { filename: string; url: string }
          const artifactId = await hashToUuid(payload.recording_id)
          const providerAssetId = payload.recording_id
          const objectKey = buildRecordingKey(interviewId, artifactId)
          const downloadResp = await fetch(file.url)
          if (!downloadResp.ok || !downloadResp.body || !(downloadResp.body instanceof ReadableStream)) {
            throw Object.assign(new Error('download failed'), { safeCode: toSafeCode('provider') })
          }
          const ctRaw = downloadResp.headers.get('content-type') ?? ''
          const ct = ctRaw.split(';')[0].trim().toLowerCase()
          if (!ALLOWED_RECORDING_CONTENT_TYPES.includes(ct)) {
            throw Object.assign(new Error(`unsupported content type ${ct}`), { safeCode: toSafeCode('validation') })
          }
          try {
            await storage.storeRecording({
              interviewId,
              recordingId: artifactId,
              contentType: ct,
              body: downloadResp.body as unknown as ReadableStream,
              captureTimestamp: nowIso,
              artifactKind: 'playback_recording',
            })
          } catch {
            throw Object.assign(new Error('R2 write failed'), { safeCode: toSafeCode('storage') })
          }
          outArtifacts.push({
            artifactId,
            providerAssetId,
            objectKey,
            kind: 'playback_recording',
            contentType: ct,
          })
        } else {
          const seen = new Set<string>()
          const requiredIds: string[] = mode === 'peer_to_peer' ? ([schedulerId, interviewerId].filter(Boolean) as string[]) : [schedulerId]
          const mapping: Array<{ filename: string; url: string; participantId: string; participantRole: string }> = []

          for (const f of collected) {
            const extracted = extractFirstUuid(f.filename)
            if (!extracted || !isValidUuid(extracted)) {
              throw Object.assign(new Error(`invalid filename mapping ${f.filename}`), { safeCode: toSafeCode('mapping') })
            }
            const lower = extracted.toLowerCase()
            let role: string | null = null
            let pid: string | null = null
            if (lower === schedulerId.toLowerCase()) {
              role = 'candidate'
              pid = schedulerId
            } else if (interviewerId && lower === interviewerId.toLowerCase()) {
              role = 'interviewer'
              pid = interviewerId
            } else {
              throw Object.assign(new Error(`unknown participant ${extracted}`), { safeCode: toSafeCode('mapping') })
            }
            if (pid && seen.has(pid.toLowerCase())) {
              throw Object.assign(new Error(`duplicate participant ${pid}`), { safeCode: toSafeCode('mapping') })
            }
            if (pid) seen.add(pid.toLowerCase())
            const r = role as string
            const p = pid as string
            mapping.push({ filename: f.filename, url: f.url, participantId: p, participantRole: r })
          }

          for (const req of requiredIds) {
            if (!seen.has(req.toLowerCase())) {
              throw Object.assign(new Error(`missing required participant ${req}`), { safeCode: toSafeCode('mapping') })
            }
          }

          for (const m of mapping) {
            const artifactId = await hashToUuid(`${payload.recording_id}:${m.filename}`)
            const providerAssetId = `${payload.recording_id}:${m.filename}`
            const objectKey = buildRecordingKey(interviewId, artifactId)
            const downloadResp = await fetch(m.url)
            if (!downloadResp.ok || !downloadResp.body || !(downloadResp.body instanceof ReadableStream)) {
              throw Object.assign(new Error('download failed'), { safeCode: toSafeCode('provider') })
            }
            const ctRaw = downloadResp.headers.get('content-type') ?? ''
            const ct = ctRaw.split(';')[0].trim().toLowerCase()
            if (!ALLOWED_RECORDING_CONTENT_TYPES.includes(ct)) {
              throw Object.assign(new Error(`unsupported content type ${ct}`), { safeCode: toSafeCode('validation') })
            }
            try {
              await storage.storeRecording({
                interviewId,
                recordingId: artifactId,
                contentType: ct,
                body: downloadResp.body as unknown as ReadableStream,
                captureTimestamp: nowIso,
                artifactKind: 'transcription_audio',
                participantId: m.participantId,
                participantRole: m.participantRole,
              })
            } catch {
              throw Object.assign(new Error('R2 write failed'), { safeCode: toSafeCode('storage') })
            }
            outArtifacts.push({
              artifactId,
              providerAssetId,
              objectKey,
              kind: 'transcription_audio',
              participantId: m.participantId,
              participantRole: m.participantRole,
              contentType: ct,
            })
          }
        }

        return { artifacts: outArtifacts }
      })

      artifacts = transfer.artifacts
      postClaimStage = 'persist'
      await step.do(STEP_PERSIST_ARTIFACTS, async () => {
        const connectionString = env.HYPERDRIVE?.connectionString
        if (!connectionString) throw new Error('HYPERDRIVE missing')
        const pool = createPostgresConnectionPool(connectionString)
        const client = await pool.connect()
        try {
          const now = new Date()
          const expiresAt = new Date(now.getTime() + RECORDING_FINALIZATION_LIMIT_DAYS * 24 * 60 * 60 * 1000)
          const nowIso = now.toISOString()
          const expIso = expiresAt.toISOString()
          for (const art of artifacts) {
            await client.query(
              `
            INSERT INTO interview_artifacts (
              id, interview_id, artifact_kind, participant_id, participant_role,
              object_key, provider_asset_id, content_metadata,
              captured_at, finalized_at, expires_at, created_at, updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT (provider_asset_id) WHERE provider_asset_id IS NOT NULL DO NOTHING
          `,
              [
                art.artifactId,
                interviewId,
                art.kind,
                art.participantId ?? null,
                art.participantRole ?? null,
                art.objectKey,
                art.providerAssetId,
                JSON.stringify({ contentType: art.contentType }),
                nowIso,
                nowIso,
                expIso,
                nowIso,
                nowIso,
              ],
            )
          }
        } finally {
          await client.release()
        }
      })

      postClaimStage = 'visibility'
      const visibility = await step.do(STEP_VISIBILITY, async (): Promise<{ visible: boolean }> => {
        const bucket = env.RECORDINGS_BUCKET as R2Bucket | undefined
        if (!bucket) return { visible: false }
        const port: R2BucketPort = createR2BucketPort(bucket)
        for (const art of artifacts) {
          const head = await port.head(art.objectKey)
          if (!head) return { visible: false }
        }
        return { visible: true }
      })

      if (!visibility.visible) {
        throw Object.assign(new Error('visibility failed'), { safeCode: toSafeCode('storage') })
      }

      postClaimStage = 'finalize'
      await step.do(STEP_FINALIZE, async () => {
        const connectionString = env.HYPERDRIVE?.connectionString
        if (!connectionString) throw new Error('HYPERDRIVE missing')
        const pool = createPostgresConnectionPool(connectionString)
        const client = await pool.connect()
        try {
          await client.query(
            `
          UPDATE interview_recordings
          SET finalization_status = $2,
              finalization_checkpoint = $3,
              error_code = NULL,
              updated_at = NOW()
          WHERE provider_recording_id = $1
        `,
            [payload.recording_id, 'finalized', 'finalized'],
          )
          const allRecs = await client.query(`SELECT id, finalization_status FROM interview_recordings WHERE interview_id = $1 /* required */`, [interviewId])
          const allFinalized = allRecs.rows.length > 0 && allRecs.rows.every((r) => (r as Record<string, unknown>).finalization_status === 'finalized')

          if (allFinalized) {
            const artRows = await client.query(`SELECT object_key FROM interview_artifacts WHERE interview_id = $1 AND deleted_at IS NULL AND artifact_kind IN ('playback_recording','transcription_audio')`, [interviewId])
            const bucket = env.RECORDINGS_BUCKET as R2Bucket | undefined
            if (bucket) {
              const port: R2BucketPort = createR2BucketPort(bucket)
              for (const row of artRows.rows as Array<Record<string, unknown>>) {
                const key = String(row.object_key ?? '')
                if (!key) {
                  throw Object.assign(new Error('missing artifact key'), { safeCode: toSafeCode('storage') })
                }
                const head = await port.head(key)
                if (!head) {
                  throw Object.assign(new Error('aggregate visibility failed'), { safeCode: toSafeCode('storage') })
                }
              }
              await client.query(`UPDATE interviews SET recording_status = $2, updated_at = NOW() WHERE id = $1`, [interviewId, 'ready'])
            }
          }
        } finally {
          await client.release()
        }
      })
    } catch (err) {
      let safe: string
      if (err && typeof err === 'object' && 'safeCode' in err) {
        const c = (err as { safeCode?: unknown }).safeCode
        if (typeof c === 'string') safe = c
        else if (postClaimStage === 'persist' || postClaimStage === 'finalize') safe = toSafeCode('database')
        else if (postClaimStage === 'visibility') safe = toSafeCode('storage')
        else safe = getSafeCode(err)
      } else {
        if (postClaimStage === 'persist' || postClaimStage === 'finalize') safe = toSafeCode('database')
        else if (postClaimStage === 'visibility') safe = toSafeCode('storage')
        else safe = getSafeCode(err)
      }
      try {
        await step.do(STEP_MARK_FAILED, async () => {
          const connectionString = env.HYPERDRIVE?.connectionString
          if (!connectionString) return
          const pool = createPostgresConnectionPool(connectionString)
          const client = await pool.connect()
          try {
            await client.query(
              `
                UPDATE interview_recordings
                SET finalization_status = $3,
                    error_code = $2,
                    finalization_checkpoint = $4,
                    updated_at = NOW()
                WHERE provider_recording_id = $1
              `,
              [payload.recording_id, safe, 'failed', 'failed'],
            )
          } finally {
            await client.release()
          }
        })
      } catch (markFailedErr: unknown) {
        // If marking failed also fails, throw to error the instance so sweep restarts it
        if (markFailedErr instanceof Error) throw markFailedErr
        throw new Error('mark_failed_failed')
      }
      return { status: 'failed', error_code: safe }
    }

    return { status: 'ready', interview_id: interviewId, artifacts: artifacts.length }
  }
}
