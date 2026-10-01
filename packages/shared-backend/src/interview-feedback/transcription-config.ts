export type TranscriptionConfig = {
  /** Cloudflare Workers AI model id. */
  model: string
  /** Default spoken-language hint passed to Whisper. */
  language: string
  /** Deterministic bounded chunk size for R2 range reads, in bytes. */
  chunkBytes: number
  /**
   * Overlap window between consecutive chunk ranges so a chunk boundary
   * never permanently cuts a word in half; `transcript-assembly.ts` removes
   * the resulting duplicated text when stitching chunk output back together.
   */
  overlapBytes: number
  /** Bounded per-chunk inference retry attempts before surfacing a failure. */
  maxRetries: number
  /** Per-inference-call timeout in milliseconds. */
  timeoutMs: number
  /**
   * Content types Workers AI Whisper transcription is verified to accept in
   * production for this pipeline. Intentionally narrower than the storage
   * layer's `allowedRecordingContentTypes`.
   */
  supportedContentTypes: readonly string[]
  /** Hard cap on the persisted transcript length, in characters. */
  maxTranscriptChars: number
  /** Maximum number of words checked when deduping overlapping chunk text. */
  maxOverlapWords: number
}

/**
 * Versioned server-side transcription configuration (Story 5.16). Model
 * choice, language defaults, and inference options are kept server-side and
 * never accepted from a client or provider response. Bump this version
 * identifier whenever the shape or defaults change so operational replay
 * stays auditable.
 */
export const TRANSCRIPTION_CONFIG_VERSION = 'transcription-v1'

export const DEFAULT_TRANSCRIPTION_CONFIG: TranscriptionConfig = {
  model: '@cf/openai/whisper-large-v3-turbo',
  language: 'en',
  // 20 MiB bounded chunk, Base64-encoded and submitted one at a time so a
  // full ~60-minute recording is never buffered in memory at once.
  chunkBytes: 20 * 1024 * 1024,
  // ~a few seconds of audio overlap between consecutive chunk windows.
  overlapBytes: 64 * 1024,
  maxRetries: 2,
  timeoutMs: 60_000,
  // RealtimeKit participant tracks are currently produced as WebM.
  // Workers AI Whisper support for that container has not been verified
  // against production 60-minute fixtures (see this story's implementation
  // notes), so WebM/MP4-video stays off this allowlist until a separately
  // approved conversion path or verified format exists. Only narrowly
  // scoped, widely-supported audio containers are enabled today.
  supportedContentTypes: ['audio/mp4', 'audio/m4a', 'audio/ogg'],
  maxTranscriptChars: 120_000,
  maxOverlapWords: 20,
}
