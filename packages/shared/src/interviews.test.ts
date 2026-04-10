import { describe, expect, it } from 'vitest'
import { interviewListResponseSchema } from './interviews'

describe('interview shared contracts', function interviewSharedContractsSuite() {
  it('parses interview list payloads from documented API fields', function run() {
    const payload = {
      interviews: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          scheduler_id: '22222222-2222-4222-8222-222222222222',
          scheduler_alias: 'Candidate-Blue',
          interviewer_id: null,
          interviewer_alias: 'Interviewer-Red',
          type: 'system_design',
          mode: 'peer_to_peer',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
          created_at: '2026-04-01T10:00:00.000Z',
          updated_at: '2026-04-01T10:00:00.000Z',
        },
      ],
    }

    const parsed = interviewListResponseSchema.parse(payload)

    expect(parsed.interviews).toHaveLength(1)
    expect(parsed.interviews[0]?.scheduler_alias).toBe('Candidate-Blue')
  })

  it('rejects payloads missing alias/scheduling contract fields', function run() {
    expect(function parseInvalidPayload() {
      interviewListResponseSchema.parse({
        interviews: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            scheduler_id: '22222222-2222-4222-8222-222222222222',
            interviewer_id: null,
            type: 'system_design',
            mode: 'peer_to_peer',
            tier: 'standard',
            status: 'scheduled',
            scheduled_at: '2026-04-10T10:30:00.000Z',
            created_at: '2026-04-01T10:00:00.000Z',
            updated_at: '2026-04-01T10:00:00.000Z',
          },
        ],
      })
    }).toThrow()
  })
})
