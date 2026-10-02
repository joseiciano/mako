import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { ArtifactStoragePort } from '../interview-assets'
import type { FeedbackAnalysisAdapterPort } from './feedback-analysis-adapter'
import { DEFAULT_FEEDBACK_ANALYSIS_CONFIG, type FeedbackAnalysisConfig } from './feedback-analysis-config'
import {
  FeedbackAnalysisRepository,
  type FeedbackAnalysisStateRow,
} from './feedback-analysis-repository'
import { FeedbackAnalysisService } from './feedback-analysis-service'

const interviewId = '11111111-1111-4111-8111-111111111111'
const attemptId = 'attempt-1'

const validFeedback = {
  schema_version: 1,
  overall_score: 72,
  summary: 'Solid communication, needs more depth on scaling tradeoffs.',
  dimensions: {
    communication: { score: 80, summary: 'Clearly explained the approach throughout.' },
    problem_solving: { score: 70, summary: 'Worked through the core requirements methodically.' },
    technical_depth: { score: 65, summary: 'Missed discussing database sharding tradeoffs.' },
  },
  strengths: [{ title: 'Clear articulation', evidence: 'Explained the API contract at 00:04:12.' }],
  improvements: [
    {
      title: 'Discuss sharding tradeoffs',
      evidence: 'Did not mention sharding when scaling the write path at 00:18:30.',
      action: 'Practice comparing sharding strategies out loud before the next session.',
    },
  ],
}

function stateRow(overrides: Partial<FeedbackAnalysisStateRow> = {}): FeedbackAnalysisStateRow {
  return {
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    scheduler_alias: 'Vivid Falcon',
    transcript: '[Candidate]\nLet me design the system.',
    feedback_status: 'processing',
    feedback_attempt_id: attemptId,
    feedback: null,
    ...overrides,
  }
}

function createMockRepository() {
  return {
    getAnalysisState: vi.fn<FeedbackAnalysisRepository['getAnalysisState']>(),
    listFinalizedScreenshots: vi.fn<FeedbackAnalysisRepository['listFinalizedScreenshots']>(),
    persistReadyFeedback: vi.fn<FeedbackAnalysisRepository['persistReadyFeedback']>(),
  }
}

function createMockStoragePort() {
  return {
    headArtifact: vi.fn<ArtifactStoragePort['headArtifact']>(),
    getObject: vi.fn<ArtifactStoragePort['getObject']>(),
  }
}

function createMockAdapter() {
  return { analyze: vi.fn<FeedbackAnalysisAdapterPort['analyze']>() }
}

function createService(overrides: {
  config?: Partial<FeedbackAnalysisConfig>
  repository?: ReturnType<typeof createMockRepository>
  storagePort?: ReturnType<typeof createMockStoragePort>
  adapter?: ReturnType<typeof createMockAdapter>
  now?: () => Date
} = {}) {
  const repository = overrides.repository ?? createMockRepository()
  const storagePort = overrides.storagePort ?? createMockStoragePort()
  const adapter = overrides.adapter ?? createMockAdapter()
  const config: FeedbackAnalysisConfig = { ...DEFAULT_FEEDBACK_ANALYSIS_CONFIG, ...overrides.config }
  const now = overrides.now ?? (() => new Date('2026-01-01T00:00:00.000Z'))

  const service = new FeedbackAnalysisService(
    repository as unknown as FeedbackAnalysisRepository,
    storagePort as unknown as ArtifactStoragePort,
    adapter as unknown as FeedbackAnalysisAdapterPort,
    config,
    now,
  )

  return { service, repository, storagePort, adapter, config }
}

