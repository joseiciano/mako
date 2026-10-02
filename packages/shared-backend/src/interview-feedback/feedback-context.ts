import type { ArtifactStoragePort } from '../interview-assets'
import { streamToBase64 } from './audio-encoding'
import type { FeedbackAnalysisConfig } from './feedback-analysis-config'
import type { FeedbackScreenshotArtifactRow } from './feedback-analysis-repository'

export type FeedbackEvidenceMetadata = {
  interviewType: string
  interviewMode: string
  interviewTier: string
  candidateAlias: string
}

export type FeedbackEvidenceScreenshot = {
  order: number
  objectKey: string
  contentType: string
  dataBase64: string
}

/** Safe, content-free truncation/selection metrics for observability (Story 5.17/5.18). */
export type FeedbackEvidenceMetrics = {
  transcriptOriginalChars: number
  transcriptBoundedChars: number
  transcriptTruncated: boolean
  screenshotsConsidered: number
  screenshotsIncluded: number
  screenshotsOmittedForCountLimit: number
  screenshotsOmittedForUnsupportedType: number
  screenshotsOmittedForByteLimit: number
  screenshotsOmittedForMissingObject: number
}

export type FeedbackEvidenceContext = {
  metadata: FeedbackEvidenceMetadata
  transcript: string
  screenshots: FeedbackEvidenceScreenshot[]
  metrics: FeedbackEvidenceMetrics
}

const TRUNCATION_MARKER = '\n...[transcript truncated: middle section omitted]...\n'

/**
 * Deterministically truncates transcript text to a bounded length while
 * preserving both the beginning and the end — where interview framing and
 * wrap-up context typically live — by splitting the remaining budget evenly
 * between the head and tail around a fixed marker.
 */
export function truncateTranscriptPreservingEnds(
  transcript: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (transcript.length <= maxChars) {
    return { text: transcript, truncated: false }
  }

  const budget = Math.max(0, maxChars - TRUNCATION_MARKER.length)
  const headLength = Math.ceil(budget / 2)
  const tailLength = Math.max(0, budget - headLength)
  const head = transcript.slice(0, headLength)
  const tail = tailLength > 0 ? transcript.slice(transcript.length - tailLength) : ''

  return { text: `${head}${TRUNCATION_MARKER}${tail}`, truncated: true }
}

/**
 * Builds the bounded, deterministic evidence context sent to the feedback
 * analysis model (Story 5.17): canonical interview metadata, the persisted
 * transcript (truncated deterministically, preserving both ends), and a
 * capture-ordered, count/byte-bounded set of finalized whiteboard
 * screenshots read directly from private R2. An empty finalized screenshot
 * set is valid — screenshots are optional supplementary evidence and are
 * never required for analysis to proceed. Both transcript and screenshot
 * bytes are treated as opaque evidence here; nothing in this function
 * interprets their content.
 */
export async function buildFeedbackEvidenceContext(input: {
  metadata: FeedbackEvidenceMetadata
  transcript: string
  screenshotRows: readonly FeedbackScreenshotArtifactRow[]
  storagePort: ArtifactStoragePort
  config: FeedbackAnalysisConfig
}): Promise<FeedbackEvidenceContext> {
  const { text: boundedTranscript, truncated } = truncateTranscriptPreservingEnds(
    input.transcript,
    input.config.maxTranscriptChars,
  )

  const metrics: FeedbackEvidenceMetrics = {
    transcriptOriginalChars: input.transcript.length,
    transcriptBoundedChars: boundedTranscript.length,
    transcriptTruncated: truncated,
    screenshotsConsidered: input.screenshotRows.length,
    screenshotsIncluded: 0,
    screenshotsOmittedForCountLimit: 0,
    screenshotsOmittedForUnsupportedType: 0,
    screenshotsOmittedForByteLimit: 0,
    screenshotsOmittedForMissingObject: 0,
  }

  const screenshots: FeedbackEvidenceScreenshot[] = []

  for (const row of input.screenshotRows) {
    if (screenshots.length >= input.config.maxScreenshots) {
      metrics.screenshotsOmittedForCountLimit += 1
      continue
    }

    const contentType = row.content_type
    if (!contentType || !input.config.supportedScreenshotContentTypes.includes(contentType)) {
      metrics.screenshotsOmittedForUnsupportedType += 1
      continue
    }

    const head = await input.storagePort.headArtifact(row.object_key)
    if (!head) {
      metrics.screenshotsOmittedForMissingObject += 1
      continue
    }

    if (head.size > input.config.maxScreenshotBytes) {
      metrics.screenshotsOmittedForByteLimit += 1
      continue
    }

    const object = await input.storagePort.getObject(row.object_key)
    if (!object) {
      metrics.screenshotsOmittedForMissingObject += 1
      continue
    }

    const dataBase64 = await streamToBase64(object.body)
    screenshots.push({
      order: screenshots.length,
      objectKey: row.object_key,
      contentType,
      dataBase64,
    })
    metrics.screenshotsIncluded += 1
  }

  return {
    metadata: input.metadata,
    transcript: boundedTranscript,
    screenshots,
    metrics,
  }
}
