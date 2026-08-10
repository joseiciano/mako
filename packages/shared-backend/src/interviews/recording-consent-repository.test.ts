import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import {
  RecordingConsentRepository,
  type RecordingConsentRecord,
} from './recording-consent-repository'

const interviewId = '33333333-3333-4333-8333-333333333333'
const userId = '11111111-1111-4111-8111-111111111111'

function createConsentRecord(
  overrides: Partial<RecordingConsentRecord> = {},
): RecordingConsentRecord {
  return {
    interview_id: interviewId,
    user_id: userId,
    decision: 'consented',
    consent_copy_version: 'consent-copy-v1',
    decided_at: '2026-04-13T10:00:00.000Z',
    revoked_at: null,
    created_at: '2026-04-13T10:00:00.000Z',
    updated_at: '2026-04-13T10:00:00.000Z',
    ...overrides,
  }
}

function createMockQueryExecutor(
  handlers: Record<string, (query: SqlQuery) => { rows: unknown[]; rowCount: number }>,
) {
  return {
    async query<Row>(query: SqlQuery) {
      const normalized = query.text.trim().toUpperCase()

      if (
        normalized === 'BEGIN;' ||
        normalized === 'COMMIT;' ||
        normalized === 'ROLLBACK;'
      ) {
        return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
      }

      for (const [key, handler] of Object.entries(handlers)) {
        if (query.text.includes(key)) {
          return handler(query) as { rows: Row[]; rowCount: number }
        }
      }

      throw new Error(`Unexpected query: ${query.text}`)
    },
  }
}

function createInterviewRow(
  overrides: { status?: string; recording_status?: string } = {},
): { id: string; status: string; recording_status: string } {
  return {
    id: interviewId,
    status: 'scheduled',
    recording_status: 'not_started',
    ...overrides,
  }
}

describe('RecordingConsentRepository', function recordingConsentRepositorySuite() {
  it('upsertConsent records a new consent for a scheduled interview', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({ rows: [createInterviewRow()], rowCount: 1 }),
      'FROM interview_recording_consents': () => ({ rows: [], rowCount: 0 }),
      'INSERT INTO interview_recording_consents': () => ({
        rows: [createConsentRecord()],
        rowCount: 1,
      }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.upsertConsent({
      interview_id: interviewId,
      user_id: userId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })

    expect(result.outcome).toBe('recorded')
    expect(result.recording_status).toBe('not_started')
    expect(result.consent).toMatchObject({
      interview_id: interviewId,
      user_id: userId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })
  })

  it('upsertConsent is idempotent when the same decision and copy version are already recorded', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({ rows: [createInterviewRow()], rowCount: 1 }),
      'FROM interview_recording_consents': () => ({
        rows: [createConsentRecord()],
        rowCount: 1,
      }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.upsertConsent({
      interview_id: interviewId,
      user_id: userId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })

    expect(result.outcome).toBe('already_recorded')
    expect(result.consent).toMatchObject({ decision: 'consented' })
  })

  it('upsertConsent updates the decision when it changes', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({ rows: [createInterviewRow()], rowCount: 1 }),
      'FROM interview_recording_consents': () => ({
        rows: [createConsentRecord({ decision: 'declined' })],
        rowCount: 1,
      }),
      'INSERT INTO interview_recording_consents': () => ({
        rows: [createConsentRecord({ decision: 'consented' })],
        rowCount: 1,
      }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.upsertConsent({
      interview_id: interviewId,
      user_id: userId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })

    expect(result.outcome).toBe('recorded')
    expect(result.consent?.decision).toBe('consented')
  })

  it('upsertConsent returns invalid_status when recording has started', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({
        rows: [createInterviewRow({ status: 'ongoing', recording_status: 'recording' })],
        rowCount: 1,
      }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.upsertConsent({
      interview_id: interviewId,
      user_id: userId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })

    expect(result.outcome).toBe('invalid_status')
    expect(result.recording_status).toBe('recording')
  })

  it('upsertConsent returns invalid_status when interview is not scheduled or ongoing', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({
        rows: [createInterviewRow({ status: 'completed', recording_status: 'not_started' })],
        rowCount: 1,
      }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.upsertConsent({
      interview_id: interviewId,
      user_id: userId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })

    expect(result.outcome).toBe('invalid_status')
  })

  it('upsertConsent returns not_found when interview does not exist', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({ rows: [], rowCount: 0 }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.upsertConsent({
      interview_id: interviewId,
      user_id: userId,
      decision: 'consented',
      consent_copy_version: 'consent-copy-v1',
    })

    expect(result.outcome).toBe('not_found')
  })

  it('revokeConsent sets revoked_at on an active consent', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({ rows: [createInterviewRow()], rowCount: 1 }),
      'FROM interview_recording_consents': () => ({
        rows: [createConsentRecord()],
        rowCount: 1,
      }),
      'UPDATE interview_recording_consents': () => ({
        rows: [createConsentRecord({ revoked_at: '2026-04-13T11:00:00.000Z' })],
        rowCount: 1,
      }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.revokeConsent({
      interview_id: interviewId,
      user_id: userId,
    })

    expect(result.outcome).toBe('recorded')
    expect(result.consent?.revoked_at).toBe('2026-04-13T11:00:00.000Z')
  })

  it('revokeConsent is idempotent when already revoked', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({ rows: [createInterviewRow()], rowCount: 1 }),
      'FROM interview_recording_consents': () => ({
        rows: [createConsentRecord({ revoked_at: '2026-04-13T11:00:00.000Z' })],
        rowCount: 1,
      }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.revokeConsent({
      interview_id: interviewId,
      user_id: userId,
    })

    expect(result.outcome).toBe('already_revoked')
    expect(result.consent?.revoked_at).toBe('2026-04-13T11:00:00.000Z')
  })

  it('revokeConsent is a no-op when no consent has been recorded', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({ rows: [createInterviewRow()], rowCount: 1 }),
      'FROM interview_recording_consents': () => ({ rows: [], rowCount: 0 }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.revokeConsent({
      interview_id: interviewId,
      user_id: userId,
    })

    expect(result.outcome).toBe('no_consent')
    expect(result.consent).toBeUndefined()
  })

  it('revokeConsent returns invalid_status after recording has started', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({
        rows: [createInterviewRow({ recording_status: 'recording' })],
        rowCount: 1,
      }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.revokeConsent({
      interview_id: interviewId,
      user_id: userId,
    })

    expect(result.outcome).toBe('invalid_status')
    expect(result.recording_status).toBe('recording')
  })

  it('revokeConsent returns not_found when interview does not exist', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FOR UPDATE': () => ({ rows: [], rowCount: 0 }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.revokeConsent({
      interview_id: interviewId,
      user_id: userId,
    })

    expect(result.outcome).toBe('not_found')
  })

  it('getConsentForUser returns null when no consent exists', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FROM interview_recording_consents': () => ({ rows: [], rowCount: 0 }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.getConsentForUser(interviewId, userId)

    expect(result).toBeNull()
  })

  it('getConsentForUser returns the recorded consent', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'FROM interview_recording_consents': () => ({
        rows: [createConsentRecord()],
        rowCount: 1,
      }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.getConsentForUser(interviewId, userId)

    expect(result).toMatchObject({
      interview_id: interviewId,
      user_id: userId,
      decision: 'consented',
    })
  })

  it('getRecordingStatus returns the interview recording status', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'SELECT recording_status': () => ({
        rows: [{ recording_status: 'not_started' }],
        rowCount: 1,
      }),
    })

    const repository = new RecordingConsentRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.getRecordingStatus(interviewId)

    expect(result).toBe('not_started')
  })
})
