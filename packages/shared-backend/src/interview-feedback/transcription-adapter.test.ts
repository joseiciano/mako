import type { Ai } from '@cloudflare/workers-types'
import { describe, expect, it, vi } from 'vitest'
import { createWorkersAiTranscriptionAdapter } from './transcription-adapter'
import { DEFAULT_TRANSCRIPTION_CONFIG, type TranscriptionConfig } from './transcription-config'
import { TranscriptionInvalidResponseError, TranscriptionProviderError } from './types'

function createMockAi(run: (...args: unknown[]) => unknown): Ai {
  return { run: vi.fn(run) } as unknown as Ai
}

const testConfig: TranscriptionConfig = {
  ...DEFAULT_TRANSCRIPTION_CONFIG,
  maxRetries: 2,
  timeoutMs: 50,
}

describe('createWorkersAiTranscriptionAdapter', function suite() {
  describe('transcribeChunk', function transcribeChunkSuite() {
    it('parses a successful response and returns its text', async function run() {
      const ai = createMockAi(async () => ({ text: 'hello world' }))
      const adapter = createWorkersAiTranscriptionAdapter(ai, testConfig)

      const result = await adapter.transcribeChunk({ audioBase64: 'YWJj', language: 'en' })

      expect(result).toEqual({ text: 'hello world' })
    })

    it('sends conservative transcription inference options to the binding', async function run() {
      const ai = createMockAi(async () => ({ text: 'ok' }))
      const adapter = createWorkersAiTranscriptionAdapter(ai, testConfig)

      await adapter.transcribeChunk({ audioBase64: 'YWJj', language: 'fr' })

      expect(ai.run).toHaveBeenCalledExactlyOnceWith(testConfig.model, {
        audio: 'YWJj',
        task: 'transcribe',
        language: 'fr',
        vad_filter: true,
        condition_on_previous_text: false,
      })
    })

    it('accepts an empty transcript for silent/near-silent audio without throwing', async function run() {
      const ai = createMockAi(async () => ({ text: '' }))
      const adapter = createWorkersAiTranscriptionAdapter(ai, testConfig)

      const result = await adapter.transcribeChunk({ audioBase64: 'YWJj', language: 'en' })

      expect(result).toEqual({ text: '' })
    })

    it('throws TranscriptionInvalidResponseError for a response missing the text field', async function run() {
      const ai = createMockAi(async () => ({ not_text: 'oops' }))
      const adapter = createWorkersAiTranscriptionAdapter(ai, testConfig)

      await expect(adapter.transcribeChunk({ audioBase64: 'YWJj', language: 'en' })).rejects.toThrow(
        TranscriptionInvalidResponseError,
      )
      // An invalid (but received) response shape is not retried.
      expect(ai.run).toHaveBeenCalledTimes(1)
    })

    it('throws TranscriptionInvalidResponseError for a non-object response', async function run() {
      const ai = createMockAi(async () => 'just a string')
      const adapter = createWorkersAiTranscriptionAdapter(ai, testConfig)

      await expect(adapter.transcribeChunk({ audioBase64: 'YWJj', language: 'en' })).rejects.toThrow(
        TranscriptionInvalidResponseError,
      )
    })

    it('retries a bounded number of times on provider error, then throws TranscriptionProviderError', async function run() {
      const ai = createMockAi(async () => {
        throw new Error('provider unavailable')
      })
      const adapter = createWorkersAiTranscriptionAdapter(ai, testConfig)

      await expect(adapter.transcribeChunk({ audioBase64: 'YWJj', language: 'en' })).rejects.toThrow(
        TranscriptionProviderError,
      )
      expect(ai.run).toHaveBeenCalledTimes(testConfig.maxRetries + 1)
    })

    it('succeeds after a transient provider error within the retry budget', async function run() {
      let callCount = 0
      const ai = createMockAi(async () => {
        callCount += 1
        if (callCount === 1) {
          throw new Error('transient failure')
        }
        return { text: 'recovered' }
      })
      const adapter = createWorkersAiTranscriptionAdapter(ai, testConfig)

      const result = await adapter.transcribeChunk({ audioBase64: 'YWJj', language: 'en' })

      expect(result).toEqual({ text: 'recovered' })
      expect(ai.run).toHaveBeenCalledTimes(2)
    })

    it('treats a timeout as a retryable provider error and eventually throws TranscriptionProviderError', async function run() {
      const ai = createMockAi(function runNeverResolves() {
        return new Promise(() => {
          // Never resolves; the adapter's internal timeout must win the race.
        })
      })
      const adapter = createWorkersAiTranscriptionAdapter(ai, { ...testConfig, maxRetries: 0, timeoutMs: 10 })

      await expect(adapter.transcribeChunk({ audioBase64: 'YWJj', language: 'en' })).rejects.toThrow(
        TranscriptionProviderError,
      )
    })
  })
})
