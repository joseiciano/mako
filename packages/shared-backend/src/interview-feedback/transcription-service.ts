import type { ArtifactStoragePort } from '../interview-assets'
import { computeChunkRanges } from './chunk-planner'
import { appendChunkText, buildRoleLabeledTranscript, truncateTranscript } from './transcript-assembly'
import { streamToBase64 } from './audio-encoding'
import type { TranscriptionConfig } from './transcription-config'
import { TranscriptionChunkRepository } from './transcription-chunk-repository'
import { TranscriptionRepository } from './transcription-repository'
import type {
  RequiredAudioTrack,
  RequiredParticipantRole,
  TranscriptionAdapterPort,
} from './types'

export type TranscriptionRunMode = 'ai_led' | 'peer_to_peer'

const REQUIRED_ROLES_BY_MODE: Readonly<Record<TranscriptionRunMode, readonly RequiredParticipantRole[]>> = {
  ai_led: ['candidate'],
  peer_to_peer: ['candidate', 'interviewer'],
}

export type TranscriptionReadinessOutcome =
  | { outcome: 'reused'; transcript: string }
  | { outcome: 'stale' }
  | { outcome: 'ready'; tracks: RequiredAudioTrack[] }
  | { outcome: 'not_ready' }
  | { outcome: 'unsupported_format' }

export type TranscribeAndPersistOutcome =
  | { outcome: 'persisted'; transcript: string }
  | { outcome: 'reused'; transcript: string }
  | { outcome: 'stale' }
  | { outcome: 'failed'; error_code: 'transcription_failed' }

export type TranscriptionRunOutcome = TranscriptionReadinessOutcome | TranscribeAndPersistOutcome

/** A required audio artifact object disappeared from R2 mid-run. */
export class TranscriptionChunkUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranscriptionChunkUnavailableError'
  }
}

/**
 * Orchestrates Story 5.16: resolves and validates required participant audio
 * tracks, transcribes bounded R2-range chunks sequentially through Workers
 * AI Whisper, persists per-chunk checkpoints so retries never restart the
 * full recording, and writes one idempotent, attempt-fenced final
 * transcript. Never sends screenshots, user identifiers, or unrelated
 * interview records to the transcription model — only bounded audio bytes.
 */
export class TranscriptionService {
  constructor(
    private readonly transcriptionRepository: TranscriptionRepository,
    private readonly chunkRepository: TranscriptionChunkRepository,
    private readonly storagePort: ArtifactStoragePort,
    private readonly adapter: TranscriptionAdapterPort,
    private readonly config: TranscriptionConfig,
  ) {}

  /** Convenience wrapper composing readiness + transcription for simple callers. */
  async run(input: {
    interviewId: string
    attemptId: string
    mode: TranscriptionRunMode
  }): Promise<TranscriptionRunOutcome> {
    const readiness = await this.checkReadiness(input.interviewId, input.attemptId, input.mode)

    if (readiness.outcome !== 'ready') {
      return readiness
    }

    return this.transcribeAndPersist({
      interviewId: input.interviewId,
      attemptId: input.attemptId,
      tracks: readiness.tracks,
    })
  }

  /**
   * Resolves whether this attempt should (re)transcribe: reuses an existing
   * transcript, detects a stale/replaced attempt, and otherwise verifies
   * every required participant track is finalized in Postgres, exists in
   * R2, and has an allowlisted content type.
   */
  async checkReadiness(
    interviewId: string,
    attemptId: string,
    mode: TranscriptionRunMode,
  ): Promise<TranscriptionReadinessOutcome> {
    const state = await this.transcriptionRepository.getTranscriptionState(interviewId)

    if (!state) {
      return { outcome: 'stale' }
    }

    if (state.transcript !== null) {
      return { outcome: 'reused', transcript: state.transcript }
    }

    if (state.feedback_status !== 'processing' || state.feedback_attempt_id !== attemptId) {
      return { outcome: 'stale' }
    }

    return this.resolveRequiredTracks(interviewId, mode)
  }

