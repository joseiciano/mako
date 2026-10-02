import type { Ai } from '@cloudflare/workers-types'
import { z } from 'zod'
import type { TranscriptionConfig } from './transcription-config'
import {
  TranscriptionInvalidResponseError,
  TranscriptionProviderError,
  type TranscribeChunkInput,
  type TranscribeChunkResult,
  type TranscriptionAdapterPort,
} from './types'

const whisperResponseSchema = z
  .object({
    text: z.string(),
  })
  .passthrough()

/**
 * Wraps the notification-orchestrator `AI` Workers AI binding for Whisper
 * long-audio transcription (Story 5.16). Sets a conservative, versioned
 * inference configuration, validates the provider response shape before any
 * caller sees it, and retries a bounded number of times on provider/timeout
 * errors. An invalid (but received) response is not retried — the provider
 * answered, so retrying would not change its shape.
 */
export function createWorkersAiTranscriptionAdapter(
  ai: Ai,
  config: TranscriptionConfig,
): TranscriptionAdapterPort {
  return {
    async transcribeChunk(input: TranscribeChunkInput): Promise<TranscribeChunkResult> {
      let lastError: unknown

      for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
        try {
          const raw = await runWithTimeout(
            ai.run(config.model, buildWhisperInput(input)),
            config.timeoutMs,
          )
          return parseWhisperResponse(raw)
        } catch (error) {
          if (error instanceof TranscriptionInvalidResponseError) {
            throw error
          }
          lastError = error
        }
      }

      throw new TranscriptionProviderError(
        'Workers AI transcription failed after bounded retries.',
        { cause: lastError },
      )
    },
  }
}

function buildWhisperInput(input: TranscribeChunkInput): Record<string, unknown> {
  return {
    audio: input.audioBase64,
    task: 'transcribe',
    language: input.language,
    // Conservative voice-activity/no-speech handling suitable for interview
    // recordings: filter obvious silence, but keep the default no-speech
    // threshold rather than aggressively discarding quiet speech.
    vad_filter: true,
    // Each chunk is an independent raw byte window, not a clean sentence
    // boundary, so conditioning on prior text risks hallucination loops
    // bleeding across chunk boundaries.
    condition_on_previous_text: false,
  }
}

function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>(function executor(resolve, reject) {
    const timer = setTimeout(function onTimeout() {
      reject(new TranscriptionProviderError('Workers AI transcription timed out.'))
    }, timeoutMs)

    promise.then(
      function onResolve(value) {
        clearTimeout(timer)
        resolve(value)
      },
      function onReject(error: unknown) {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function parseWhisperResponse(raw: unknown): TranscribeChunkResult {
  const parsed = whisperResponseSchema.safeParse(raw)

  if (!parsed.success) {
    throw new TranscriptionInvalidResponseError(
      'Workers AI transcription response did not match the expected shape.',
    )
  }

  return { text: parsed.data.text }
}
