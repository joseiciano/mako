import { describe, expect, it, vi } from 'vitest'
import type { ArtifactStoragePort } from '../interview-assets'
import { DEFAULT_TRANSCRIPTION_CONFIG, type TranscriptionConfig } from './transcription-config'
import { TranscriptionChunkRepository, type TranscriptionChunkRow } from './transcription-chunk-repository'
import { TranscriptionRepository } from './transcription-repository'
import { TranscriptionService } from './transcription-service'
import type { TranscriptionAdapterPort } from './types'

const interviewId = '11111111-1111-4111-8111-111111111111'
const attemptId = 'attempt-1'

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

function createMockStoragePort() {
  return {
    headArtifact: vi.fn<ArtifactStoragePort['headArtifact']>(),
    getObject: vi.fn<ArtifactStoragePort['getObject']>(),
  }
}

function createMockAdapter() {
  return {
    transcribeChunk: vi.fn<TranscriptionAdapterPort['transcribeChunk']>(),
  }
}

function bodyStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    },
  })
}

function createService(overrides: {
  config?: Partial<TranscriptionConfig>
  transcriptionRepository?: ReturnType<typeof createMockTranscriptionRepository>
  chunkRepository?: ReturnType<typeof createMockChunkRepository>
  storagePort?: ReturnType<typeof createMockStoragePort>
  adapter?: ReturnType<typeof createMockAdapter>
} = {}) {
  const transcriptionRepository = overrides.transcriptionRepository ?? createMockTranscriptionRepository()
  const chunkRepository = overrides.chunkRepository ?? createMockChunkRepository()
  const storagePort = overrides.storagePort ?? createMockStoragePort()
  const adapter = overrides.adapter ?? createMockAdapter()
  const config: TranscriptionConfig = { ...DEFAULT_TRANSCRIPTION_CONFIG, ...overrides.config }

  const service = new TranscriptionService(
    transcriptionRepository as unknown as TranscriptionRepository,
    chunkRepository as unknown as TranscriptionChunkRepository,
    storagePort as unknown as ArtifactStoragePort,
    adapter as unknown as TranscriptionAdapterPort,
    config,
  )

  return { service, transcriptionRepository, chunkRepository, storagePort, adapter, config }
}

function chunkRow(overrides: Partial<TranscriptionChunkRow> = {}): TranscriptionChunkRow {
  return {
    id: 'chunk-id',
    interview_id: interviewId,
    feedback_attempt_id: attemptId,
    participant_role: 'candidate',
    chunk_index: 0,
    status: 'transcribed',
    transcript_text: 'hello',
    ...overrides,
  }
}

