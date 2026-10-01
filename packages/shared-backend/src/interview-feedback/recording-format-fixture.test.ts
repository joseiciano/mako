import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { ArtifactStoragePort } from '../interview-assets'
import { arrayBufferToBase64 } from './audio-encoding'
import { computeChunkRanges } from './chunk-planner'
import { TranscriptionChunkRepository } from './transcription-chunk-repository'
import { DEFAULT_TRANSCRIPTION_CONFIG, type TranscriptionConfig } from './transcription-config'
import { TranscriptionRepository } from './transcription-repository'
import { TranscriptionService } from './transcription-service'
import type { TranscriptionAdapterPort } from './types'

/**
 * Story 5.16 representative integration fixture (AC #4): a small, generated,
 * non-sensitive silent Ogg/Vorbis audio file in the one production recording
 * format this pipeline accepts without a separately approved conversion
 * path. No real interview audio is committed; this is 2 seconds of silence
 * generated with `ffmpeg -f lavfi -i anullsrc`.
 *
 * This exercises the real byte-range reading, Base64 chunk encoding, and
 * chunk-checkpoint/transcript-assembly plumbing against actual encoded
 * container bytes rather than synthetic arrays, with only the Workers AI
 * network call itself mocked.
 */
const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'silence.ogg')
const interviewId = '11111111-1111-4111-8111-111111111111'
const attemptId = 'attempt-fixture'

function createInMemoryStoragePort(objectKey: string, fileBytes: Buffer, contentType: string): ArtifactStoragePort {
  return {
    async headArtifact(key: string) {
      if (key !== objectKey) {
        return null
      }
      return { size: fileBytes.length, contentType }
    },
    async getObject(key: string, range?: { offset: number; length: number }) {
      if (key !== objectKey) {
        return null
      }
      const slice = range ? fileBytes.subarray(range.offset, range.offset + range.length) : fileBytes
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(slice))
          controller.close()
        },
      })
      return { body, metadata: {}, size: fileBytes.length, contentType }
    },
  } as unknown as ArtifactStoragePort
}

function createMockTranscriptionRepository() {
  return {
    getTranscriptionState: vi.fn<TranscriptionRepository['getTranscriptionState']>(),
    listFinalizedAudioArtifacts: vi.fn<TranscriptionRepository['listFinalizedAudioArtifacts']>(),
    persistTranscript: vi.fn<TranscriptionRepository['persistTranscript']>(),
  }
}

function createMockChunkRepository() {
  return {
    listChunks: vi.fn<TranscriptionChunkRepository['listChunks']>(),
    upsertChunk: vi.fn<TranscriptionChunkRepository['upsertChunk']>(),
  }
}

describe('production recording format fixture (Ogg/Vorbis)', function suite() {
  it('range-reads, Base64-encodes, and transcribes a real Ogg container across multiple bounded chunks', async function run() {
    const fileBytes = readFileSync(FIXTURE_PATH)
    expect(fileBytes.length).toBeGreaterThan(1024) // confirms this exercises more than one chunk below

    const objectKey = `interviews/${interviewId}/recording/${attemptId}`
    const contentType = 'audio/ogg'
    const config: TranscriptionConfig = {
      ...DEFAULT_TRANSCRIPTION_CONFIG,
      supportedContentTypes: ['audio/ogg'],
      chunkBytes: 1024,
      overlapBytes: 64,
    }

    const storagePort = createInMemoryStoragePort(objectKey, fileBytes, contentType)
    const transcriptionRepository = createMockTranscriptionRepository()
    const chunkRepository = createMockChunkRepository()

    const expectedRanges = computeChunkRanges(fileBytes.length, config.chunkBytes, config.overlapBytes)
    expect(expectedRanges.length).toBeGreaterThan(1)

    const seenBase64Chunks: string[] = []
    const adapter: TranscriptionAdapterPort = {
      async transcribeChunk(input) {
        seenBase64Chunks.push(input.audioBase64)
        // One deterministic, distinguishable word per chunk index so final
        // assembly order can be asserted below.
        return { text: `segment${seenBase64Chunks.length}` }
      },
    }

    transcriptionRepository.getTranscriptionState.mockResolvedValue({
      transcript: null,
      feedback_status: 'processing',
      feedback_attempt_id: attemptId,
    })
    transcriptionRepository.listFinalizedAudioArtifacts.mockResolvedValue([
      { participant_role: 'candidate', object_key: objectKey, finalized_at: '2026-01-01T00:00:00.000Z' },
    ])
    chunkRepository.listChunks.mockResolvedValue([])
    transcriptionRepository.persistTranscript.mockResolvedValue(true)

    const service = new TranscriptionService(
      transcriptionRepository as unknown as TranscriptionRepository,
      chunkRepository as unknown as TranscriptionChunkRepository,
      storagePort,
      adapter,
      config,
    )

    const result = await service.run({ interviewId, attemptId, mode: 'ai_led' })

    expect(result.outcome).toBe('persisted')
    // Every chunk was submitted base64-encoded, one at a time, matching the
    // exact bytes of the real file's deterministic range windows.
    expect(seenBase64Chunks).toHaveLength(expectedRanges.length)
    expectedRanges.forEach((rangeWindow, index) => {
      const expectedBytes = fileBytes.subarray(rangeWindow.offset, rangeWindow.offset + rangeWindow.length)
      expect(seenBase64Chunks[index]).toBe(arrayBufferToBase64(new Uint8Array(expectedBytes).buffer as ArrayBuffer))
    })
    // Each per-chunk checkpoint was persisted in order, so a retry would
    // reuse all of them instead of restarting the full recording.
    expect(chunkRepository.upsertChunk).toHaveBeenCalledTimes(expectedRanges.length)
    for (let index = 0; index < expectedRanges.length; index += 1) {
      expect(chunkRepository.upsertChunk).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({ chunkIndex: index, status: 'transcribed' }),
      )
    }
  })

  it('rejects an unsupported content type for the same real file without inference', async function run() {
    const fileBytes = readFileSync(FIXTURE_PATH)
    const objectKey = `interviews/${interviewId}/recording/${attemptId}`
    const config: TranscriptionConfig = {
      ...DEFAULT_TRANSCRIPTION_CONFIG,
      supportedContentTypes: ['audio/mp4'], // Ogg deliberately not allowlisted for this check
    }

    const storagePort = createInMemoryStoragePort(objectKey, fileBytes, 'audio/ogg')
    const transcriptionRepository = createMockTranscriptionRepository()
    const chunkRepository = createMockChunkRepository()
    const adapter: TranscriptionAdapterPort = { transcribeChunk: vi.fn() }

    transcriptionRepository.getTranscriptionState.mockResolvedValue({
      transcript: null,
      feedback_status: 'processing',
      feedback_attempt_id: attemptId,
    })
    transcriptionRepository.listFinalizedAudioArtifacts.mockResolvedValue([
      { participant_role: 'candidate', object_key: objectKey, finalized_at: '2026-01-01T00:00:00.000Z' },
    ])

    const service = new TranscriptionService(
      transcriptionRepository as unknown as TranscriptionRepository,
      chunkRepository as unknown as TranscriptionChunkRepository,
      storagePort,
      adapter,
      config,
    )

    const result = await service.run({ interviewId, attemptId, mode: 'ai_led' })

    expect(result).toEqual({ outcome: 'unsupported_format' })
    expect(adapter.transcribeChunk).not.toHaveBeenCalled()
  })
})
