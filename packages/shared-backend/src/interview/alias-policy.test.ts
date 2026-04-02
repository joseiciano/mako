import { describe, expect, it } from 'vitest'
import { buildInterviewAliases } from './alias-policy'

describe('buildInterviewAliases', function buildInterviewAliasesSuite() {
  it('returns deterministic aliases for peer-to-peer sessions', function shouldBuildPeerAliases() {
    expect(buildInterviewAliases('peer_to_peer')).toEqual({
      schedulerAlias: 'Candidate-Blue',
      interviewerAlias: 'Interviewer-Red',
    })
  })

  it('returns deterministic aliases for ai-led sessions', function shouldBuildAiAliases() {
    expect(buildInterviewAliases('ai_led')).toEqual({
      schedulerAlias: 'Candidate-Blue',
      interviewerAlias: 'Interviewer-Red',
    })
  })
})