describe('FeedbackAnalysisService', function suite() {
  describe('staleness and readiness', function stalenessSuite() {
    it('returns stale when the interview no longer exists', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(null)

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'stale' })
      expect(adapter.analyze).not.toHaveBeenCalled()
    })

    it('returns stale when the attempt id no longer matches', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow({ feedback_attempt_id: 'different-attempt' }))

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'stale' })
      expect(adapter.analyze).not.toHaveBeenCalled()
    })

    it('returns stale when feedback_status is no longer processing', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow({ feedback_status: 'failed' }))

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'stale' })
      expect(adapter.analyze).not.toHaveBeenCalled()
    })

    it('returns not_ready when the transcript has not been persisted yet', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow({ transcript: null }))

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'not_ready' })
      expect(adapter.analyze).not.toHaveBeenCalled()
    })

    it('reuses an already-ready v1 report without calling the adapter again (idempotency)', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(
        stateRow({ feedback_status: 'ready', feedback: validFeedback }),
      )

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'reused', feedback: validFeedback })
      expect(adapter.analyze).not.toHaveBeenCalled()
      expect(repository.persistReadyFeedback).not.toHaveBeenCalled()
    })

    it('treats an already-ready row with corrupt/legacy feedback JSON as stale rather than crashing', async function run() {
      const { service, repository } = createService()
      repository.getAnalysisState.mockResolvedValue(
        stateRow({ feedback_status: 'ready', feedback: { legacy: 'freeform' } }),
      )

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'stale' })
    })
  })

  describe('valid analysis output', function validSuite() {
    it('persists the parsed and validated feedback report', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow())
      repository.listFinalizedScreenshots.mockResolvedValue([])
      repository.persistReadyFeedback.mockResolvedValue(true)
      adapter.analyze.mockResolvedValue({ content: JSON.stringify(validFeedback) })

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'persisted', feedback: validFeedback })
      expect(repository.persistReadyFeedback).toHaveBeenCalledWith({
        interviewId,
        attemptId,
        feedback: validFeedback,
        promptVersion: 'feedback-v1',
        generatedAt: '2026-01-01T00:00:00.000Z',
      })
    })

    it('tolerates a markdown code fence around the JSON content', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow())
      repository.listFinalizedScreenshots.mockResolvedValue([])
      repository.persistReadyFeedback.mockResolvedValue(true)
      adapter.analyze.mockResolvedValue({
        content: `\`\`\`json\n${JSON.stringify(validFeedback)}\n\`\`\``,
      })

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'persisted', feedback: validFeedback })
    })

    it('reuses the existing report when it loses the persistence race to a concurrent attempt', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState
        .mockResolvedValueOnce(stateRow())
        .mockResolvedValueOnce(stateRow({ feedback_status: 'ready', feedback: validFeedback }))
      repository.listFinalizedScreenshots.mockResolvedValue([])
      repository.persistReadyFeedback.mockResolvedValue(false)
      adapter.analyze.mockResolvedValue({ content: JSON.stringify(validFeedback) })

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'reused', feedback: validFeedback })
    })

    it('returns stale when the persistence write loses the race and no ready report is found on re-read', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState
        .mockResolvedValueOnce(stateRow())
        .mockResolvedValueOnce(null)
      repository.listFinalizedScreenshots.mockResolvedValue([])
      repository.persistReadyFeedback.mockResolvedValue(false)
      adapter.analyze.mockResolvedValue({ content: JSON.stringify(validFeedback) })

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'stale' })
    })
  })

  describe('invalid analysis output (rejected without persistence)', function invalidSuite() {
    it('rejects non-JSON content as invalid_feedback', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow())
      repository.listFinalizedScreenshots.mockResolvedValue([])
      adapter.analyze.mockResolvedValue({ content: 'not json at all' })

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'invalid', error_code: 'invalid_feedback' })
      expect(repository.persistReadyFeedback).not.toHaveBeenCalled()
    })

    it('rejects a partial object missing required fields as invalid_feedback', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow())
      repository.listFinalizedScreenshots.mockResolvedValue([])
      adapter.analyze.mockResolvedValue({ content: JSON.stringify({ schema_version: 1 }) })

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'invalid', error_code: 'invalid_feedback' })
      expect(repository.persistReadyFeedback).not.toHaveBeenCalled()
    })

    it('rejects an unsupported schema_version as invalid_feedback', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow())
      repository.listFinalizedScreenshots.mockResolvedValue([])
      adapter.analyze.mockResolvedValue({
        content: JSON.stringify({ ...validFeedback, schema_version: 2 }),
      })

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'invalid', error_code: 'invalid_feedback' })
      expect(repository.persistReadyFeedback).not.toHaveBeenCalled()
    })

    it('rejects an out-of-range score as invalid_feedback', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow())
      repository.listFinalizedScreenshots.mockResolvedValue([])
      adapter.analyze.mockResolvedValue({
        content: JSON.stringify({ ...validFeedback, overall_score: 150 }),
      })

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'invalid', error_code: 'invalid_feedback' })
      expect(repository.persistReadyFeedback).not.toHaveBeenCalled()
    })

    it('rejects an object with an unknown top-level key as invalid_feedback', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow())
      repository.listFinalizedScreenshots.mockResolvedValue([])
      adapter.analyze.mockResolvedValue({
        content: JSON.stringify({ ...validFeedback, recommendation: 'hire' }),
      })

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'invalid', error_code: 'invalid_feedback' })
      expect(repository.persistReadyFeedback).not.toHaveBeenCalled()
    })

    it('rejects an object with an unknown dimension key as invalid_feedback', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow())
      repository.listFinalizedScreenshots.mockResolvedValue([])
      adapter.analyze.mockResolvedValue({
        content: JSON.stringify({
          ...validFeedback,
          dimensions: { ...validFeedback.dimensions, culture_fit: { score: 50, summary: 'n/a' } },
        }),
      })

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'invalid', error_code: 'invalid_feedback' })
      expect(repository.persistReadyFeedback).not.toHaveBeenCalled()
    })
  })

  describe('provider failure handling', function providerFailureSuite() {
    it('maps a provider/timeout/terminal adapter error to a failed analysis_failed outcome without persisting', async function run() {
      const { service, repository, adapter } = createService()
      repository.getAnalysisState.mockResolvedValue(stateRow())
      repository.listFinalizedScreenshots.mockResolvedValue([])
      adapter.analyze.mockRejectedValue(new Error('AI Gateway feedback analysis timed out.'))

      const result = await service.run({ interviewId, attemptId })

      expect(result).toEqual({ outcome: 'failed', error_code: 'analysis_failed' })
      expect(repository.persistReadyFeedback).not.toHaveBeenCalled()
    })
  })

  describe('configuration readiness (Story 5.17 AC #2): transcript text plus a non-sensitive PNG fixture', function configReadinessSuite() {
    const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'pixel.png')

    it('never drops screenshot evidence from the request sent to the provider, even if `supportsVision` is misconfigured', async function run() {
      const pngBytes = readFileSync(FIXTURE_PATH)
      const { service, repository, storagePort, adapter } = createService({
        // Deliberately misconfigured to prove inclusion never depends on this flag.
        config: { supportsVision: false },
      })

      repository.getAnalysisState.mockResolvedValue(stateRow({ transcript: '[Candidate]\nLet us design a URL shortener.' }))
      repository.listFinalizedScreenshots.mockResolvedValue([
        { id: 'shot-1', object_key: 'interviews/i/screenshots/shot-1', content_type: 'image/png', content_size_bytes: pngBytes.length },
      ])
      storagePort.headArtifact.mockResolvedValue({ size: pngBytes.length, contentType: 'image/png' })
      storagePort.getObject.mockResolvedValue({
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(pngBytes))
            controller.close()
          },
        }),
        metadata: {},
      })
      repository.persistReadyFeedback.mockResolvedValue(true)
      adapter.analyze.mockResolvedValue({ content: JSON.stringify(validFeedback) })

      const result = await service.run({ interviewId, attemptId })

      expect(result.outcome).toBe('persisted')
      const sentMessages = adapter.analyze.mock.calls[0]![0]
      const userMessage = sentMessages[1]!
      const userContent = userMessage.content as Array<{ type: string; image_url?: { url: string } }>
      const imageParts = userContent.filter((part) => part.type === 'image_url')

      expect(imageParts).toHaveLength(1)
      expect(imageParts[0]!.image_url!.url).toBe(
        `data:image/png;base64,${pngBytes.toString('base64')}`,
      )
    })
  })
})
