/**
 * Shared types and ports for the Story 5.16 Workers AI transcription
 * pipeline. Keeping these structural (no concrete Cloudflare types) lets
 * every piece of business logic in this module be unit tested with plain
 * mocks; the notification-orchestrator Worker is the only place that wires a
 * real `Ai` binding and `R2Bucket` through these ports.
 */

/**
 * AI-led sessions only ever require the candidate track; peer-to-peer
 * sessions require both participant-separated tracks mapped to these roles
 * (mirrors the mapping already persisted by the recording finalization
 * workflow in `interview_artifacts.participant_role`).
 */
export type RequiredParticipantRole = 'candidate' | 'interviewer'

export type RequiredAudioTrack = {
  participantRole: RequiredParticipantRole
  objectKey: string
  contentType: string
  size: number
}

export type TranscribeChunkInput = {
  audioBase64: string
  language: string
}

export type TranscribeChunkResult = {
  text: string
}

export type TranscriptionAdapterPort = {
  transcribeChunk(input: TranscribeChunkInput): Promise<TranscribeChunkResult>
}

/** The provider was unreachable, timed out, or exhausted bounded retries. */
export class TranscriptionProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'TranscriptionProviderError'
  }
}

/** The provider responded, but the response shape could not be validated. */
export class TranscriptionInvalidResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranscriptionInvalidResponseError'
  }
}