describe('TranscriptionService', function suite() {
  describe('checkReadiness', function checkReadinessSuite() {
    it('returns stale when the interview no longer exists', async function run() {
      const { service, transcriptionRepository } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue(null)

      const result = await service.checkReadiness(interviewId, attemptId, 'ai_led')

      expect(result).toEqual({ outcome: 'stale' })
    })

    it('reuses an existing transcript without re-checking tracks (existing-transcript reuse)', async function run() {
      const { service, transcriptionRepository } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: 'already transcribed',
        feedback_status: 'ready',
        feedback_attempt_id: attemptId,
      })

      const result = await service.checkReadiness(interviewId, attemptId, 'ai_led')

      expect(result).toEqual({ outcome: 'reused', transcript: 'already transcribed' })
      expect(transcriptionRepository.listFinalizedAudioArtifacts).not.toHaveBeenCalled()
    })

    it('returns stale when the feedback status is no longer processing (attempt fencing)', async function run() {
      const { service, transcriptionRepository } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: null,
        feedback_status: 'failed',
        feedback_attempt_id: attemptId,
      })

      const result = await service.checkReadiness(interviewId, attemptId, 'ai_led')

      expect(result).toEqual({ outcome: 'stale' })
    })

    it('returns stale when the attempt ID no longer matches the current attempt (attempt fencing)', async function run() {
      const { service, transcriptionRepository } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: null,
        feedback_status: 'processing',
        feedback_attempt_id: 'a-newer-attempt',
      })

      const result = await service.checkReadiness(interviewId, attemptId, 'ai_led')

      expect(result).toEqual({ outcome: 'stale' })
    })

    it('returns not_ready when the required candidate track has not finalized yet (missing audio)', async function run() {
      const { service, transcriptionRepository } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: null,
        feedback_status: 'processing',
        feedback_attempt_id: attemptId,
      })
      transcriptionRepository.listFinalizedAudioArtifacts.mockResolvedValue([])

      const result = await service.checkReadiness(interviewId, attemptId, 'ai_led')

      expect(result).toEqual({ outcome: 'not_ready' })
    })

    it('returns not_ready when a finalized row exists but the R2 object is missing (not-ready audio)', async function run() {
      const { service, transcriptionRepository, storagePort } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: null,
        feedback_status: 'processing',
        feedback_attempt_id: attemptId,
      })
      transcriptionRepository.listFinalizedAudioArtifacts.mockResolvedValue([
        { participant_role: 'candidate', object_key: 'interviews/x/recording/y', finalized_at: '2026-01-01T00:00:00.000Z' },
      ])
      storagePort.headArtifact.mockResolvedValue(null)

      const result = await service.checkReadiness(interviewId, attemptId, 'ai_led')

      expect(result).toEqual({ outcome: 'not_ready' })
    })

    it('returns unsupported_format when the finalized track content type is not allowlisted', async function run() {
      const { service, transcriptionRepository, storagePort } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: null,
        feedback_status: 'processing',
        feedback_attempt_id: attemptId,
      })
      transcriptionRepository.listFinalizedAudioArtifacts.mockResolvedValue([
        { participant_role: 'candidate', object_key: 'interviews/x/recording/y', finalized_at: '2026-01-01T00:00:00.000Z' },
      ])
      storagePort.headArtifact.mockResolvedValue({ size: 1000, contentType: 'audio/webm' })

      const result = await service.checkReadiness(interviewId, attemptId, 'ai_led')

      expect(result).toEqual({ outcome: 'unsupported_format' })
    })

    it('requires both candidate and interviewer tracks for peer_to_peer mode (role attribution)', async function run() {
      const { service, transcriptionRepository, storagePort } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: null,
        feedback_status: 'processing',
        feedback_attempt_id: attemptId,
      })
      transcriptionRepository.listFinalizedAudioArtifacts.mockResolvedValue([
        { participant_role: 'candidate', object_key: 'interviews/x/recording/candidate', finalized_at: '2026-01-01T00:00:00.000Z' },
      ])
      storagePort.headArtifact.mockResolvedValue({ size: 1000, contentType: 'audio/mp4' })

      const result = await service.checkReadiness(interviewId, attemptId, 'peer_to_peer')

      // The interviewer track is missing, so the whole run is not_ready even
      // though the candidate track resolved fine.
      expect(result).toEqual({ outcome: 'not_ready' })
    })

    it('resolves distinct tracks per role when both are finalized (role attribution)', async function run() {
      const { service, transcriptionRepository, storagePort } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: null,
        feedback_status: 'processing',
        feedback_attempt_id: attemptId,
      })
      transcriptionRepository.listFinalizedAudioArtifacts.mockResolvedValue([
        { participant_role: 'candidate', object_key: 'interviews/x/recording/candidate', finalized_at: '2026-01-02T00:00:00.000Z' },
        { participant_role: 'interviewer', object_key: 'interviews/x/recording/interviewer', finalized_at: '2026-01-02T00:00:00.000Z' },
      ])
      storagePort.headArtifact.mockImplementation(async (key: string) => {
        if (key === 'interviews/x/recording/candidate') {
          return { size: 100, contentType: 'audio/mp4' }
        }
        return { size: 200, contentType: 'audio/ogg' }
      })

      const result = await service.checkReadiness(interviewId, attemptId, 'peer_to_peer')

      expect(result).toEqual({
        outcome: 'ready',
        tracks: [
          { participantRole: 'candidate', objectKey: 'interviews/x/recording/candidate', contentType: 'audio/mp4', size: 100 },
          { participantRole: 'interviewer', objectKey: 'interviews/x/recording/interviewer', contentType: 'audio/ogg', size: 200 },
        ],
      })
    })

    it('uses only the most recently finalized row per role when duplicates exist', async function run() {
      const { service, transcriptionRepository, storagePort } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: null,
        feedback_status: 'processing',
        feedback_attempt_id: attemptId,
      })
      // Rows are returned most-recent-first by the repository query.
      transcriptionRepository.listFinalizedAudioArtifacts.mockResolvedValue([
        { participant_role: 'candidate', object_key: 'interviews/x/recording/latest', finalized_at: '2026-01-03T00:00:00.000Z' },
        { participant_role: 'candidate', object_key: 'interviews/x/recording/earlier', finalized_at: '2026-01-01T00:00:00.000Z' },
      ])
      storagePort.headArtifact.mockResolvedValue({ size: 50, contentType: 'audio/mp4' })

      const result = await service.checkReadiness(interviewId, attemptId, 'ai_led')

      expect(result).toEqual({
        outcome: 'ready',
        tracks: [{ participantRole: 'candidate', objectKey: 'interviews/x/recording/latest', contentType: 'audio/mp4', size: 50 }],
      })
    })
  })

  describe('transcribeAndPersist', function transcribeAndPersistSuite() {
    it('produces a deterministic, chunk-ordered transcript for a single track', async function run() {
      const { service, chunkRepository, storagePort, adapter, transcriptionRepository } = createService({
        config: { chunkBytes: 10, overlapBytes: 0 },
      })
      chunkRepository.listChunks.mockResolvedValue([])
      storagePort.getObject.mockImplementation(async () => ({ body: bodyStream(), metadata: {} }))
      adapter.transcribeChunk
        .mockResolvedValueOnce({ text: 'the quick brown' })
        .mockResolvedValueOnce({ text: 'brown fox jumps' })
      transcriptionRepository.persistTranscript.mockResolvedValue(true)

      const result = await service.transcribeAndPersist({
        interviewId,
        attemptId,
        tracks: [{ participantRole: 'candidate', objectKey: 'key', contentType: 'audio/mp4', size: 20 }],
      })

      expect(result).toEqual({
        outcome: 'persisted',
        transcript: '[Candidate]\nthe quick brown fox jumps',
      })
      expect(adapter.transcribeChunk).toHaveBeenCalledTimes(2)
    })

    it('attributes transcribed text to the correct role section for multi-track peer_to_peer runs', async function run() {
      const { service, chunkRepository, storagePort, adapter, transcriptionRepository } = createService()
      chunkRepository.listChunks.mockResolvedValue([])
      storagePort.getObject.mockImplementation(async () => ({ body: bodyStream(), metadata: {} }))
      adapter.transcribeChunk.mockImplementation(async () => ({ text: 'track text' }))
      transcriptionRepository.persistTranscript.mockResolvedValue(true)

      const result = await service.transcribeAndPersist({
        interviewId,
        attemptId,
        tracks: [
          { participantRole: 'candidate', objectKey: 'candidate-key', contentType: 'audio/mp4', size: 10 },
          { participantRole: 'interviewer', objectKey: 'interviewer-key', contentType: 'audio/mp4', size: 10 },
        ],
      })

      expect(result).toEqual({
        outcome: 'persisted',
        transcript: '[Candidate]\ntrack text\n\n[Interviewer]\ntrack text',
      })
    })

    it('reuses an already-transcribed chunk checkpoint instead of calling the adapter again', async function run() {
      const { service, chunkRepository, storagePort, adapter, transcriptionRepository } = createService({
        config: { chunkBytes: 10, overlapBytes: 0 },
      })
      chunkRepository.listChunks.mockResolvedValue([
        chunkRow({ chunk_index: 0, status: 'transcribed', transcript_text: 'the quick brown' }),
      ])
      storagePort.getObject.mockImplementation(async () => ({ body: bodyStream(), metadata: {} }))
      adapter.transcribeChunk.mockResolvedValue({ text: 'brown fox jumps' })
      transcriptionRepository.persistTranscript.mockResolvedValue(true)

      const result = await service.transcribeAndPersist({
        interviewId,
        attemptId,
        tracks: [{ participantRole: 'candidate', objectKey: 'key', contentType: 'audio/mp4', size: 20 }],
      })

      // Only chunk index 1 (the not-yet-transcribed one) hits the adapter.
      expect(adapter.transcribeChunk).toHaveBeenCalledTimes(1)
      expect(result).toEqual({
        outcome: 'persisted',
        transcript: '[Candidate]\nthe quick brown fox jumps',
      })
    })

    it('does not re-fetch R2 bytes for a chunk that already has a checkpoint', async function run() {
      const { service, chunkRepository, storagePort, adapter, transcriptionRepository } = createService({
        config: { chunkBytes: 10, overlapBytes: 0 },
      })
      chunkRepository.listChunks.mockResolvedValue([chunkRow({ chunk_index: 0, transcript_text: 'only chunk' })])
      transcriptionRepository.persistTranscript.mockResolvedValue(true)

      const result = await service.transcribeAndPersist({
        interviewId,
        attemptId,
        tracks: [{ participantRole: 'candidate', objectKey: 'key', contentType: 'audio/mp4', size: 10 }],
      })

      expect(storagePort.getObject).not.toHaveBeenCalled()
      expect(adapter.transcribeChunk).not.toHaveBeenCalled()
      expect(result).toEqual({ outcome: 'persisted', transcript: '[Candidate]\nonly chunk' })
    })

    it('persists checkpoints with upsertChunk after each successful chunk', async function run() {
      const { service, chunkRepository, storagePort, adapter, transcriptionRepository } = createService({
        config: { chunkBytes: 10, overlapBytes: 0 },
      })
      chunkRepository.listChunks.mockResolvedValue([])
      storagePort.getObject.mockImplementation(async () => ({ body: bodyStream(), metadata: {} }))
      adapter.transcribeChunk.mockResolvedValue({ text: 'hi' })
      transcriptionRepository.persistTranscript.mockResolvedValue(true)

      await service.transcribeAndPersist({
        interviewId,
        attemptId,
        tracks: [{ participantRole: 'candidate', objectKey: 'key', contentType: 'audio/mp4', size: 10 }],
      })

      expect(chunkRepository.upsertChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          interviewId,
          attemptId,
          participantRole: 'candidate',
          chunkIndex: 0,
          status: 'transcribed',
          transcriptText: 'hi',
        }),
      )
    })

    it('marks the chunk failed and surfaces transcription_failed when the R2 object disappears mid-run', async function run() {
      const { service, chunkRepository, storagePort } = createService()
      chunkRepository.listChunks.mockResolvedValue([])
      storagePort.getObject.mockResolvedValue(null)

      const result = await service.transcribeAndPersist({
        interviewId,
        attemptId,
        tracks: [{ participantRole: 'candidate', objectKey: 'key', contentType: 'audio/mp4', size: 10 }],
      })

      expect(result).toEqual({ outcome: 'failed', error_code: 'transcription_failed' })
      expect(chunkRepository.upsertChunk).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', transcriptText: null }),
      )
    })

    it('surfaces transcription_failed after the adapter exhausts its bounded retries', async function run() {
      const { service, chunkRepository, storagePort, adapter } = createService()
      chunkRepository.listChunks.mockResolvedValue([])
      storagePort.getObject.mockImplementation(async () => ({ body: bodyStream(), metadata: {} }))
      adapter.transcribeChunk.mockRejectedValue(new Error('provider down'))

      const result = await service.transcribeAndPersist({
        interviewId,
        attemptId,
        tracks: [{ participantRole: 'candidate', objectKey: 'key', contentType: 'audio/mp4', size: 10 }],
      })

      expect(result).toEqual({ outcome: 'failed', error_code: 'transcription_failed' })
    })

    it('rejects empty/near-silent output across every required track', async function run() {
      const { service, chunkRepository, storagePort, adapter, transcriptionRepository } = createService()
      chunkRepository.listChunks.mockResolvedValue([])
      storagePort.getObject.mockImplementation(async () => ({ body: bodyStream(), metadata: {} }))
      adapter.transcribeChunk.mockResolvedValue({ text: '   ' })

      const result = await service.transcribeAndPersist({
        interviewId,
        attemptId,
        tracks: [{ participantRole: 'candidate', objectKey: 'key', contentType: 'audio/mp4', size: 10 }],
      })

      expect(result).toEqual({ outcome: 'failed', error_code: 'transcription_failed' })
      expect(transcriptionRepository.persistTranscript).not.toHaveBeenCalled()
    })

    it('reuses an existing transcript when the conditional write loses a persistence race', async function run() {
      const { service, chunkRepository, storagePort, adapter, transcriptionRepository } = createService()
      chunkRepository.listChunks.mockResolvedValue([])
      storagePort.getObject.mockImplementation(async () => ({ body: bodyStream(), metadata: {} }))
      adapter.transcribeChunk.mockResolvedValue({ text: 'hello' })
      transcriptionRepository.persistTranscript.mockResolvedValue(false)
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: 'already written by a concurrent attempt',
        feedback_status: 'processing',
        feedback_attempt_id: attemptId,
      })

      const result = await service.transcribeAndPersist({
        interviewId,
        attemptId,
        tracks: [{ participantRole: 'candidate', objectKey: 'key', contentType: 'audio/mp4', size: 10 }],
      })

      expect(result).toEqual({ outcome: 'reused', transcript: 'already written by a concurrent attempt' })
    })

    it('returns stale when the conditional write loses the race and no transcript is found either (fenced attempt was replaced)', async function run() {
      const { service, chunkRepository, storagePort, adapter, transcriptionRepository } = createService()
      chunkRepository.listChunks.mockResolvedValue([])
      storagePort.getObject.mockImplementation(async () => ({ body: bodyStream(), metadata: {} }))
      adapter.transcribeChunk.mockResolvedValue({ text: 'hello' })
      transcriptionRepository.persistTranscript.mockResolvedValue(false)
      transcriptionRepository.getTranscriptionState.mockResolvedValue(null)

      const result = await service.transcribeAndPersist({
        interviewId,
        attemptId,
        tracks: [{ participantRole: 'candidate', objectKey: 'key', contentType: 'audio/mp4', size: 10 }],
      })

      expect(result).toEqual({ outcome: 'stale' })
    })
  })

  describe('run', function runSuite() {
    it('composes readiness and transcription for a fully ready attempt', async function run() {
      const { service, transcriptionRepository, chunkRepository, storagePort, adapter } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: null,
        feedback_status: 'processing',
        feedback_attempt_id: attemptId,
      })
      transcriptionRepository.listFinalizedAudioArtifacts.mockResolvedValue([
        { participant_role: 'candidate', object_key: 'key', finalized_at: '2026-01-01T00:00:00.000Z' },
      ])
      storagePort.headArtifact.mockResolvedValue({ size: 10, contentType: 'audio/mp4' })
      chunkRepository.listChunks.mockResolvedValue([])
      storagePort.getObject.mockImplementation(async () => ({ body: bodyStream(), metadata: {} }))
      adapter.transcribeChunk.mockResolvedValue({ text: 'hi' })
      transcriptionRepository.persistTranscript.mockResolvedValue(true)

      const result = await service.run({ interviewId, attemptId, mode: 'ai_led' })

      expect(result).toEqual({ outcome: 'persisted', transcript: '[Candidate]\nhi' })
    })

    it('short-circuits with the readiness outcome when not ready', async function run() {
      const { service, transcriptionRepository } = createService()
      transcriptionRepository.getTranscriptionState.mockResolvedValue({
        transcript: null,
        feedback_status: 'processing',
        feedback_attempt_id: attemptId,
      })
      transcriptionRepository.listFinalizedAudioArtifacts.mockResolvedValue([])

      const result = await service.run({ interviewId, attemptId, mode: 'ai_led' })

      expect(result).toEqual({ outcome: 'not_ready' })
    })
  })
})
