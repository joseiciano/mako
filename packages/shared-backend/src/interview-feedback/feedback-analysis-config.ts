export type FeedbackAnalysisConfig = {
  /**
   * Pinned Cloudflare Workers AI model id. Must be a server-selected,
   * high-reasoning model that supports image inputs so whiteboard
   * screenshot evidence is never silently dropped.
   */
  model: string
  /**
   * Documents that `model` is verified to accept multimodal (image) chat
   * input. This is a readiness/documentation flag only: screenshot
   * inclusion in `feedback-context.ts`/`feedback-prompt.ts` never branches
   * on it, so a misconfigured value can never cause evidence to be
   * silently dropped at runtime (Story 5.17 AC #2). Operators must instead
   * only ever pin a genuinely vision-capable model here.
   */
  supportsVision: boolean
  /** Bounded per-request inference retry attempts before surfacing a failure. */
  maxRetries: number
  /** Per-inference-call timeout in milliseconds. */
  timeoutMs: number
  /** Maximum tokens requested from the provider for the structured JSON report. */
  maxOutputTokens: number
  /** Hard cap on transcript characters sent as evidence, before the provider call. */
  maxTranscriptChars: number
  /** Maximum number of finalized screenshots sent as evidence, in capture order. */
  maxScreenshots: number
  /**
   * Maximum size, in bytes, of a single screenshot object considered as
   * evidence. Deliberately tighter than the storage layer's per-screenshot
   * cap (`DEFAULT_ARTIFACT_STORAGE_CONFIG.maxScreenshotBytes`) to keep the
   * Base64-inflated multimodal request payload bounded.
   */
  maxScreenshotBytes: number
  /** Screenshot content types this pipeline is verified to send as image evidence. */
  supportedScreenshotContentTypes: readonly string[]
}

/**
 * Versioned server-side feedback analysis configuration (Story 5.17). Model
 * choice, reasoning/vision capability, and context bounds are kept
 * server-side and are never accepted from a client or provider response.
 * Bump this version identifier whenever the shape or defaults change so
 * operational replay stays auditable.
 */
export const FEEDBACK_ANALYSIS_CONFIG_VERSION = 'feedback-analysis-v1'

export const DEFAULT_FEEDBACK_ANALYSIS_CONFIG: FeedbackAnalysisConfig = {
  // Cloudflare Workers AI's vision-instruct model: accepts image chat
  // content alongside text and is served through the same AI Gateway path
  // already used for AI-led chat guidance (Story 4.3).
  model: '@cf/meta/llama-3.2-11b-vision-instruct',
  supportsVision: true,
  maxRetries: 2,
  timeoutMs: 60_000,
  maxOutputTokens: 2_000,
  maxTranscriptChars: 60_000,
  maxScreenshots: 6,
  // 2 MiB per image keeps a full 6-screenshot request's Base64-inflated
  // payload well under common request-size limits.
  maxScreenshotBytes: 2 * 1024 * 1024,
  supportedScreenshotContentTypes: ['image/png'],
}