  /**
   * Transcribes every required track (reusing already-completed chunks) and
   * persists one bounded, role-labelled transcript. Assumes the caller
   * already confirmed readiness via `checkReadiness`.
   */
  async transcribeAndPersist(input: {
    interviewId: string
    attemptId: string
    tracks: readonly RequiredAudioTrack[]
  }): Promise<TranscribeAndPersistOutcome> {
    const roleTranscripts: Array<{ participantRole: string; text: string }> = []

    try {
      for (const track of input.tracks) {
        const text = await this.transcribeTrack(input.interviewId, input.attemptId, track)
        roleTranscripts.push({ participantRole: track.participantRole, text })
      }
    } catch {
      return { outcome: 'failed', error_code: 'transcription_failed' }
    }

    const combined = buildRoleLabeledTranscript(roleTranscripts)

    if (combined.trim() === '') {
      // Empty/near-silent output across every required track: reject rather
      // than persist an unusable transcript.
      return { outcome: 'failed', error_code: 'transcription_failed' }
    }

    const bounded = truncateTranscript(combined, this.config.maxTranscriptChars)
    const persisted = await this.transcriptionRepository.persistTranscript({
      interviewId: input.interviewId,
      attemptId: input.attemptId,
      transcript: bounded,
    })

    if (persisted) {
      return { outcome: 'persisted', transcript: bounded }
    }

    // Lost the race: re-read so freshly computed work is reused rather than
    // silently discarded if another process already persisted a transcript.
    const latest = await this.transcriptionRepository.getTranscriptionState(input.interviewId)

    if (latest && latest.transcript !== null) {
      return { outcome: 'reused', transcript: latest.transcript }
    }

    return { outcome: 'stale' }
  }

  private async resolveRequiredTracks(
    interviewId: string,
    mode: TranscriptionRunMode,
  ): Promise<
    | { outcome: 'ready'; tracks: RequiredAudioTrack[] }
    | { outcome: 'not_ready' }
    | { outcome: 'unsupported_format' }
  > {
    const requiredRoles = REQUIRED_ROLES_BY_MODE[mode]
    const rows = await this.transcriptionRepository.listFinalizedAudioArtifacts(interviewId)
    const latestByRole = new Map<string, (typeof rows)[number]>()

    for (const row of rows) {
      if (row.participant_role && !latestByRole.has(row.participant_role)) {
        latestByRole.set(row.participant_role, row)
      }
    }

    const tracks: RequiredAudioTrack[] = []

    for (const role of requiredRoles) {
      const row = latestByRole.get(role)

      if (!row || !row.object_key || !row.finalized_at) {
        return { outcome: 'not_ready' }
      }

      const head = await this.storagePort.headArtifact(row.object_key)

      if (!head) {
        return { outcome: 'not_ready' }
      }

      if (!this.config.supportedContentTypes.includes(head.contentType)) {
        return { outcome: 'unsupported_format' }
      }

      tracks.push({
        participantRole: role,
        objectKey: row.object_key,
        contentType: head.contentType,
        size: head.size,
      })
    }

    return { outcome: 'ready', tracks }
  }

  private async transcribeTrack(
    interviewId: string,
    attemptId: string,
    track: RequiredAudioTrack,
  ): Promise<string> {
    const ranges = computeChunkRanges(track.size, this.config.chunkBytes, this.config.overlapBytes)
    const existingChunks = await this.chunkRepository.listChunks(
      interviewId,
      attemptId,
      track.participantRole,
    )
    const existingByIndex = new Map(existingChunks.map((chunk) => [chunk.chunk_index, chunk]))

    let assembled = ''

    for (let index = 0; index < ranges.length; index += 1) {
      const existing = existingByIndex.get(index)

      if (existing && existing.status === 'transcribed') {
        assembled = appendChunkText(assembled, existing.transcript_text ?? '', this.config.maxOverlapWords)
        continue
      }

      const text = await this.transcribeChunkAndCheckpoint(
        interviewId,
        attemptId,
        track,
        index,
        ranges[index],
      )
      assembled = appendChunkText(assembled, text, this.config.maxOverlapWords)
    }

    return assembled
  }

  private async transcribeChunkAndCheckpoint(
    interviewId: string,
    attemptId: string,
    track: RequiredAudioTrack,
    chunkIndex: number,
    range: { offset: number; length: number },
  ): Promise<string> {
    const object = await this.storagePort.getObject(track.objectKey, range)

    if (!object) {
      await this.chunkRepository.upsertChunk({
        id: crypto.randomUUID(),
        interviewId,
        attemptId,
        participantRole: track.participantRole,
        chunkIndex,
        status: 'failed',
        transcriptText: null,
      })
      throw new TranscriptionChunkUnavailableError(
        `Transcription audio object ${track.objectKey} was unavailable for chunk ${chunkIndex}.`,
      )
    }

    const audioBase64 = await streamToBase64(object.body)

    try {
      const result = await this.adapter.transcribeChunk({
        audioBase64,
        language: this.config.language,
      })

      await this.chunkRepository.upsertChunk({
        id: crypto.randomUUID(),
        interviewId,
        attemptId,
        participantRole: track.participantRole,
        chunkIndex,
        status: 'transcribed',
        transcriptText: result.text,
      })

      return result.text
    } catch (error) {
      await this.chunkRepository.upsertChunk({
        id: crypto.randomUUID(),
        interviewId,
        attemptId,
        participantRole: track.participantRole,
        chunkIndex,
        status: 'failed',
        transcriptText: null,
      })
      throw error
    }
  }
}
